package featureflags

import (
	"errors"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/growthbook"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type toggleBody struct {
	Environment string `json:"environment"`
	Enabled     *bool  `json:"enabled"`
	Reason      string `json:"reason"`
}

// maxReasonLength bounds what gets forwarded upstream and stored in the audit log.
const maxReasonLength = 500

// ToggleHandler enables or disables one flag in one environment. This is the kill
// switch, so it is deliberately the only write this API exposes.
func ToggleHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)

	featureKey := ctx.Param("key")
	if featureKey == "" {
		ctx.JSON(400, utils.ErrorStr("A flag key is required."))
		return
	}

	var body toggleBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if body.Enabled == nil {
		ctx.JSON(400, utils.ErrorStr("Specify whether the flag should be enabled."))
		return
	}

	// Environment names come from GrowthBook, so validate against what it
	// actually has rather than trusting the client. This also stops a typo
	// silently creating nothing and reporting success.
	if body.Environment == "" {
		ctx.JSON(400, utils.ErrorStr("An environment is required."))
		return
	}

	if len(body.Reason) > maxReasonLength {
		ctx.JSON(400, utils.ErrorStr("Reason is too long."))
		return
	}

	features, err := Client.ListFeatures(ctx)
	if err != nil {
		if errors.Is(err, growthbook.ErrNotConfigured) {
			ctx.JSON(503, utils.ErrorStr("Feature flags are not configured for this environment."))
			return
		}

		logUpstreamError("list features for toggle", err)
		ctx.JSON(502, utils.ErrorStr("Could not reach GrowthBook. Please try again."))
		return
	}

	var target *growthbook.Feature
	for i := range features {
		if features[i].Id == featureKey {
			target = &features[i]
			break
		}
	}

	if target == nil {
		ctx.JSON(404, utils.ErrorStr("That flag does not exist."))
		return
	}

	current, ok := target.Environments[body.Environment]
	if !ok {
		ctx.JSON(400, utils.ErrorStr("That flag does not have the requested environment."))
		return
	}

	if current.Enabled == *body.Enabled {
		// Nothing to do. Returning early keeps the audit log free of entries that
		// record no change.
		ctx.Status(204)
		return
	}

	if err := Client.ToggleFeature(ctx, featureKey, map[string]bool{
		body.Environment: *body.Enabled,
	}, body.Reason); err != nil {
		logUpstreamError("toggle feature", err)
		ctx.JSON(502, utils.ErrorStr("Could not update the flag in GrowthBook. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionFeatureFlagToggle,
		ResourceType: dbmodel.AuditResourceFeatureFlag,
		ResourceId:   audit.StringPtr(featureKey),
		OldData: map[string]any{
			"environment": body.Environment,
			"enabled":     current.Enabled,
		},
		NewData: map[string]any{
			"environment": body.Environment,
			"enabled":     *body.Enabled,
			"reason":      body.Reason,
		},
	})

	ctx.Status(204)
}
