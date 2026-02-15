package api

import (
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func DeleteTeam(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	teamId, err := strconv.Atoi(ctx.Param("teamid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to delete team. Please try again."))
		return
	}

	// check team belongs to guild
	team, exists, err := dbclient.Client.SupportTeam.GetById(ctx, guildId, teamId)
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

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTeamDelete,
		ResourceType: dbmodel.AuditResourceTeam,
		ResourceId:   audit.StringPtr(strconv.Itoa(teamId)),
		OldData:      team,
	})
	ctx.JSON(200, utils.SuccessResponse)
}
