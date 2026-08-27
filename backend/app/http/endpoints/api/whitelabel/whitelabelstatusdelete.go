package api

import (
	"net/http"

	"fmt"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/common/statusupdates"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func WhitelabelStatusDelete(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_WHITELABEL", featureflags.ForDashboardUser(userId)) {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Whitelabel management is temporarily unavailable. Please try again shortly."))
		return
	}

	// Get bot
	bot, err := database.Client.Whitelabel.GetByUserId(c, userId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete whitelabel bot"))
		return
	}

	// Ensure bot exists
	if bot.BotId == 0 {
		c.JSON(404, utils.ErrorStr("No bot found"))
		return
	}

	// Update in database
	if err := database.Client.WhitelabelStatuses.Delete(c, bot.BotId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete whitelabel bot"))
		return
	}

	// Send status update to sharder
	go statusupdates.Publish(redis.Client.Client, bot.BotId)

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionWhitelabelStatusDelete,
		ResourceType: dbmodel.AuditResourceWhitelabel,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", bot.BotId)),
	})
	c.JSON(200, utils.SuccessResponse)
}
