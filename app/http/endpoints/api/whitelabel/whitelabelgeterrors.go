package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/gin-gonic/gin"
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
