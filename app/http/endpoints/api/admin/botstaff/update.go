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

type updateBotStaffBody struct {
	Tier dbmodel.BotStaffTier `json:"tier"`
}

func UpdateBotStaffHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)
	requesterTier := admin.AdminTier(ctx.Keys["admin_tier"].(string))

	userId, err := strconv.ParseUint(ctx.Param("userid"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid user ID."))
		return
	}

	var body updateBotStaffBody
	if err := ctx.BindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request body."))
		return
	}

	// Validate tier value
	if body.Tier != dbmodel.BotStaffTierAdmin && body.Tier != dbmodel.BotStaffTierHelper {
		ctx.JSON(400, utils.ErrorStr("Invalid tier. Must be \"admin\" or \"helper\"."))
		return
	}

	// Fetch the target's current tier for validation and audit log
	oldTier, err := database.Client.BotStaff.GetTier(ctx, userId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if oldTier == "" {
		ctx.JSON(404, utils.ErrorStr("User is not a staff member."))
		return
	}

	// Admins can only set helper tier; only owner can promote to admin
	if body.Tier == dbmodel.BotStaffTierAdmin && requesterTier != admin.AdminTierOwner {
		ctx.JSON(403, utils.ErrorStr("Only the owner can assign the admin tier."))
		return
	}

	// Only owner can demote an admin
	if oldTier == dbmodel.BotStaffTierAdmin && requesterTier != admin.AdminTierOwner {
		ctx.JSON(403, utils.ErrorStr("Only the owner can change an admin's tier."))
		return
	}

	if err := database.Client.BotStaff.UpdateTier(ctx, userId, body.Tier); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update record. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionBotStaffTierUpdate,
		ResourceType: dbmodel.AuditResourceBotStaff,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", userId)),
		OldData:      map[string]any{"target_user_id": userId, "tier": oldTier},
		NewData:      map[string]any{"target_user_id": userId, "tier": body.Tier},
	})
	ctx.Status(204)
}
