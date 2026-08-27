package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
)

func WhitelabelGetErrors(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)

	errors, err := database.Client.WhitelabelErrors.GetRecent(c, userId, 10)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load whitelabel bots"))
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"errors":  errors,
	})
}
