package kb

import (
	"fmt"
	"strings"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type kbSettingsRequest struct {
	PrimaryBg    *int    `json:"primary_bg"`
	CardBg       *int    `json:"card_bg"`
	TextColour   *int    `json:"text_colour"`
	AccentColour *int    `json:"accent_colour"`
	LogoUrl      *string `json:"logo_url"`
	HideBranding *bool   `json:"hide_branding"`
}

type kbSettingsResponse struct {
	PrimaryBg    *int    `json:"primary_bg"`
	CardBg       *int    `json:"card_bg"`
	TextColour   *int    `json:"text_colour"`
	AccentColour *int    `json:"accent_colour"`
	LogoUrl      *string `json:"logo_url"`
	HideBranding bool    `json:"hide_branding"`
}

func settingsToResponse(s database.KBSettings) kbSettingsResponse {
	return kbSettingsResponse{
		PrimaryBg:    s.PrimaryBg,
		CardBg:       s.CardBg,
		TextColour:   s.TextColour,
		AccentColour: s.AccentColour,
		LogoUrl:      s.LogoUrl,
		HideBranding: s.HideBranding,
	}
}

// GetKBSettingsHandler returns the knowledge base customisation settings for the guild.
// GET /:id/kb/settings
func GetKBSettingsHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	settings, found, err := dbclient.Client.KBSettings.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base settings"))
		return
	}

	if !found {
		settings = database.KBSettings{GuildId: guildId}
	}

	ctx.JSON(200, settingsToResponse(settings))
}

// UpdateKBSettingsHandler updates the knowledge base customisation settings.
// PATCH /:id/kb/settings
func UpdateKBSettingsHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body kbSettingsRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	// Check premium tier
	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, false, botCtx.Token, botCtx.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to verify premium status. Please try again."))
		return
	}

	if premiumTier == premium.None {
		ctx.JSON(402, utils.ErrorStr("Premium required to customise your knowledge base"))
		return
	}

	// Validate colour values
	if err := validateColour("primary_bg", body.PrimaryBg); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}
	if err := validateColour("card_bg", body.CardBg); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}
	if err := validateColour("text_colour", body.TextColour); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}
	if err := validateColour("accent_colour", body.AccentColour); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}

	// Validate logo URL
	if body.LogoUrl != nil && *body.LogoUrl != "" {
		if !strings.HasPrefix(*body.LogoUrl, "https://") {
			ctx.JSON(400, utils.ErrorStr("Logo URL must start with https://"))
			return
		}
		if len(*body.LogoUrl) > 512 {
			ctx.JSON(400, utils.ErrorStr("Logo URL must be 512 characters or fewer"))
			return
		}
	}

	// Fetch existing settings (or defaults)
	existing, found, err := dbclient.Client.KBSettings.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base settings"))
		return
	}

	if !found {
		existing = database.KBSettings{GuildId: guildId}
	}

	oldSettings := existing

	// Overwrite all fields from the request - null means "clear/reset to default"
	existing.PrimaryBg = body.PrimaryBg
	existing.CardBg = body.CardBg
	existing.TextColour = body.TextColour
	existing.AccentColour = body.AccentColour
	if body.LogoUrl != nil && *body.LogoUrl == "" {
		existing.LogoUrl = nil
	} else {
		existing.LogoUrl = body.LogoUrl
	}
	if body.HideBranding != nil {
		existing.HideBranding = *body.HideBranding
	}

	if err := dbclient.Client.KBSettings.Set(ctx, existing); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to save knowledge base settings"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionKBSettingsUpdate,
		ResourceType: database.AuditResourceKBSettings,
		OldData:      oldSettings,
		NewData:      existing,
	})

	ctx.JSON(200, settingsToResponse(existing))
}

func validateColour(field string, value *int) error {
	if value == nil {
		return nil
	}
	if *value < 0x000000 || *value > 0xFFFFFF {
		return fmt.Errorf("%s must be a valid colour value between 0x000000 and 0xFFFFFF", field)
	}
	return nil
}
