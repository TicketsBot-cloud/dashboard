package admin_analytics

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
)

func GetRetentionHandler(ctx *gin.Context) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	metrics, err := dbclient.Client.AdminAnalytics.GetRetentionMetrics(timeoutCtx)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve retention data."))
		return
	}

	ctx.JSON(200, metrics)
}
