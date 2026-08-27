package api

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/featureflags"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func RemoveIntegrationHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(ctx, "202608_FEATURE_INTEGRATIONS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		ctx.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Integration management is temporarily unavailable. Please try again shortly."))
		return
	}

	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid integration ID"))
		return
	}

	if err := dbclient.Client.CustomIntegrationGuilds.RemoveFromGuild(ctx, integrationId, guildId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete integration. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionGuildIntegrationDeactivate,
		ResourceType: dbmodel.AuditResourceGuildIntegration,
		ResourceId:   audit.StringPtr(strconv.Itoa(integrationId)),
	})
	ctx.Status(204)
}
