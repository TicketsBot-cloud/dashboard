package api

import (
	"fmt"
	"strconv"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func GetTeamPermissions(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	teamIdParam := ctx.Param("teamid")
	if teamIdParam == "default" {
		ctx.JSON(400, utils.ErrorStr("Default team permissions are not configurable"))
		return
	}

	teamId, err := strconv.Atoi(teamIdParam)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr(fmt.Sprintf("Invalid team ID provided: %s", teamIdParam)))
		return
	}

	exists, err := dbclient.Client.SupportTeam.Exists(ctx, teamId, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load team permissions. Please try again."))
		return
	}

	if !exists {
		ctx.JSON(404, utils.ErrorStr("Support team with provided ID not found"))
		return
	}

	perms, err := dbclient.Client.SupportTeamPermissions.Get(ctx, teamId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load team permissions. Please try again."))
		return
	}

	ctx.JSON(200, perms)
}
