package api

import (
	"strconv"

	"fmt"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func RemoveRoleBlacklistHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	roleId, err := strconv.ParseUint(ctx.Param("role"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to remove from blacklist. Please try again."))
		return
	}

	if err := database.Client.RoleBlacklist.Remove(ctx, guildId, roleId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to remove from blacklist. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionBlacklistRemoveRole,
		ResourceType: dbmodel.AuditResourceBlacklist,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", roleId)),
		OldData:      map[string]any{"role_id": roleId},
	})
	ctx.Status(204)
}
