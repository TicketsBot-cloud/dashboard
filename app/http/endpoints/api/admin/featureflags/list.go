package featureflags

import (
	"errors"

	"github.com/TicketsBot-cloud/dashboard/growthbook"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

type listResponse struct {
	Flags []flagResponse `json:"flags"`
	// Environments is what GrowthBook actually has configured, so the UI offers
	// real names instead of assuming production and staging.
	Environments []string `json:"environments"`
}

type flagResponse struct {
	Key          string   `json:"key"`
	Description  string   `json:"description"`
	ValueType    string   `json:"value_type"`
	DefaultValue string   `json:"default_value"`
	Owner        string   `json:"owner"`
	Tags         []string `json:"tags"`
	// UpdatedAt doubles as the optimistic concurrency token for rule writes.
	UpdatedAt    string                     `json:"updated_at"`
	Environments map[string]environmentData `json:"environments"`
}

type environmentData struct {
	Enabled bool   `json:"enabled"`
	Rules   []Rule `json:"rules"`
}

func ListHandler(ctx *gin.Context) {
	features, err := Client.ListFeatures(ctx)
	if err != nil {
		if errors.Is(err, growthbook.ErrNotConfigured) {
			ctx.JSON(503, utils.ErrorStr("Feature flags are not configured for this environment."))
			return
		}

		logUpstreamError("list features", err)
		ctx.JSON(502, utils.ErrorStr("Could not reach GrowthBook. Please try again."))
		return
	}

	// A failure here must not hide the flags, so fall back to whatever
	// environments the flags themselves mention.
	environments, err := Client.ListEnvironments(ctx)
	if err != nil {
		logUpstreamError("list environments", err)
		environments = environmentsFromFeatures(features)
	}

	flags := make([]flagResponse, 0, len(features))
	for _, feature := range features {
		if feature.Archived {
			continue
		}

		flags = append(flags, buildFlagResponse(feature))
	}

	ctx.JSON(200, listResponse{Flags: flags, Environments: environments})
}

func buildFlagResponse(feature growthbook.Feature) flagResponse {
	environments := make(map[string]environmentData, len(feature.Environments))
	for name, env := range feature.Environments {
		rules := make([]Rule, 0, len(env.Rules))
		for _, rule := range env.Rules {
			rules = append(rules, FromGrowthBook(rule))
		}

		environments[name] = environmentData{Enabled: env.Enabled, Rules: rules}
	}

	return flagResponse{
		Key:          feature.Id,
		Description:  feature.Description,
		ValueType:    feature.ValueType,
		DefaultValue: feature.DefaultValue,
		Owner:        feature.Owner,
		Tags:         feature.Tags,
		UpdatedAt:    formatTimestamp(feature.DateUpdated),
		Environments: environments,
	}
}

func environmentsFromFeatures(features []growthbook.Feature) []string {
	seen := map[string]struct{}{}
	names := make([]string, 0, 4)

	for _, feature := range features {
		for name := range feature.Environments {
			if _, ok := seen[name]; ok {
				continue
			}

			seen[name] = struct{}{}
			names = append(names, name)
		}
	}

	return names
}
