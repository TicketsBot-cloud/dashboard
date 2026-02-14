package botstaff

import (
	"strconv"

	"fmt"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func AddBotStaffHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)
	userId, err := strconv.ParseUint(ctx.Param("userid"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if err := database.Client.BotStaff.Add(ctx, userId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionBotStaffAdd,
		ResourceType: dbmodel.AuditResourceBotStaff,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", userId)),
		NewData:      map[string]any{"target_user_id": userId},
	})
	ctx.Status(204)
}
