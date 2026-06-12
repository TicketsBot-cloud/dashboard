package kb

import (
	"fmt"
	"net"
	"regexp"
	"strings"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/app/http/middleware"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

var hostnameRegex = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$`)

type kbSettingsRequest struct {
	PrimaryBg    *int    `json:"primary_bg"`
	CardBg       *int    `json:"card_bg"`
	TextColour   *int    `json:"text_colour"`
	AccentColour *int    `json:"accent_colour"`
	LogoUrl      *string `json:"logo_url"`
	HideBranding *bool   `json:"hide_branding"`
	CustomDomain *string `json:"custom_domain"`
}

type kbSettingsResponse struct {
	PrimaryBg      *int    `json:"primary_bg"`
	CardBg         *int    `json:"card_bg"`
	TextColour     *int    `json:"text_colour"`
	AccentColour   *int    `json:"accent_colour"`
	LogoUrl        *string `json:"logo_url"`
	HideBranding   bool    `json:"hide_branding"`
	CustomDomain   *string `json:"custom_domain"`
	DomainVerified bool    `json:"domain_verified"`
}

func settingsToResponse(s database.KBSettings) kbSettingsResponse {
	return kbSettingsResponse{
		PrimaryBg:      s.PrimaryBg,
		CardBg:         s.CardBg,
		TextColour:     s.TextColour,
		AccentColour:   s.AccentColour,
		LogoUrl:        s.LogoUrl,
		HideBranding:   s.HideBranding,
		CustomDomain:   s.CustomDomain,
		DomainVerified: s.DomainVerified,
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

	// Custom domains require whitelabel tier
	if body.CustomDomain != nil && *body.CustomDomain != "" && premiumTier < premium.Whitelabel {
		ctx.JSON(402, utils.ErrorStr("Whitelabel required for custom domains"))
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

	// Validate custom domain
	if body.CustomDomain != nil && *body.CustomDomain != "" {
		domain := strings.ToLower(*body.CustomDomain)
		body.CustomDomain = &domain

		if len(domain) > 253 {
			ctx.JSON(400, utils.ErrorStr("Custom domain must be 253 characters or fewer"))
			return
		}
		if !hostnameRegex.MatchString(domain) {
			ctx.JSON(400, utils.ErrorStr("Invalid custom domain format. Please provide a valid hostname without a protocol."))
			return
		}

		// Check domain uniqueness - no other guild should have this domain
		existingGuildId, claimed, err := dbclient.Client.KBSettings.GetGuildByDomain(ctx, domain)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to check domain availability"))
			return
		}
		if claimed && existingGuildId != guildId {
			ctx.JSON(409, utils.ErrorStr("This domain is already in use by another server"))
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
	if body.CustomDomain != nil {
		oldDomain := ""
		if existing.CustomDomain != nil {
			oldDomain = *existing.CustomDomain
		}

		newDomain := *body.CustomDomain
		if newDomain == "" {
			existing.CustomDomain = nil
			existing.DomainVerified = false
		} else {
			existing.CustomDomain = body.CustomDomain
			// Reset domain_verified if the domain changed
			if newDomain != oldDomain {
				existing.DomainVerified = false
			}
		}
	}

	if err := dbclient.Client.KBSettings.Set(ctx, existing); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to save knowledge base settings"))
		return
	}

	// Refresh CORS cache if custom domain changed
	if body.CustomDomain != nil {
		refreshVerifiedDomainCache(ctx)
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

// VerifyDomainHandler verifies the custom domain CNAME record.
// POST /:id/kb/settings/verify-domain
func VerifyDomainHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	// Check whitelabel tier
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

	if premiumTier < premium.Whitelabel {
		ctx.JSON(402, utils.ErrorStr("Whitelabel required for custom domains"))
		return
	}

	settings, found, err := dbclient.Client.KBSettings.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base settings"))
		return
	}

	if !found || settings.CustomDomain == nil || *settings.CustomDomain == "" {
		ctx.JSON(400, utils.ErrorStr("No custom domain configured"))
		return
	}

	kbDomain := config.Conf.Server.KBBaseUrl
	if kbDomain == "" {
		kbDomain = "kb.tickets.bot"
	} else {
		kbDomain = strings.TrimPrefix(strings.TrimPrefix(kbDomain, "https://"), "http://")
	}

	cname, err := net.LookupCNAME(*settings.CustomDomain)
	if err != nil || !strings.HasSuffix(cname, kbDomain+".") {
		ctx.JSON(400, gin.H{
			"verified": false,
			"message":  fmt.Sprintf("CNAME record not found. Please add a CNAME record pointing your domain to %s and try again.", kbDomain),
		})
		return
	}

	settings.DomainVerified = true
	if err := dbclient.Client.KBSettings.Set(ctx, settings); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to save domain verification status"))
		return
	}

	// Refresh CORS cache with the newly verified domain
	refreshVerifiedDomainCache(ctx)

	ctx.JSON(200, gin.H{
		"verified": true,
	})
}

func refreshVerifiedDomainCache(ctx *gin.Context) {
	domains, err := dbclient.Client.KBSettings.GetAllVerifiedDomains(ctx)
	if err != nil {
		return // Non-fatal - cache will be stale until next restart
	}
	middleware.RefreshVerifiedDomains(domains)
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
