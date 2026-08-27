package user

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

// browserFlags is the allowlist of flags the dashboard frontend may read.
//
// Deliberately explicit rather than returning every flag. This endpoint is hit by
// every logged-in customer, so returning the whole flag set would leak the names
// of unreleased internal work to anyone opening devtools.
//
// The allowlist costs nothing in practice: a frontend-gated feature needs its UI
// code deployed anyway, so adding a key here happens in the same change. Rolling
// the flag out afterwards still needs no deploy, which is the point.
var browserFlags = []string{
	"202608_NEW_PRICING_PAGE",
	"202608_ANALYTICS_PANEL_FILTER",
	"202608_SETUP_ONBOARDING_WIZARD",
	"202608_FEATURE_PANELS",
	"202608_FEATURE_FORMS",
	"202608_FEATURE_TAGS",
	"202608_FEATURE_TEAMS",
	"202608_FEATURE_BLACKLIST",
	"202608_FEATURE_WHITELABEL",
	"202608_FEATURE_INTEGRATIONS",
	"202608_FEATURE_AUTOMATIONS",
}

// evalBrowserFlags evaluates the allowlisted flags against the given attributes.
func evalBrowserFlags(ctx *gin.Context, attributes featureflags.Attributes) map[string]any {
	flags := make(map[string]any, len(browserFlags))
	for _, key := range browserFlags {
		result := utils.FeatureFlags.Eval(ctx, key, attributes)

		// Booleans are the common case and read more naturally as `true` than as
		// the raw value, which for an unset flag would be nil.
		if result.Value == nil {
			flags[key] = result.On
			continue
		}

		flags[key] = result.Value
	}

	return flags
}

// GetFeatureFlags evaluates the browser-visible flags for chrome that isn't
// tied to one guild (sidebar, non-guild-scoped /premium routes). No guild_id
// or premium_tier attribute is available here, so guild-targeted rules never
// match on this path - use GetGuildFeatureFlags from guild-scoped pages.
//
// Evaluation is server-side so targeting rules and the rest of the flag set stay
// private. Values are booleans or strings depending on the flag's type; the
// frontend reads them through useFeatureFlag.
func GetFeatureFlags(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)
	ctx.JSON(200, evalBrowserFlags(ctx, utils.DashboardFlagAttributes(ctx, userId)))
}

// GetGuildFeatureFlags evaluates the same browser-visible flags, scoped to a
// specific guild, so "Specific servers", "Percentage of servers" and
// "Premium/Whitelabel servers" rules can match.
func GetGuildFeatureFlags(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)
	guildId := ctx.Keys["guildid"].(uint64)

	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botCtx.Token, botCtx.RateLimiter)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	attributes := utils.DashboardFlagAttributes(ctx, userId).
		WithGuild(guildId).
		WithPremiumTier(int8(premiumTier))

	ctx.JSON(200, evalBrowserFlags(ctx, attributes))
}
