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

func AddMember(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	snowflake, err := strconv.ParseUint(ctx.Param("snowflake"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	// get entity type
	typeParsed, err := strconv.Atoi(ctx.Query("type"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	entityType, ok := entityTypes[typeParsed]
	if !ok {
		ctx.JSON(400, utils.ErrorStr("Invalid entity type"))
		return
	}

	if entityType == entityTypeUser {
		ctx.JSON(400, utils.ErrorStr("Only roles may be added as support representatives"))
		return
	}

	if entityType == entityTypeRole && snowflake == guildId {
		ctx.JSON(400, utils.ErrorStr("You cannot add the @everyone role as staff"))
		return
	}

	teamId := ctx.Param("teamid")
	if teamId == "default" {
		addDefaultMember(ctx, guildId, userId, snowflake, entityType, typeParsed)
	} else {
		parsed, err := strconv.Atoi(teamId)
		if err != nil {
			ctx.JSON(400, utils.ErrorStr(fmt.Sprintf("Invalid team ID provided: %s", ctx.Param("id"))))
			return
		}

		addTeamMember(ctx, parsed, guildId, userId, snowflake, entityType, typeParsed)
	}
}

func addDefaultMember(ctx *gin.Context, guildId, userId, snowflake uint64, entityType entityType, typeParsed int) {
	var err error
	switch entityType {
	case entityTypeUser:
		err = dbclient.Client.Permissions.AddSupport(ctx, guildId, snowflake)
	case entityTypeRole:
		err = dbclient.Client.RolePermissions.AddSupport(ctx, guildId, snowflake)
	}

	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTeamMemberAdd,
		ResourceType: dbmodel.AuditResourceTeamMember,
		ResourceId:   audit.StringPtr(fmt.Sprintf("default/%d", snowflake)),
		NewData:      map[string]interface{}{"snowflake": snowflake, "type": typeParsed},
	})
	ctx.JSON(200, utils.SuccessResponse)
}

func addTeamMember(ctx *gin.Context, teamId int, guildId, userId, snowflake uint64, entityType entityType, typeParsed int) {
	exists, err := dbclient.Client.SupportTeam.Exists(ctx, teamId, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if !exists {
		ctx.JSON(404, utils.ErrorStr("Support team with provided ID not found"))
		return
	}

	switch entityType {
	case entityTypeUser:
		err = dbclient.Client.SupportTeamMembers.Add(ctx, teamId, snowflake)
	case entityTypeRole:
		err = dbclient.Client.SupportTeamRoles.Add(ctx, teamId, snowflake)
	}

	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTeamMemberAdd,
		ResourceType: dbmodel.AuditResourceTeamMember,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d/%d", teamId, snowflake)),
		NewData:      map[string]interface{}{"team_id": teamId, "snowflake": snowflake, "type": typeParsed},
	})
	ctx.JSON(200, utils.SuccessResponse)
}
