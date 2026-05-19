package admin_analytics

import (
	"context"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/gin-gonic/gin"
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
