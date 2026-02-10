package api

import (
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func DeleteOverrideHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	if err := database.Client.StaffOverride.Delete(ctx, guildId); err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to delete staff override. Please try again."))
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
