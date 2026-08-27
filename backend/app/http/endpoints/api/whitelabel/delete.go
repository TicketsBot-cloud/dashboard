package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/common/whitelabeldelete"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func WhitelabelDelete(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_WHITELABEL", featureflags.ForDashboardUser(userId)) {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Whitelabel management is temporarily unavailable. Please try again shortly."))
		return
	}

	// Check if this is a different token
	botId, err := database.Client.Whitelabel.Delete(c, userId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete whitelabel bot"))
		return
	}

	if botId != nil {
		// TODO: Kafka
		go whitelabeldelete.Publish(redis.Client.Client, *botId)

	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionWhitelabelDelete,
		ResourceType: dbmodel.AuditResourceWhitelabel,
	})
	c.Status(http.StatusNoContent)
}
