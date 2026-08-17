package featureflags

import (
	"errors"
	"regexp"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/growthbook"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// flagKeyPattern enforces the YYYYMM_SHORT_DESC convention, so flags sort by the
// month they were introduced and stale ones are obvious at a glance.
var flagKeyPattern = regexp.MustCompile(`^\d{6}_[A-Z0-9]+(_[A-Z0-9]+)*$`)

const (
	maxDescriptionLength = 500
	maxKeyLength         = 96
)

type createBody struct {
	Key         string `json:"key"`
	Description string `json:"description"`
	// ValueType is "boolean" for a plain on/off flag, or "string"/"number"/"json"
	// for a multivariate one.
	ValueType    string `json:"value_type"`
	DefaultValue string `json:"default_value"`
}

var allowedValueTypes = map[string]string{
	"boolean": "false",
	"string":  "",
	"number":  "0",
	"json":    "{}",
}

func CreateHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)

	var body createBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if len(body.Key) > maxKeyLength {
		ctx.JSON(400, utils.ErrorStr("Flag key is too long."))
		return
	}

	if !flagKeyPattern.MatchString(body.Key) {
		ctx.JSON(400, utils.ErrorStr("Flag keys must look like 202608_SHORT_DESC: six digits for the year and month, then an underscore, then uppercase words."))
		return
	}

	if len(body.Description) > maxDescriptionLength {
		ctx.JSON(400, utils.ErrorStr("Description is too long."))
		return
	}

	fallback, ok := allowedValueTypes[body.ValueType]
	if !ok {
		ctx.JSON(400, utils.ErrorStr("Value type must be boolean, string, number or json."))
		return
	}

	defaultValue := body.DefaultValue
	if defaultValue == "" {
		defaultValue = fallback
	}

	if body.ValueType == "boolean" && defaultValue != "true" && defaultValue != "false" {
		ctx.JSON(400, utils.ErrorStr("A boolean flag's default must be true or false."))
		return
	}

	if body.ValueType == "number" {
		if _, err := strconv.ParseFloat(defaultValue, 64); err != nil {
			ctx.JSON(400, utils.ErrorStr("A number flag's default must be numeric."))
			return
		}
	}

	// Created disabled in every environment. A new flag must never start on: the
	// point of creating it is to roll it out deliberately afterwards.
	environments, err := Client.ListEnvironments(ctx)
	if err != nil {
		if errors.Is(err, growthbook.ErrNotConfigured) {
			ctx.JSON(503, utils.ErrorStr("Feature flags are not configured for this environment."))
			return
		}

		logUpstreamError("list environments for create", err)
		ctx.JSON(502, utils.ErrorStr("Could not reach GrowthBook. Please try again."))
		return
	}

	environmentSettings := make(map[string]growthbook.FeatureEnvironment, len(environments))
	for _, name := range environments {
		environmentSettings[name] = growthbook.FeatureEnvironment{
			Enabled: false,
			Rules:   []growthbook.FeatureRule{},
		}
	}

	// Create into the project our own SDK key reads. GrowthBook filters the SDK
	// payload by project, so a flag created without one is invisible to a scoped
	// connection and silently evaluates to its default everywhere.
	var project string
	if connection, err := Client.SdkConnection(ctx); err != nil {
		// Not fatal: an unscoped connection needs no project. Log it so a genuinely
		// misconfigured deployment is visible rather than producing dead flags.
		logUpstreamError("resolve SDK connection project", err)
	} else {
		project = connection.Project
	}

	if err := Client.CreateFeature(ctx, growthbook.CreateFeatureRequest{
		Id:           body.Key,
		Description:  body.Description,
		ValueType:    body.ValueType,
		Project:      project,
		DefaultValue: defaultValue,
		Owner:        strconv.FormatUint(authUserId, 10),
		Environments: environmentSettings,
	}); err != nil {
		logUpstreamError("create feature", err)
		ctx.JSON(502, utils.ErrorStr("Could not create the flag in GrowthBook. It may already exist."))
		return
	}

	audit.LogStaff(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionFeatureFlagCreate,
		ResourceType: dbmodel.AuditResourceFeatureFlag,
		ResourceId:   audit.StringPtr(body.Key),
		NewData: map[string]any{
			"key":           body.Key,
			"description":   body.Description,
			"value_type":    body.ValueType,
			"default_value": defaultValue,
		},
	})

	ctx.Status(201)
}
