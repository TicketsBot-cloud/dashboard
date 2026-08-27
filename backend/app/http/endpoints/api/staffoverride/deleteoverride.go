package api

import (
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
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
