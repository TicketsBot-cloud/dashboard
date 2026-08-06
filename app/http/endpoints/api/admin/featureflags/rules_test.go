package featureflags

import (
	"testing"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/dashboard/growthbook"
	"github.com/stretchr/testify/require"
)

func intPtr(v int) *int { return &v }

// Round-tripping is the property that matters: what the editor saves must read
// back as the same rule, otherwise the UI shows something different from what is
// stored and a later save corrupts it.
func TestRuleRoundTrips(t *testing.T) {
	tests := []struct {
		name string
		rule Rule
	}{
		{
			name: "percentage on guilds",
			rule: Rule{Kind: RuleKindPercentage, Enabled: true, Value: "true", Percentage: 10, Unit: featureflags.AttrGuild},
		},
		{
			name: "percentage on users",
			rule: Rule{Kind: RuleKindPercentage, Enabled: true, Value: "true", Percentage: 2.5, Unit: featureflags.AttrUser},
		},
		{
			name: "specific guilds",
			rule: Rule{Kind: RuleKindGuilds, Enabled: true, Value: "true", Ids: []string{"1071167333265047653", "1328073426023219221"}},
		},
		{
			name: "specific discord users",
			rule: Rule{Kind: RuleKindUsers, Enabled: true, Value: "true", Ids: []string{"126429064218017802"}},
		},
		{
			name: "specific dashboard users",
			rule: Rule{Kind: RuleKindDashboardUsers, Enabled: true, Value: "true", Ids: []string{"126429064218017802"}},
		},
		{
			name: "premium",
			rule: Rule{Kind: RuleKindPremium, Enabled: true, Value: "true", MinPremiumTier: intPtr(premiumTierPremium)},
		},
		{
			name: "whitelabel",
			rule: Rule{Kind: RuleKindPremium, Enabled: true, Value: "true", MinPremiumTier: intPtr(premiumTierWhitelabel)},
		},
		{
			name: "staff",
			rule: Rule{Kind: RuleKindStaff, Enabled: true, Value: "true"},
		},
		{
			name: "everyone",
			rule: Rule{Kind: RuleKindEveryone, Enabled: true, Value: "true"},
		},
		{
			name: "disabled rule stays disabled",
			rule: Rule{Kind: RuleKindStaff, Enabled: false, Value: "true"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			upstream, err := tt.rule.ToGrowthBook()
			require.NoError(t, err)

			back := FromGrowthBook(upstream)

			require.Equal(t, tt.rule.Kind, back.Kind)
			require.Equal(t, tt.rule.Enabled, back.Enabled)
			require.Equal(t, tt.rule.Value, back.Value)
			require.Equal(t, tt.rule.Ids, back.Ids)
			require.Equal(t, tt.rule.MinPremiumTier, back.MinPremiumTier)

			if tt.rule.Kind == RuleKindPercentage {
				require.InDelta(t, tt.rule.Percentage, back.Percentage, 0.0001)
				require.Equal(t, tt.rule.Unit, back.Unit)
			}

			// Every rule read back must carry a summary for the UI.
			require.NotEmpty(t, back.Summary)
		})
	}
}

func TestPercentageProducesRolloutWithHashVersion2(t *testing.T) {
	rule := Rule{Kind: RuleKindPercentage, Enabled: true, Value: "true", Percentage: 25, Unit: featureflags.AttrGuild}

	upstream, err := rule.ToGrowthBook()
	require.NoError(t, err)

	require.Equal(t, "rollout", upstream.Type)
	require.NotNil(t, upstream.Coverage)
	// Coverage is a 0-1 fraction upstream, a 0-100 percentage in the UI.
	require.InDelta(t, 0.25, *upstream.Coverage, 0.0001)
	require.Equal(t, featureflags.AttrGuild, upstream.HashAttribute)
	require.NotNil(t, upstream.HashVersion)
	require.Equal(t, 2, *upstream.HashVersion, "v1 has a documented bucketing bias")
}

func TestNonPercentageRulesOmitCoverage(t *testing.T) {
	// Sending coverage on a force rule would change its behaviour.
	for _, kind := range []RuleKind{RuleKindEveryone, RuleKindStaff, RuleKindPremium} {
		rule := Rule{Kind: kind, Enabled: true, Value: "true"}

		upstream, err := rule.ToGrowthBook()
		require.NoError(t, err)

		require.Equal(t, "force", upstream.Type)
		require.Nil(t, upstream.Coverage, "kind %s", kind)
		require.Empty(t, upstream.HashAttribute, "kind %s", kind)
	}
}

func TestRuleValidation(t *testing.T) {
	tests := []struct {
		name string
		rule Rule
	}{
		{"percentage over 100", Rule{Kind: RuleKindPercentage, Percentage: 101, Unit: featureflags.AttrGuild}},
		{"negative percentage", Rule{Kind: RuleKindPercentage, Percentage: -1, Unit: featureflags.AttrGuild}},
		{"percentage on a non-unit attribute", Rule{Kind: RuleKindPercentage, Percentage: 10, Unit: featureflags.AttrPremiumTier}},
		{"percentage with no unit", Rule{Kind: RuleKindPercentage, Percentage: 10}},
		{"empty ID list", Rule{Kind: RuleKindGuilds, Ids: []string{}}},
		{"non-numeric ID", Rule{Kind: RuleKindGuilds, Ids: []string{"not-an-id"}}},
		{"ID too short to be a snowflake", Rule{Kind: RuleKindGuilds, Ids: []string{"123"}}},
		{"unknown premium tier", Rule{Kind: RuleKindPremium, MinPremiumTier: intPtr(7)}},
		{"unknown kind", Rule{Kind: RuleKind("nonsense")}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := tt.rule.ToGrowthBook()
			require.Error(t, err)
		})
	}
}

func TestIdsAreSentAsStrings(t *testing.T) {
	// Snowflakes must stay strings in the condition. As JSON numbers they would
	// exceed 2^53 and round, silently targeting a different server.
	rule := Rule{Kind: RuleKindGuilds, Enabled: true, Value: "true", Ids: []string{"1328073426023219221"}}

	upstream, err := rule.ToGrowthBook()
	require.NoError(t, err)

	require.JSONEq(t, `{"guild_id":{"$in":["1328073426023219221"]}}`, upstream.Condition)
}

// Anything authored in GrowthBook that this code did not write must surface as
// custom rather than being misread as a kind it can rewrite.
func TestUnrecognisedConditionsBecomeCustom(t *testing.T) {
	tests := []struct {
		name      string
		condition string
		ruleType  string
	}{
		{"multiple attributes", `{"guild_id":{"$in":["1"]},"premium_tier":{"$gte":0}}`, "force"},
		{"unsupported operator", `{"guild_id":{"$ne":"1"}}`, "force"},
		{"unknown attribute", `{"something_else":{"$in":["a"]}}`, "force"},
		{"numeric ids", `{"guild_id":{"$in":[123]}}`, "force"},
		{"malformed json", `{not json`, "force"},
		{"rollout with extra targeting", `{"premium_tier":{"$gte":0}}`, "rollout"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			enabled := true
			coverage := 0.5

			rule := growthbook.FeatureRule{
				Type:      tt.ruleType,
				Enabled:   &enabled,
				Condition: tt.condition,
				Value:     "true",
			}
			if tt.ruleType == "rollout" {
				rule.Coverage = &coverage
				rule.HashAttribute = featureflags.AttrGuild
			}

			back := FromGrowthBook(rule)

			require.Equal(t, RuleKindCustom, back.Kind)
			require.Equal(t, tt.condition, back.RawCondition)
		})
	}
}

// A custom rule must survive being carried through the editor untouched, so
// reordering or toggling other rules around it is lossless.
func TestCustomRulePreservesCondition(t *testing.T) {
	const condition = `{"guild_id":{"$ne":"1"}}`

	rule := Rule{Kind: RuleKindCustom, Enabled: true, Value: "true", RawCondition: condition}

	upstream, err := rule.ToGrowthBook()
	require.NoError(t, err)
	require.Equal(t, condition, upstream.Condition)

	back := FromGrowthBook(upstream)
	require.Equal(t, RuleKindCustom, back.Kind)
	require.Equal(t, condition, back.RawCondition)
}

func TestAbsentEnabledMeansEnabled(t *testing.T) {
	// GrowthBook documents enabled as defaulting to true, so a rule created
	// outside the dashboard without the field must not read as disabled.
	back := FromGrowthBook(growthbook.FeatureRule{Type: "force", Value: "true"})
	require.True(t, back.Enabled)
}

func TestFlagKeyPattern(t *testing.T) {
	valid := []string{"202608_NEW_PRICING", "202601_A", "209912_LONG_MULTI_WORD_NAME", "202608_V2"}
	invalid := []string{
		"NEW_PRICING",
		"2026_NEW_PRICING",
		"202608",
		"202608_",
		"202608_lowercase",
		"202608_TRAILING_",
		"202608__DOUBLE",
		"202608-NEW-PRICING",
		"20260_NEW",
	}

	for _, key := range valid {
		require.True(t, flagKeyPattern.MatchString(key), "expected %q to be valid", key)
	}

	for _, key := range invalid {
		require.False(t, flagKeyPattern.MatchString(key), "expected %q to be invalid", key)
	}
}
