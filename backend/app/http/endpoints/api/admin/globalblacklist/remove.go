package globalblacklist

import (
	"fmt"
	"strconv"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func RemoveHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)
	userId, err := strconv.ParseUint(ctx.Param("userid"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to delete record. Please try again."))
		return
	}

	if err := database.Client.GlobalBlacklist.Delete(ctx, userId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete record. Please try again."))
		return
	}

	audit.LogStaff(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionGlobalBlacklistRemove,
		ResourceType: dbmodel.AuditResourceGlobalBlacklist,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", userId)),
		OldData:      map[string]any{"target_user_id": userId},
	})
	ctx.Status(204)
}
