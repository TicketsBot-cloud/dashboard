package featureflags

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/ticketsbot-cloud/dashboard/backend/growthbook"
)

// Rule kinds are the vocabulary staff work in. They map onto GrowthBook rules,
// but deliberately do not expose raw conditions: every kind below produces a
// condition this code also knows how to read back, so what the UI shows is always
// what is stored.
type RuleKind string

const (
	// RuleKindPercentage buckets a share of a unit, using GrowthBook's rollout rule.
	RuleKindPercentage RuleKind = "percentage"
	// RuleKindGuilds targets an explicit list of server IDs.
	RuleKindGuilds RuleKind = "guilds"
	// RuleKindUsers targets an explicit list of Discord user IDs.
	RuleKindUsers RuleKind = "users"
	// RuleKindDashboardUsers targets an explicit list of dashboard user IDs.
	RuleKindDashboardUsers RuleKind = "dashboard_users"
	// RuleKindPremium targets guilds at or above a premium tier.
	RuleKindPremium RuleKind = "premium"
	// RuleKindStaff targets bot staff, for internal dogfooding.
	RuleKindStaff RuleKind = "staff"
	// RuleKindEveryone applies to every evaluation reaching this rule.
	RuleKindEveryone RuleKind = "everyone"
	// RuleKindCustom is anything authored in GrowthBook that does not map to a
	// kind above. Read-only here: the dashboard shows it and can enable, disable
	// or remove it, but will not rewrite a condition it cannot fully model.
	RuleKindCustom RuleKind = "custom"
)

// Premium tiers, mirroring common/premium: None -1, Premium 0, Whitelabel 1.
const (
	premiumTierPremium    = 0
	premiumTierWhitelabel = 1
)

var staffTiers = []string{"helper", "admin", "owner"}

// hashVersion 2 is GrowthBook's improved bucketing hash. New rules always use it;
// v1 has a documented bias. Changing this on an existing rule would reshuffle
// assignment, so it is only ever set when a rule is created.
const hashVersion = 2

var snowflakePattern = regexp.MustCompile(`^\d{15,20}$`)

// Rule is the dashboard-facing representation of one targeting rule.
type Rule struct {
	Kind        RuleKind `json:"kind"`
	Enabled     bool     `json:"enabled"`
	Description string   `json:"description,omitempty"`
	// Value is what the flag evaluates to when this rule matches, as a string.
	Value string `json:"value"`

	// Percentage, 0-100, for RuleKindPercentage.
	Percentage float64 `json:"percentage,omitempty"`
	// Unit is the attribute a percentage rule buckets on.
	Unit string `json:"unit,omitempty"`
	// Ids for the explicit-list kinds.
	Ids []string `json:"ids,omitempty"`
	// MinPremiumTier for RuleKindPremium.
	MinPremiumTier *int `json:"min_premium_tier,omitempty"`

	// Summary is a rendered one-liner, always populated on read.
	Summary string `json:"summary,omitempty"`
	// RawCondition is only set for RuleKindCustom, so the UI can show what it is
	// without pretending to understand it.
	RawCondition string `json:"raw_condition,omitempty"`
}

// ToGrowthBook converts a dashboard rule into the upstream shape.
func (r Rule) ToGrowthBook() (growthbook.FeatureRule, error) {
	enabled := r.Enabled

	base := growthbook.FeatureRule{
		Type:        "force",
		Enabled:     &enabled,
		Description: r.Description,
		Value:       r.Value,
	}

	switch r.Kind {
	case RuleKindEveryone:
		return base, nil

	case RuleKindPercentage:
		if r.Percentage < 0 || r.Percentage > 100 {
			return base, fmt.Errorf("percentage must be between 0 and 100")
		}

		unit, err := unitAttribute(r.Unit)
		if err != nil {
			return base, err
		}

		coverage := r.Percentage / 100
		version := hashVersion

		base.Type = "rollout"
		base.Coverage = &coverage
		base.HashAttribute = unit
		base.HashVersion = &version

		return base, nil

	case RuleKindGuilds, RuleKindUsers, RuleKindDashboardUsers:
		attribute, err := listAttribute(r.Kind)
		if err != nil {
			return base, err
		}

		if len(r.Ids) == 0 {
			return base, fmt.Errorf("at least one ID is required")
		}

		for _, id := range r.Ids {
			if !snowflakePattern.MatchString(id) {
				return base, fmt.Errorf("%q is not a valid Discord ID", id)
			}
		}

		condition, err := encodeCondition(map[string]any{
			attribute: map[string]any{"$in": r.Ids},
		})
		if err != nil {
			return base, err
		}

		base.Condition = condition

		return base, nil

	case RuleKindPremium:
		tier := premiumTierPremium
		if r.MinPremiumTier != nil {
			tier = *r.MinPremiumTier
		}

		if tier != premiumTierPremium && tier != premiumTierWhitelabel {
			return base, fmt.Errorf("premium tier must be %d or %d", premiumTierPremium, premiumTierWhitelabel)
		}

		condition, err := encodeCondition(map[string]any{
			featureflags.AttrPremiumTier: map[string]any{"$gte": tier},
		})
		if err != nil {
			return base, err
		}

		base.Condition = condition

		return base, nil

	case RuleKindStaff:
		condition, err := encodeCondition(map[string]any{
			featureflags.AttrStaffTier: map[string]any{"$in": staffTiers},
		})
		if err != nil {
			return base, err
		}

		base.Condition = condition

		return base, nil

	case RuleKindCustom:
		// Preserved verbatim. The dashboard never authors these, it only carries
		// one back unchanged so reordering or toggling around it is lossless.
		base.Condition = r.RawCondition

		return base, nil

	default:
		return base, fmt.Errorf("unknown rule kind %q", r.Kind)
	}
}

// FromGrowthBook reads an upstream rule back into the dashboard vocabulary,
// falling back to RuleKindCustom when the condition is not one this code wrote.
func FromGrowthBook(rule growthbook.FeatureRule) Rule {
	out := Rule{
		Enabled:     rule.IsEnabled(),
		Description: rule.Description,
		Value:       rule.Value,
	}

	switch rule.Type {
	case "rollout":
		out.Kind = RuleKindPercentage
		out.Percentage = rule.CoverageOr(1) * 100
		out.Unit = rule.HashAttribute
		out.Summary = summariseRule(rule)

		// A rollout with an extra condition is more than a percentage, so do not
		// present it as something the simple editor can round-trip.
		if rule.Condition != "" && rule.Condition != "{}" {
			out.Kind = RuleKindCustom
			out.RawCondition = rule.Condition
		}

		return out

	case "experiment", "experiment-ref":
		out.Kind = RuleKindCustom
		out.RawCondition = rule.Condition
		out.Summary = summariseRule(rule)

		return out
	}

	if rule.Condition == "" || rule.Condition == "{}" {
		out.Kind = RuleKindEveryone
		out.Summary = summariseRule(rule)

		return out
	}

	if kind, detail := decodeCondition(rule.Condition); kind != RuleKindCustom {
		out.Kind = kind
		out.Ids = detail.ids
		out.MinPremiumTier = detail.minPremiumTier
		out.Summary = summariseKnownRule(kind, detail, rule.Value)

		return out
	}

	out.Kind = RuleKindCustom
	out.RawCondition = rule.Condition
	out.Summary = summariseRule(rule)

	return out
}

type conditionDetail struct {
	ids            []string
	minPremiumTier *int
}

// decodeCondition recognises exactly the conditions ToGrowthBook produces.
// Anything else is custom, which keeps the round trip honest.
func decodeCondition(encoded string) (RuleKind, conditionDetail) {
	var parsed map[string]any
	if err := json.Unmarshal([]byte(encoded), &parsed); err != nil {
		return RuleKindCustom, conditionDetail{}
	}

	if len(parsed) != 1 {
		return RuleKindCustom, conditionDetail{}
	}

	for attribute, raw := range parsed {
		operators, ok := raw.(map[string]any)
		if !ok || len(operators) != 1 {
			return RuleKindCustom, conditionDetail{}
		}

		switch attribute {
		case featureflags.AttrGuild, featureflags.AttrUser, featureflags.AttrDashboardUser:
			values, ok := operators["$in"].([]any)
			if !ok {
				return RuleKindCustom, conditionDetail{}
			}

			ids := make([]string, 0, len(values))
			for _, value := range values {
				id, ok := value.(string)
				if !ok {
					return RuleKindCustom, conditionDetail{}
				}

				ids = append(ids, id)
			}

			return kindForAttribute(attribute), conditionDetail{ids: ids}

		case featureflags.AttrPremiumTier:
			tier, ok := operators["$gte"].(float64)
			if !ok {
				return RuleKindCustom, conditionDetail{}
			}

			value := int(tier)

			return RuleKindPremium, conditionDetail{minPremiumTier: &value}

		case featureflags.AttrStaffTier:
			if _, ok := operators["$in"].([]any); !ok {
				return RuleKindCustom, conditionDetail{}
			}

			return RuleKindStaff, conditionDetail{}
		}
	}

	return RuleKindCustom, conditionDetail{}
}

func kindForAttribute(attribute string) RuleKind {
	switch attribute {
	case featureflags.AttrGuild:
		return RuleKindGuilds
	case featureflags.AttrUser:
		return RuleKindUsers
	case featureflags.AttrDashboardUser:
		return RuleKindDashboardUsers
	default:
		return RuleKindCustom
	}
}

func unitAttribute(unit string) (string, error) {
	switch unit {
	case featureflags.AttrGuild, featureflags.AttrUser, featureflags.AttrDashboardUser:
		return unit, nil
	default:
		return "", fmt.Errorf("percentage rules must bucket on %s, %s or %s",
			featureflags.AttrGuild, featureflags.AttrUser, featureflags.AttrDashboardUser)
	}
}

func listAttribute(kind RuleKind) (string, error) {
	switch kind {
	case RuleKindGuilds:
		return featureflags.AttrGuild, nil
	case RuleKindUsers:
		return featureflags.AttrUser, nil
	case RuleKindDashboardUsers:
		return featureflags.AttrDashboardUser, nil
	default:
		return "", fmt.Errorf("rule kind %q does not take an ID list", kind)
	}
}

func encodeCondition(condition map[string]any) (string, error) {
	encoded, err := json.Marshal(condition)
	if err != nil {
		return "", fmt.Errorf("encoding condition: %w", err)
	}

	return string(encoded), nil
}

func summariseKnownRule(kind RuleKind, detail conditionDetail, value string) string {
	suffix := ""
	if value != "" {
		suffix = fmt.Sprintf(", set to %s", value)
	}

	switch kind {
	case RuleKindGuilds:
		return fmt.Sprintf("%s specific servers%s", pluralise(len(detail.ids)), suffix)
	case RuleKindUsers:
		return fmt.Sprintf("%s specific Discord users%s", pluralise(len(detail.ids)), suffix)
	case RuleKindDashboardUsers:
		return fmt.Sprintf("%s specific dashboard users%s", pluralise(len(detail.ids)), suffix)
	case RuleKindPremium:
		tier := premiumTierPremium
		if detail.minPremiumTier != nil {
			tier = *detail.minPremiumTier
		}

		if tier >= premiumTierWhitelabel {
			return "Whitelabel servers" + suffix
		}

		return "Premium servers" + suffix
	case RuleKindStaff:
		return "Bot staff" + suffix
	default:
		return string(kind) + suffix
	}
}

func pluralise(count int) string {
	if count == 1 {
		return "1"
	}

	return strconv.Itoa(count)
}
