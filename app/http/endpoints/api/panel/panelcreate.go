package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/app/http/validation"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/guild/emoji"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v4"
)

const freePanelLimit = 3

type panelBody struct {
	ChannelId                 uint64                            `json:"channel_id,string"`
	MessageId                 uint64                            `json:"message_id,string"`
	Title                     string                            `json:"title"`
	Content                   string                            `json:"content"`
	Colour                    uint32                            `json:"colour"`
	CategoryId                uint64                            `json:"category_id,string"`
	Emoji                     types.Emoji                       `json:"emote"`
	WelcomeMessage            *types.CustomEmbed                `json:"welcome_message" validate:"omitempty,dive"`
	Mentions                  []string                          `json:"mentions"`
	WithDefaultTeam           bool                              `json:"default_team"`
	Teams                     []int                             `json:"teams"`
	ImageUrl                  *string                           `json:"image_url,omitempty"`
	ThumbnailUrl              *string                           `json:"thumbnail_url,omitempty"`
	ButtonStyle               component.ButtonStyle             `json:"button_style,string"`
	ButtonLabel               string                            `json:"button_label"`
	FormId                    *int                              `json:"form_id"`
	NamingScheme              *string                           `json:"naming_scheme"`
	Disabled                  bool                              `json:"disabled"`
	ExitSurveyFormId          *int                              `json:"exit_survey_form_id"`
	AccessControlList         []database.PanelAccessControlRule `json:"access_control_list"`
	PendingCategory           *uint64                           `json:"pending_category,string"`
	DeleteMentions            bool                              `json:"delete_mentions"`
	TranscriptChannelId       *uint64                           `json:"transcript_channel_id,string"`
	UseThreads                bool                              `json:"use_threads"`
	TicketNotificationChannel *uint64                           `json:"ticket_notification_channel,string"`
	CooldownSeconds           int                               `json:"cooldown_seconds"`
}

func (p *panelBody) IntoPanelMessageData(customId string, isPremium bool) panelMessageData {
	return panelMessageData{
		ChannelId:      p.ChannelId,
		Title:          p.Title,
		Content:        p.Content,
		CustomId:       customId,
		Colour:         int(p.Colour),
		ImageUrl:       p.ImageUrl,
		ThumbnailUrl:   p.ThumbnailUrl,
		Emoji:          p.getEmoji(),
		ButtonStyle:    p.ButtonStyle,
		ButtonLabel:    p.ButtonLabel,
		ButtonDisabled: p.Disabled,
		IsPremium:      isPremium,
	}
}

var validate = validator.New()

func CreatePanel(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	var data panelBody

	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	data.MessageId = 0

	// Check panel quota
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify premium status"))
		return
	}

	if premiumTier == premium.None {
		panels, err := dbclient.Client.Panel.GetByGuild(c, guildId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch existing panels"))
			return
		}

		if len(panels) >= freePanelLimit {
			c.JSON(402, utils.ErrorStr("Panel quota exceeded: You have %d/%d panels. Purchase premium to unlock more panels.", len(panels), freePanelLimit))
			return
		}
	}

	// Apply defaults
	ApplyPanelDefaults(&data)

	ctx, cancel := app.DefaultContext()
	defer cancel()

	channels, err := botContext.GetGuildChannels(ctx, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch guild channels from Discord"))
		return
	}

	roles, err := botContext.GetGuildRoles(ctx, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to load roles from Discord. Please try again."))
		return
	}

	// Do custom validation
	validationContext := PanelValidationContext{
		Data:       data,
		GuildId:    guildId,
		IsPremium:  premiumTier > premium.None,
		BotContext: botContext,
		Channels:   channels,
		Roles:      roles,
	}

	if err := ValidatePanelBody(validationContext); err != nil {
		var validationError *validation.InvalidInputError
		if errors.As(err, &validationError) {
			c.JSON(400, utils.ErrorStr(validationError.Error()))
		} else {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Panel validation failed unexpectedly"))
		}

		return
	}

	// Do tag validation
	if err := validate.Struct(data); err != nil {
		var validationErrors validator.ValidationErrors
		if ok := errors.As(err, &validationErrors); !ok {
			c.JSON(500, utils.ErrorStr("An error occurred while validating the panel structure"))
			return
		}

		formatted := "Your input contained the following errors:\n" + utils.FormatValidationErrors(validationErrors)
		c.JSON(400, utils.ErrorStr(formatted))
		return
	}

	customId, err := utils.RandString(30)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to generate unique panel ID"))
		return
	}

	messageData := data.IntoPanelMessageData(customId, premiumTier > premium.None)
	msgId, err := messageData.send(botContext)
	if err != nil {
		var unwrapped request.RestError
		if errors.As(err, &unwrapped) {
			if unwrapped.StatusCode == http.StatusForbidden {
				c.JSON(400, utils.ErrorStr("Bot does not have permission to send messages in channel %d", data.ChannelId))
			} else {
				c.JSON(400, utils.ErrorStr("Failed to send panel message to channel %d: %s", data.ChannelId, unwrapped.ApiError.Message))
			}
		} else {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to send panel message to Discord"))
		}

		return
	}

	var emojiId *uint64
	var emojiName *string
	{
		emoji := data.getEmoji()
		if emoji != nil {
			emojiName = &emoji.Name

			if emoji.Id.Value != 0 {
				emojiId = &emoji.Id.Value
			}
		}
	}

	// Store welcome message embed first
	var welcomeMessageEmbed *int
	if data.WelcomeMessage != nil {
		embed, fields := data.WelcomeMessage.IntoDatabaseStruct()
		embed.GuildId = guildId

		id, err := dbclient.Client.Embeds.CreateWithFields(c, embed, fields)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save welcome message embed to database"))
			return
		}

		welcomeMessageEmbed = &id
	}

	// Store in DB
	panel := database.Panel{
		MessageId:                 msgId,
		ChannelId:                 data.ChannelId,
		GuildId:                   guildId,
		Title:                     data.Title,
		Content:                   data.Content,
		Colour:                    int32(data.Colour),
		TargetCategory:            data.CategoryId,
		EmojiId:                   emojiId,
		EmojiName:                 emojiName,
		WelcomeMessageEmbed:       welcomeMessageEmbed,
		WithDefaultTeam:           data.WithDefaultTeam,
		CustomId:                  customId,
		ImageUrl:                  data.ImageUrl,
		ThumbnailUrl:              data.ThumbnailUrl,
		ButtonStyle:               int(data.ButtonStyle),
		ButtonLabel:               data.ButtonLabel,
		FormId:                    data.FormId,
		NamingScheme:              data.NamingScheme,
		ForceDisabled:             false,
		Disabled:                  data.Disabled,
		ExitSurveyFormId:          data.ExitSurveyFormId,
		PendingCategory:           data.PendingCategory,
		DeleteMentions:            data.DeleteMentions,
		TranscriptChannelId:       data.TranscriptChannelId,
		UseThreads:                data.UseThreads,
		TicketNotificationChannel: data.TicketNotificationChannel,
		CooldownSeconds:           data.CooldownSeconds,
	}

	createOptions := panelCreateOptions{
		TeamIds:            data.Teams,             // Already validated
		AccessControlRules: data.AccessControlList, // Already validated
	}

	// insert role mention data
	// string is role ID or "user" to mention the ticket opener or "here" to mention @here
	validRoles := utils.ToSet(utils.Map(roles, utils.RoleToId))

	var roleMentions []uint64
	for _, mention := range data.Mentions {
		if mention == "user" {
			createOptions.ShouldMentionUser = true
		} else if mention == "here" {
			createOptions.ShouldMentionHere = true
		} else {
			roleId, err := strconv.ParseUint(mention, 10, 64)
			if err != nil {
				c.JSON(400, utils.ErrorStr("Invalid role ID in mentions: %s", mention))
				return
			}

			if validRoles.Contains(roleId) {
				createOptions.RoleMentions = append(roleMentions, roleId)
			}
		}
	}

	panelId, err := storePanel(c, panel, createOptions)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save panel to database"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionPanelCreate,
		ResourceType: database.AuditResourcePanel,
		ResourceId:   audit.StringPtr(strconv.Itoa(panelId)),
		NewData:      data,
	})

	c.JSON(200, gin.H{
		"success":  true,
		"panel_id": panelId,
	})
}

// DB functions

type panelCreateOptions struct {
	ShouldMentionUser  bool
	ShouldMentionHere  bool
	RoleMentions       []uint64
	TeamIds            []int
	AccessControlRules []database.PanelAccessControlRule
}

func storePanel(ctx context.Context, panel database.Panel, options panelCreateOptions) (int, error) {
	var panelId int
	err := dbclient.Client.Panel.BeginFunc(ctx, func(tx pgx.Tx) error {
		var err error
		panelId, err = dbclient.Client.Panel.CreateWithTx(ctx, tx, panel)
		if err != nil {
			return err
		}

		if err := dbclient.Client.PanelUserMention.SetWithTx(ctx, tx, panelId, options.ShouldMentionUser); err != nil {
			return err
		}

		if err := dbclient.Client.PanelHereMention.SetWithTx(ctx, tx, panelId, options.ShouldMentionHere); err != nil {
			return err
		}

		if err := dbclient.Client.PanelRoleMentions.ReplaceWithTx(ctx, tx, panelId, options.RoleMentions); err != nil {
			return err
		}

		// Already validated, we are safe to insert
		if err := dbclient.Client.PanelTeams.ReplaceWithTx(ctx, tx, panelId, options.TeamIds); err != nil {
			return err
		}

		if err := dbclient.Client.PanelAccessControlRules.ReplaceWithTx(ctx, tx, panelId, options.AccessControlRules); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return 0, err
	}

	return panelId, nil
}

// Data must be validated before calling this function
func (p *panelBody) getEmoji() *emoji.Emoji {
	return p.Emoji.IntoGdl()
}
