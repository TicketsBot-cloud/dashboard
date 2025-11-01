package api

import (
	"strconv"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func DeleteIntegrationHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid integration ID"))
		return
	}

	integration, ok, err := dbclient.Client.CustomIntegrations.Get(ctx, integrationId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete integration. Please try again."))
		return
	}

	if !ok {
		ctx.JSON(404, utils.ErrorStr("Integration not found"))
		return
	}

	// Check if the user has permission to manage this integration
	if integration.OwnerId != userId {
		ctx.JSON(403, utils.ErrorStr("You do not have permission to delete this integration"))
		return
	}

	if err := dbclient.Client.CustomIntegrations.Delete(ctx, integration.Id); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete integration. Please try again."))
		return
	}

	ctx.Status(204)
}
