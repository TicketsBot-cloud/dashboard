package admin_analytics

import (
	"context"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type adoptionResponse struct {
	Features    []database.FeatureAdoption `json:"features"`
	TotalGuilds int                        `json:"total_guilds"`
}

func GetAdoptionHandler(ctx *gin.Context) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	features, err := dbclient.Client.AdminAnalytics.GetFeatureAdoption(timeoutCtx)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve feature adoption data."))
		return
	}

	metrics, err := dbclient.Client.AdminAnalytics.GetGlobalUsageMetrics(timeoutCtx)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve guild count."))
		return
	}

	ctx.JSON(200, adoptionResponse{
		Features:    features,
		TotalGuilds: metrics.TotalGuilds,
	})
}
