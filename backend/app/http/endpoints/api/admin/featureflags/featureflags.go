// Package featureflags exposes read-only views of GrowthBook flag state plus the
// atomic per-environment toggle, so staff can see and kill flags without leaving
// the dashboard. Rule authoring stays in GrowthBook's own UI.
package featureflags

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ticketsbot-cloud/dashboard/backend/growthbook"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"go.uber.org/zap"
)

// timestampLayout is used for both display and the optimistic concurrency token,
// so a round trip through the browser compares equal.
const timestampLayout = "2006-01-02T15:04:05Z"

func formatTimestamp(t time.Time) string {
	return t.UTC().Format(timestampLayout)
}

// Client is assigned during startup. A nil or unconfigured client makes the
// handlers answer 503 with a clear message rather than failing obscurely.
var Client *growthbook.Client

func logUpstreamError(operation string, err error) {
	if log.Logger == nil {
		return
	}

	log.Logger.Error("GrowthBook management API call failed",
		zap.String("operation", operation), zap.Error(err))
}

// summariseRule renders a rule as one readable line. The dashboard reports rules
// rather than editing them, so a summary is more useful than a partial structural
// copy that might imply it is editable.
func summariseRule(rule growthbook.FeatureRule) string {
	var parts []string

	switch rule.Type {
	case "force":
		parts = append(parts, "Apply a value")

		if rule.Value != "" {
			parts = append(parts, fmt.Sprintf("set to %s", rule.Value))
		}
	case "rollout":
		parts = append(parts, fmt.Sprintf("Roll out to %s of %s",
			formatPercent(rule.CoverageOr(1)), attributeLabel(rule.HashAttribute)))
	case "experiment", "experiment-ref":
		label := rule.ExperimentKey
		if label == "" {
			label = "an experiment"
		}

		parts = append(parts, fmt.Sprintf("Run experiment %s on %s",
			label, attributeLabel(rule.HashAttribute)))
	default:
		if rule.Description != "" {
			parts = append(parts, rule.Description)
		} else {
			parts = append(parts, rule.Type)
		}
	}

	if rule.Condition != "" && rule.Condition != "{}" {
		parts = append(parts, "with targeting")
	}

	return strings.Join(parts, ", ")
}

func formatPercent(coverage float64) string {
	return strconv.FormatFloat(coverage*100, 'f', -1, 64) + "%"
}

// attributeLabel maps the SDK's assignment attributes back to the words staff
// use, so a rule reads as "of servers" rather than "of guild_id".
func attributeLabel(attribute string) string {
	switch attribute {
	case "guild_id":
		return "servers"
	case "user_id":
		return "Discord users"
	case "dashboard_user_id":
		return "dashboard users"
	case "":
		return "everyone"
	default:
		return attribute
	}
}
