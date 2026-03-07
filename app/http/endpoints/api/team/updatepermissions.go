package api

import (
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func UpdateTeamPermissions(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

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
		ctx.JSON(500, utils.ErrorStr("Failed to update team permissions. Please try again."))
		return
	}

	if !exists {
		ctx.JSON(404, utils.ErrorStr("Support team with provided ID not found"))
		return
	}

	var perms database.SupportTeamPermissions
	if err := ctx.ShouldBindJSON(&perms); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if err := dbclient.Client.SupportTeamPermissions.Set(ctx, teamId, perms); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update team permissions. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTeamUpdate,
		ResourceType: database.AuditResourceTeam,
		ResourceId:   audit.StringPtr(strconv.Itoa(teamId)),
		NewData:      perms,
	})

	ctx.JSON(200, utils.SuccessResponse)
}
