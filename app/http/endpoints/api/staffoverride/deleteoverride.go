package api

import (
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func DeleteOverrideHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	if err := database.Client.StaffOverride.Delete(ctx, guildId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete staff override. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionStaffOverrideDelete,
		ResourceType: dbmodel.AuditResourceStaffOverride,
	})
	ctx.Status(204)
}
