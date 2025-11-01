package api

import (
	"fmt"
	"strconv"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func DeleteTeam(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	teamId, err := strconv.Atoi(ctx.Param("teamid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to delete team. Please try again."))
		return
	}

	// check team belongs to guild
	exists, err := dbclient.Client.SupportTeam.Exists(ctx, teamId, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete team. Please try again."))
		return
	}

	if !exists {
		ctx.JSON(400, utils.ErrorStr(fmt.Sprintf("Team not found: %d", teamId)))
		return
	}

	if err := dbclient.Client.SupportTeam.Delete(ctx, teamId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete team. Please try again."))
		return
	}

	ctx.JSON(200, utils.SuccessResponse)
}
