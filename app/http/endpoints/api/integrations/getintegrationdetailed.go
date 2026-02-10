package api

import (
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type detailedResponse struct {
	database.CustomIntegration
	Placeholders []database.CustomIntegrationPlaceholder `json:"placeholders"`
	Headers      []database.CustomIntegrationHeader      `json:"headers"`
	Secrets      []database.CustomIntegrationSecret      `json:"secrets"`
}

func GetIntegrationDetailedHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid integration ID"))
		return
	}

	integration, ok, err := dbclient.Client.CustomIntegrations.Get(ctx, integrationId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load integrations. Please try again."))
		return
	}

	if !ok {
		ctx.JSON(404, utils.ErrorStr("Integration not found"))
		return
	}

	// Check if the user has permission to view this integration
	if integration.OwnerId != userId {
		ctx.JSON(403, utils.ErrorStr("You do not have permission to view this integration"))
		return
	}

	// Get placeholders
	placeholders, err := dbclient.Client.CustomIntegrationPlaceholders.GetByIntegration(ctx, integrationId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load integrations. Please try again."))
		return
	}

	// Don't serve null
	if placeholders == nil {
		placeholders = make([]database.CustomIntegrationPlaceholder, 0)
	}

	// Get headers
	headers, err := dbclient.Client.CustomIntegrationHeaders.GetByIntegration(ctx, integrationId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load integrations. Please try again."))
		return
	}

	// Don't serve null
	if headers == nil {
		headers = make([]database.CustomIntegrationHeader, 0)
	}

	// Get secrets
	secrets, err := dbclient.Client.CustomIntegrationSecrets.GetByIntegration(ctx, integrationId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load integrations. Please try again."))
		return
	}

	// Don't serve null
	if secrets == nil {
		secrets = make([]database.CustomIntegrationSecret, 0)
	}

	ctx.JSON(200, detailedResponse{
		CustomIntegration: integration,
		Placeholders:      placeholders,
		Headers:           headers,
		Secrets:           secrets,
	})
}
