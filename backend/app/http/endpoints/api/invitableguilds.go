package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

// GetInvitableGuildsHandler reads from the stored guild list rather than calling
// Discord, so it reflects the state as of the user's last guild reload.
func GetInvitableGuildsHandler(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)

	ctx, cancel := context.WithTimeout(c, 5*time.Second)
	defer cancel()

	guilds, err := utils.LoadInvitableGuilds(ctx, userId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load servers"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"guilds":  guilds,
	})
}
