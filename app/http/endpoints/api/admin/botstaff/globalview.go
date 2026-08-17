package botstaff

import (
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type setGlobalViewBody struct {
	Enabled bool `json:"enabled"`
}

// Registered on the owner-only route group, so there is no requester tier check here.
func SetGlobalViewHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)

	userId, err := strconv.ParseUint(ctx.Param("userid"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid user ID."))
		return
	}

	var body setGlobalViewBody
	if err := ctx.BindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request body."))
		return
	}

	tier, err := database.Client.BotStaff.GetTier(ctx, userId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if tier == "" {
		ctx.JSON(404, utils.ErrorStr("User is not a staff member."))
		return
	}

	if tier != dbmodel.BotStaffTierAdmin {
		ctx.JSON(400, utils.ErrorStr("Global view can only be granted to admins."))
		return
	}

	oldGlobalView, err := database.Client.BotStaff.HasGlobalView(ctx, userId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	updated, err := database.Client.BotStaff.SetGlobalView(ctx, userId, body.Enabled)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update record. Please try again."))
		return
	}

	if !updated {
		ctx.JSON(409, utils.ErrorStr("User is no longer an admin."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionBotStaffGlobalViewUpdate,
		ResourceType: dbmodel.AuditResourceBotStaff,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", userId)),
		OldData:      map[string]any{"target_user_id": userId, "global_view": oldGlobalView},
		NewData:      map[string]any{"target_user_id": userId, "global_view": body.Enabled},
	})
	ctx.Status(204)
}
