package api

import (
	"context"
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/gdl/objects/user"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/gin-gonic/gin"
)

type whitelabelResponse struct {
	Id       uint64 `json:"id,string"`
	Username string `json:"username"`
	statusUpdateBody
}

func WhitelabelGet(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)

	// Check if this is a different token
	bot, err := database.Client.Whitelabel.GetByUserId(c, userId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewServerError(err))
		return
	}

	if bot.BotId == 0 {
		c.JSON(404, utils.ErrorStr("No bot found"))
		return
	}

	// Get status
	status, statusType, _, err := database.Client.WhitelabelStatuses.Get(c, bot.BotId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewServerError(err))
		return
	}

	username := getBotUsername(c, bot.Token)

	c.JSON(200, whitelabelResponse{
		Id:       bot.BotId,
		Username: username,
		statusUpdateBody: statusUpdateBody{ // Zero values if no status is fine
			Status:     status,
			StatusType: user.ActivityType(statusType),
		},
	})
}

func getBotUsername(ctx context.Context, token string) string {
	user, err := rest.GetCurrentUser(ctx, token, nil)
	if err != nil {
		// TODO: Log error
		return "Unknown User"
	}

	return user.Username
}
