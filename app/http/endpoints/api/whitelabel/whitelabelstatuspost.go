package api

import (
	"net/http"

	"fmt"

	"github.com/TicketsBot-cloud/common/statusupdates"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/user"
	"github.com/gin-gonic/gin"
)

type statusUpdateBody struct {
	Status     string            `json:"status"`
	StatusType user.ActivityType `json:"status_type,string"`
}

func WhitelabelStatusPost(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)

	// Get bot
	bot, err := database.Client.Whitelabel.GetByUserId(c, userId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	// Ensure bot exists
	if bot.BotId == 0 {
		c.JSON(404, utils.ErrorStr("No bot found"))
		return
	}

	// Parse status
	var data statusUpdateBody
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request body: malformed JSON"))
		return
	}

	// Validate status length
	if len(data.Status) == 0 || len(data.Status) > 255 {
		c.JSON(400, utils.ErrorStr("Status must be between 1-255 characters in length"))
		return
	}

	// Validate status type
	validActivities := []user.ActivityType{
		user.ActivityTypePlaying,
		user.ActivityTypeListening,
		user.ActivityTypeWatching,
		user.ActivityTypeCompeting,
		user.ActivityTypeCustom,
	}

	if !utils.Contains(validActivities, data.StatusType) {
		c.JSON(400, utils.ErrorStr("Invalid status type"))
		return
	}

	// Update in database
	if err := database.Client.WhitelabelStatuses.Set(c, bot.BotId, data.Status, int16(data.StatusType)); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	// Send status update to sharder
	go statusupdates.Publish(redis.Client.Client, bot.BotId)

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionWhitelabelStatusSet,
		ResourceType: dbmodel.AuditResourceWhitelabel,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", bot.BotId)),
		NewData:      data,
	})
	c.JSON(200, utils.SuccessResponse)
}
