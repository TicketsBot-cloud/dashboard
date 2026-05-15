package gallery

import (
	stdjson "encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/guild/emoji"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

const freePanelLimit = 3

type importBody struct {
	ChannelId  *uint64 `json:"channel_id,string"`
	CategoryId *uint64 `json:"category_id,string"`
}

// ImportHandler handles POST /api/:id/gallery/import/:listingId
// Imports a gallery listing as a new panel in the guild.
func ImportHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	listingId, err := strconv.Atoi(ctx.Param("listingId"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing ID"))
		return
	}

	var body importBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		// Body is optional; both fields are optional
		body = importBody{}
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	// Check panel quota
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify premium status"))
		return
	}

	if premiumTier == premium.None {
		panels, err := dbclient.Client.Panel.GetByGuild(ctx, guildId)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch existing panels"))
			return
		}

		if len(panels) >= freePanelLimit {
			ctx.JSON(http.StatusPaymentRequired, utils.ErrorStr("Panel quota exceeded: You have %d/%d panels. Purchase premium to unlock more panels.", len(panels), freePanelLimit))
			return
		}
	}

	// Fetch the gallery listing
	listing, ok, err := dbclient.Client.GalleryListings.GetById(ctx, listingId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listing"))
		return
	}

	if !ok || listing.Status != database.GalleryListingStatusApproved {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Gallery listing not found or not approved"))
		return
	}

	// Generate a unique custom ID for the new panel
	customId, err := utils.RandString(30)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to generate unique panel ID"))
		return
	}

	// Determine target category for tickets
	var targetCategory uint64
	if body.CategoryId != nil {
		targetCategory = *body.CategoryId
	}

	// Build the panel struct from the gallery listing template
	buttonStyle := 1
	if listing.ButtonStyle != nil {
		buttonStyle = int(*listing.ButtonStyle)
	}

	panel := database.Panel{
		ChannelId:                 0, // Will be set if we send a message
		GuildId:                   guildId,
		Title:                     listing.Title,
		Content:                   listing.Content,
		Colour:                    listing.Colour,
		TargetCategory:            targetCategory,
		EmojiName:                 listing.EmojiName,
		EmojiId:                   nil, // Gallery listings only support Unicode emojis
		WithDefaultTeam:           true,
		CustomId:                  customId,
		ImageUrl:                  listing.ImageUrl,
		ThumbnailUrl:              listing.ThumbnailUrl,
		ButtonStyle:               buttonStyle,
		ButtonLabel:               listing.ButtonLabel,
		NamingScheme:              nil, // Use server default
		ForceDisabled:             false,
		Disabled:                  false,
		CooldownSeconds:           0,
		TicketLimit:               nil,
		MentionBehaviour:          "none",
		UseThreads:                false,
		HideCloseButton:           false,
		HideCloseWithReasonButton: false,
		HideClaimButton:           false,
	}

	// Store the welcome message embed if one exists in the listing
	if len(listing.WelcomeMessage) > 0 {
		var customEmbed database.CustomEmbed
		if err := stdjson.Unmarshal(listing.WelcomeMessage, &customEmbed); err == nil {
			customEmbed.GuildId = guildId
			embedId, err := dbclient.Client.Embeds.CreateWithFields(ctx, &customEmbed, nil)
			if err != nil {
				_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save welcome message embed"))
				return
			}
			panel.WelcomeMessageEmbed = &embedId
		}
	}

	// If a channel ID is provided, send the panel message to Discord
	var messageId uint64
	if body.ChannelId != nil {
		panel.ChannelId = *body.ChannelId

		var emote *emoji.Emoji
		if panel.EmojiName != nil {
			if panel.EmojiId == nil {
				emote = &emoji.Emoji{
					Name: *panel.EmojiName,
				}
			} else {
				emote = &emoji.Emoji{
					Id:   objects.NewNullableSnowflake(*panel.EmojiId),
					Name: *panel.EmojiName,
				}
			}
		}

		e := embed.NewEmbed().
			SetTitle(panel.Title).
			SetDescription(panel.Content).
			SetColor(int(panel.Colour))

		if panel.ImageUrl != nil {
			e.SetImage(*panel.ImageUrl)
		}

		if panel.ThumbnailUrl != nil {
			e.SetThumbnail(*panel.ThumbnailUrl)
		}

		data := rest.CreateMessageData{
			Embeds: []*embed.Embed{e},
			Components: []component.Component{
				component.BuildActionRow(component.BuildButton(component.Button{
					Label:    panel.ButtonLabel,
					CustomId: panel.CustomId,
					Style:    component.ButtonStyle(panel.ButtonStyle),
					Emoji:    emote,
					Disabled: false,
				})),
			},
		}

		sendCtx, cancel := app.DefaultContext()
		defer cancel()

		msg, err := rest.CreateMessage(sendCtx, botContext.Token, botContext.RateLimiter, *body.ChannelId, data)
		if err != nil {
			_ = app.NewError(err, "Failed to send panel message to Discord channel")
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Failed to send panel message to the selected channel. Please check the bot has permission to post in that channel."))
			return
		}

		messageId = msg.Id
	}

	panel.MessageId = messageId

	// Store the panel in the database
	var panelId int
	if err := dbclient.Client.Panel.BeginFunc(ctx, func(tx pgx.Tx) error {
		var err error
		panelId, err = dbclient.Client.Panel.CreateWithTx(ctx, tx, panel)
		return err
	}); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save panel to database"))
		return
	}

	// Increment the import count on the gallery listing
	if err := dbclient.Client.GalleryListings.IncrementImportCount(ctx, listingId); err != nil {
		// Non-fatal: log but don't fail the request
		_ = app.NewError(err, "Failed to increment gallery listing import count")
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionGalleryImport,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		NewData: map[string]any{
			"panel_id":   panelId,
			"listing_id": listingId,
			"channel_id": fmt.Sprintf("%d", utils.ValueOrZero(body.ChannelId)),
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"success":  true,
		"panel_id": panelId,
	})
}
