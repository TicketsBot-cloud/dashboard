package utils

import (
	"context"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/ticketsbot-cloud/dashboard/backend/internal/admin"
)

// FeatureFlags is assigned once during startup. Reading it before assignment is
// safe: the client's methods tolerate a nil receiver, which is treated the same
// as "GrowthBook not configured" and evaluates every flag to enabled.
var FeatureFlags *featureflags.Client

// ExposureRecorder is retained so shutdown can flush whatever is queued.
var ExposureRecorder *featureflags.Recorder

// DashboardFlagAttributes builds targeting attributes for a logged-in dashboard user.
// Handler guards must use this so their verdict matches what /user/feature-flags told the
// browser; without the staff tier a staff-targeted feature renders and then 503s.
func DashboardFlagAttributes(ctx context.Context, userId uint64) featureflags.Attributes {
	attributes := featureflags.ForDashboardUser(userId)

	if tier := admin.GetAdminTier(ctx, userId); tier != admin.AdminTierNone {
		attributes = attributes.WithStaffTier(string(tier))
	}

	return attributes
}
