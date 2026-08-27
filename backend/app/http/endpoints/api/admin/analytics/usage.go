package admin_analytics

import (
	"context"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"golang.org/x/sync/errgroup"
)

type usageResponse struct {
	Metrics         database.GlobalUsageMetrics   `json:"metrics"`
	TicketsPerDay   []database.GlobalTicketsPerDay `json:"tickets_per_day"`
}

func GetUsageHandler(ctx *gin.Context) {
	var resp usageResponse

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	group, groupCtx := errgroup.WithContext(timeoutCtx)

	group.Go(func() (err error) {
		resp.Metrics, err = dbclient.Client.AdminAnalytics.GetGlobalUsageMetrics(groupCtx)
		return
	})

	group.Go(func() (err error) {
		resp.TicketsPerDay, err = dbclient.Client.AdminAnalytics.GetGlobalTicketsPerDay(groupCtx)
		return
	})

	if err := group.Wait(); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve usage metrics."))
		return
	}

	if resp.TicketsPerDay == nil {
		resp.TicketsPerDay = make([]database.GlobalTicketsPerDay, 0)
	}

	ctx.JSON(200, resp)
}
