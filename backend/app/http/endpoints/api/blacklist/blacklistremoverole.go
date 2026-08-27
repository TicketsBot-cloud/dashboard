package api

import (
	"net/http"
	"strconv"

	"fmt"

	"github.com/TicketsBot-cloud/common/featureflags"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func RemoveRoleBlacklistHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(ctx, "202608_FEATURE_BLACKLIST", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		ctx.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Blacklist management is temporarily unavailable. Please try again shortly."))
		return
	}

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
