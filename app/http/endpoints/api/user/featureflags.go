package user

import (
	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/dashboard/internal/admin"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
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
}

// GetFeatureFlags evaluates the browser-visible flags for the logged-in user.
//
// Evaluation is server-side so targeting rules and the rest of the flag set stay
// private. Values are booleans or strings depending on the flag's type; the
// frontend reads them through useFeatureFlag.
func GetFeatureFlags(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	attributes := featureflags.ForDashboardUser(userId)

	// Staff tier lets internal users see a feature before anyone else. This route
	// is not under RequireAdminTier, so admin_tier is absent from ctx.Keys and the
	// tier has to be looked up. That is one query per page load, not per request in
	// a hot path, and without it every staff-targeted rule would silently never
	// match.
	if tier := admin.GetAdminTier(ctx, userId); tier != admin.AdminTierNone {
		attributes = attributes.WithStaffTier(string(tier))
	}

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

	ctx.JSON(200, flags)
}
