package featureflags

import (
	"errors"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/growthbook"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

type listResponse struct {
	Flags []flagResponse `json:"flags"`
	// Environments is what GrowthBook actually has configured, so the UI offers
	// real names instead of assuming production and staging.
	Environments []string `json:"environments"`
	Configured     bool `json:"configured"`
	FlagsDefaultOn bool `json:"flags_default_on"`
}

type flagResponse struct {
	Key          string `json:"key"`
	Description  string `json:"description"`
	ValueType    string `json:"value_type"`
	DefaultValue string `json:"default_value"`
	// Owner is whatever GrowthBook holds for the feature: the dashboard writes
	// the creating staff member's Discord user ID here (see create.go), but a
	// flag created directly in GrowthBook's own UI may hold arbitrary text.
	Owner string `json:"owner"`
	// OwnerName is the resolved display name for Owner, when Owner parses as a
	// Discord user ID and that user is in cache. Empty otherwise, so the
	// frontend falls back to the raw Owner string.
	OwnerName string   `json:"owner_name,omitempty"`
	Tags      []string `json:"tags"`
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
			ctx.JSON(200, listResponse{
				Flags:          []flagResponse{},
				Environments:   []string{},
				FlagsDefaultOn: !config.Conf.FeatureFlags.Enabled(),
			})
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

	resolveOwnerNames(ctx, flags)

	ctx.JSON(200, listResponse{
		Flags:          flags,
		Environments:   environments,
		Configured:     true,
		FlagsDefaultOn: !config.Conf.FeatureFlags.Enabled(),
	})
}

// resolveOwnerNames fills in OwnerName for every flag whose Owner parses as a
// Discord user ID and is found in cache, deduplicating lookups across flags
// sharing the same owner. Unresolved owners (not a valid ID, or not cached)
// are left as-is; the frontend falls back to the raw Owner string.
func resolveOwnerNames(ctx *gin.Context, flags []flagResponse) {
	ownerIds := make(map[uint64]struct{})
	for _, flag := range flags {
		if id, err := strconv.ParseUint(flag.Owner, 10, 64); err == nil {
			ownerIds[id] = struct{}{}
		}
	}

	if len(ownerIds) == 0 {
		return
	}

	names := make(map[uint64]string, len(ownerIds))
	for id := range ownerIds {
		if user, err := cache.Instance.GetUser(ctx, id); err == nil {
			names[id] = user.Username
		}
	}

	for i := range flags {
		id, err := strconv.ParseUint(flags[i].Owner, 10, 64)
		if err != nil {
			continue
		}

		if name, ok := names[id]; ok {
			flags[i].OwnerName = name
		}
	}
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
