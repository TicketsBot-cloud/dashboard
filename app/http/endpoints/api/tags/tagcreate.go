package api

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/interaction"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

type tag struct {
	Id              string             `json:"id" validate:"required,min=1,max=16"`
	UseGuildCommand bool               `json:"use_guild_command"`
	Content         *string            `json:"content" validate:"omitempty,min=1,max=2000"`
	UseEmbed        bool               `json:"use_embed"`
	Embed           *types.CustomEmbed `json:"embed" validate:"omitempty,dive"`
}

var (
	validate          = validator.New()
	slashCommandRegex = regexp.MustCompile(`^[-_a-zA-Z0-9]{1,32}$`)
)

func CreateTag(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	// Max of 200 tags
	count, err := dbclient.Client.Tag.GetTagCount(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr(fmt.Sprintf("Failed to fetch tag from database: %v", err)))
		return
	}

	if count >= 200 {
		ctx.JSON(400, utils.ErrorStr("Tag limit (200) reached"))
		return
	}

	var data tag
	if err := ctx.ShouldBindJSON(&data); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	data.Id = strings.ToLower(data.Id)

	if !data.UseEmbed {
		data.Embed = nil
	}

	// Convert empty strings to nil for optional embed fields
	if data.Embed != nil {
		cleanEmbedFields(data.Embed)
	}

	// TODO: Limit command amount
	if err := validate.Struct(data); err != nil {
		var validationErrors validator.ValidationErrors
		if ok := errors.As(err, &validationErrors); !ok {
			ctx.JSON(500, utils.ErrorStr("An error occurred while validating the integration"))
			return
		}

		formatted := "Your input contained the following errors:\n" + utils.FormatValidationErrors(validationErrors)
		ctx.JSON(400, utils.ErrorStr(formatted))
		return
	}

	if !data.verifyId() {
		ctx.JSON(400, utils.ErrorStr("Tag IDs must be alphanumeric (including hyphens and underscores), and be between 1 and 16 characters long"))
		return
	}

	if !data.verifyContent() {
		ctx.JSON(400, utils.ErrorStr("You have not provided any content for the tag"))
		return
	}

	// Validate total embed character count
	if data.Embed != nil {
		totalChars := data.Embed.TotalCharacterCount()
		if totalChars > 6000 {
			ctx.JSON(400, utils.ErrorStr(fmt.Sprintf("Total embed characters (%d) exceeds Discord's 6000 character limit", totalChars)))
			return
		}
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	if data.UseGuildCommand {
		premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botContext.Token, botContext.RateLimiter)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Unable to verify premium status. Please try again."))
			return
		}

		if premiumTier < premium.Premium {
			ctx.JSON(400, utils.ErrorStr("Premium is required to use custom commands"))
			return
		}
	}

	var embed *database.CustomEmbedWithFields
	if data.Embed != nil {
		customEmbed, fields := data.Embed.IntoDatabaseStruct()
		embed = &database.CustomEmbedWithFields{
			CustomEmbed: customEmbed,
			Fields:      fields,
		}
	}

	var applicationCommandId *uint64
	if data.UseGuildCommand {
		cmd, err := botContext.CreateGuildCommand(ctx, guildId, rest.CreateCommandData{
			Name:        data.Id,
			Description: fmt.Sprintf("Alias for /tag %s", data.Id),
			Options:     nil,
			Type:        interaction.ApplicationCommandTypeChatInput,
		})

		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to create tag. Please try again."))
			return
		}

		applicationCommandId = &cmd.Id
	}

	wrapped := database.Tag{
		Id:                   data.Id,
		GuildId:              guildId,
		Content:              data.Content,
		Embed:                embed,
		ApplicationCommandId: applicationCommandId,
	}

	if err := dbclient.Client.Tag.Set(ctx, wrapped); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to create tag. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTagCreate,
		ResourceType: database.AuditResourceTag,
		ResourceId:   audit.StringPtr(data.Id),
		NewData:      data,
	})
	ctx.Status(204)
}

func (t *tag) verifyId() bool {
	if len(t.Id) == 0 || len(t.Id) > 16 || strings.Contains(t.Id, " ") {
		return false
	}

	if t.UseGuildCommand {
		return slashCommandRegex.MatchString(t.Id)
	} else {
		return true
	}
}

func (t *tag) verifyContent() bool {
	if t.Content != nil { // validator ensures that if this is not nil, > 0 length
		return true
	}

	if t.Embed != nil {
		if t.Embed.Description != nil || len(t.Embed.Fields) > 0 || t.Embed.ImageUrl != nil || t.Embed.ThumbnailUrl != nil {
			return true
		}
	}

	return false
}

// cleanEmbedFields converts empty strings to nil for optional embed fields
func cleanEmbedFields(embed *types.CustomEmbed) {
	// Clean main embed fields
	if embed.Title != nil && *embed.Title == "" {
		embed.Title = nil
	}
	if embed.Description != nil && *embed.Description == "" {
		embed.Description = nil
	}
	if embed.Url != nil && *embed.Url == "" {
		embed.Url = nil
	}
	if embed.ImageUrl != nil && *embed.ImageUrl == "" {
		embed.ImageUrl = nil
	}
	if embed.ThumbnailUrl != nil && *embed.ThumbnailUrl == "" {
		embed.ThumbnailUrl = nil
	}

	// Clean author fields
	if embed.Author.Name != nil && *embed.Author.Name == "" {
		embed.Author.Name = nil
	}
	if embed.Author.IconUrl != nil && *embed.Author.IconUrl == "" {
		embed.Author.IconUrl = nil
	}
	if embed.Author.Url != nil && *embed.Author.Url == "" {
		embed.Author.Url = nil
	}

	// Clean footer fields
	if embed.Footer.Text != nil && *embed.Footer.Text == "" {
		embed.Footer.Text = nil
	}
	if embed.Footer.IconUrl != nil && *embed.Footer.IconUrl == "" {
		embed.Footer.IconUrl = nil
	}
}
