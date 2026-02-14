package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/whitelabeldelete"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/redis"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func WhitelabelDelete(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)

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
