package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/statusupdates"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func WhitelabelStatusDelete(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)

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

	c.JSON(200, utils.SuccessResponse)
}
