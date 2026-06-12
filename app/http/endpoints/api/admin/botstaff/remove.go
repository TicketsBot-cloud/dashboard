package botstaff

import (
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/internal/admin"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func RemoveBotStaffHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)
	requesterTier := admin.AdminTier(ctx.Keys["admin_tier"].(string))

	userId, err := strconv.ParseUint(ctx.Param("userid"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid user ID."))
		return
	}

	// Check the target's tier before deletion
	targetTier, err := database.Client.BotStaff.GetTier(ctx, userId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if targetTier == "" {
		ctx.JSON(404, utils.ErrorStr("User is not a staff member."))
		return
	}

	// Only owner can remove an admin
	if targetTier == dbmodel.BotStaffTierAdmin && requesterTier != admin.AdminTierOwner {
		ctx.JSON(403, utils.ErrorStr("Only the owner can remove an admin."))
		return
	}

	if err := database.Client.BotStaff.Delete(ctx, userId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete record. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionBotStaffRemove,
		ResourceType: dbmodel.AuditResourceBotStaff,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", userId)),
		OldData:      map[string]any{"target_user_id": userId, "tier": targetTier},
	})
	ctx.Status(204)
}
