package api

import (
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
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
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to process request. Please try again."))
		return
	}

	ctx.JSON(200, gin.H{
		"active": active,
	})
}
