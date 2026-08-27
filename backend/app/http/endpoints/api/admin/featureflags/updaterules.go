package featureflags

import (
	"errors"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/growthbook"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

// maxRulesPerEnvironment bounds a single write. Ordered rule lists get hard to
// reason about long before this, and it stops a malformed client sending thousands.
const maxRulesPerEnvironment = 50

type updateRulesBody struct {
	// Rules is the complete desired list, in evaluation order. GrowthBook
	// replaces the array wholesale, so a partial list would delete the rest.
	Rules []Rule `json:"rules"`
	// ExpectedUpdatedAt is the flag's updated_at as the browser last saw it.
	// Required: without it a stale tab could silently overwrite newer rules,
	// which is the one way this editor could lose someone's work.
	ExpectedUpdatedAt string `json:"expected_updated_at"`
	Reason            string `json:"reason"`
}

func UpdateRulesHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)

	featureKey := ctx.Param("key")
	environment := ctx.Param("environment")
	if featureKey == "" || environment == "" {
		ctx.JSON(400, utils.ErrorStr("A flag key and environment are required."))
		return
	}

	var body updateRulesBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if len(body.Rules) > maxRulesPerEnvironment {
		ctx.JSON(400, utils.ErrorStr("Too many rules for one environment."))
		return
	}

	if len(body.Reason) > maxReasonLength {
		ctx.JSON(400, utils.ErrorStr("Reason is too long."))
		return
	}

	if body.ExpectedUpdatedAt == "" {
		ctx.JSON(400, utils.ErrorStr("Reload the page and try again."))
		return
	}

	// Read current state immediately before writing, both to validate the
	// environment exists and to detect a concurrent edit.
	current, err := Client.GetFeature(ctx, featureKey)
	if err != nil {
		if errors.Is(err, growthbook.ErrNotConfigured) {
			ctx.JSON(503, utils.ErrorStr("Feature flags are not configured for this environment."))
			return
		}

		logUpstreamError("get feature for rule update", err)
		ctx.JSON(502, utils.ErrorStr("Could not reach GrowthBook. Please try again."))
		return
	}

	if formatTimestamp(current.DateUpdated) != body.ExpectedUpdatedAt {
		ctx.JSON(409, utils.ErrorStr("Someone else changed this flag. Reload the page to see their changes, then try again."))
		return
	}

	existing, ok := current.Environments[environment]
	if !ok {
		ctx.JSON(400, utils.ErrorStr("That flag does not have the requested environment."))
		return
	}

	rules := make([]growthbook.FeatureRule, 0, len(body.Rules))
	for i, rule := range body.Rules {
		converted, err := rule.ToGrowthBook()
		if err != nil {
			// Validation messages here describe what the user typed, so they are
			// safe and useful to return. ErrorStr is printf-style, so the dynamic
			// parts go through arguments rather than into the format string.
			ctx.JSON(400, utils.ErrorStr("Rule %d: %s", i+1, err.Error()))
			return
		}

		rules = append(rules, converted)
	}

	// existing.Enabled is passed straight back: the environment object must be
	// complete, and a rules edit must not change whether the flag is on.
	if err := Client.ReplaceRules(ctx, featureKey, environment, existing.Enabled, rules); err != nil {
		logUpstreamError("replace rules", err)
		ctx.JSON(502, utils.ErrorStr("Could not save the rules in GrowthBook. Please try again."))
		return
	}

	oldRules := make([]Rule, 0, len(existing.Rules))
	for _, rule := range existing.Rules {
		oldRules = append(oldRules, FromGrowthBook(rule))
	}

	audit.LogStaff(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionFeatureFlagRulesUpdate,
		ResourceType: dbmodel.AuditResourceFeatureFlag,
		ResourceId:   audit.StringPtr(featureKey),
		OldData:      map[string]any{"environment": environment, "rules": oldRules},
		NewData:      map[string]any{"environment": environment, "rules": body.Rules, "reason": body.Reason},
	})

	ctx.Status(204)
}
