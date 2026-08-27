package admin_analytics

import (
	"context"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
)

type configPatternsResponse struct {
	Patterns []database.ConfigPatternEntry `json:"patterns"`
}

func GetConfigPatternsHandler(ctx *gin.Context) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	patterns, err := dbclient.Client.AdminAnalytics.GetConfigPatterns(timeoutCtx)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve configuration patterns."))
		return
	}

	ctx.JSON(200, configPatternsResponse{Patterns: patterns})
}
