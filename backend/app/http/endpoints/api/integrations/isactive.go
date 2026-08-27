package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func IsIntegrationActiveHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid integration ID"))
		return
	}

	active, err := dbclient.Client.CustomIntegrationGuilds.IsActive(ctx, integrationId, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	ctx.JSON(200, gin.H{
		"active": active,
	})
}
