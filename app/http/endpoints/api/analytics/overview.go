package api_analytics

import (
	"context"
	"strconv"
	"time"

	analytics "github.com/TicketsBot-cloud/analytics-client"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type (
	overviewResponse struct {
		TotalTickets      uint64                  `json:"total_tickets"`
		OpenTickets       uint64                  `json:"open_tickets"`
		FirstResponseTime tripleWindowSeconds     `json:"first_response_time"`
		ResolutionTime    tripleWindowSeconds     `json:"resolution_time"`
		AverageRating     float64                 `json:"average_rating"`
		FeedbackCount     uint64                  `json:"feedback_count"`
		TicketsPerDay     []analytics.CountOnDate `json:"tickets_per_day"`
		TopCloseReasons   []string                `json:"top_close_reasons"`
	}

	tripleWindowSeconds struct {
		AllTime *float64 `json:"all_time"`
		Monthly *float64 `json:"monthly"`
		Weekly  *float64 `json:"weekly"`
	}
)

// durationToSeconds converts a nullable time.Duration pointer to a nullable float64 representing seconds.
func durationToSeconds(d *time.Duration) *float64 {
	if d == nil {
		return nil
	}
	secs := d.Seconds()
	return &secs
}

func convertTripleWindow(tw analytics.TripleWindow) tripleWindowSeconds {
	return tripleWindowSeconds{
		AllTime: durationToSeconds(tw.AllTime),
		Monthly: durationToSeconds(tw.Monthly),
		Weekly:  durationToSeconds(tw.Weekly),
	}
}

// parseDays reads the "days" query param and returns a valid value (7, 30, 90, 365).
// Defaults to 30 if missing or invalid.
func parseDays(ctx *gin.Context) int {
	daysStr := ctx.DefaultQuery("days", "30")
	days, err := strconv.Atoi(daysStr)
	if err != nil {
		return 30
	}

	switch days {
	case 7, 30, 90, 365:
		return days
	default:
		return 30
	}
}

func GetAnalyticsOverviewHandler(ctx *gin.Context) {
	if dbclient.AnalyticsClient == nil {
		ctx.JSON(503, utils.ErrorStr("Analytics not configured"))
		return
	}

	guildId := ctx.Keys["guildid"].(uint64)
	client := dbclient.AnalyticsClient
	days := parseDays(ctx)

	var resp overviewResponse
	var firstResponseTime, resolutionTime analytics.TripleWindow

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	group, groupCtx := errgroup.WithContext(timeoutCtx)

	group.Go(func() (err error) {
		resp.TotalTickets, err = client.GetTotalTicketCount(groupCtx, guildId)
		return
	})

	group.Go(func() error {
		openFlag := true
		count, err := dbclient.Client.Tickets.CountByOptions(groupCtx, database.TicketQueryOptions{
			GuildId: guildId,
			Open:    &openFlag,
		})
		if err != nil {
			return err
		}
		resp.OpenTickets = uint64(count)
		return nil
	})

	group.Go(func() (err error) {
		firstResponseTime, err = client.GetFirstResponseTimeStats(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		resolutionTime, err = client.GetTicketDurationStats(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		resp.AverageRating, err = client.GetAverageFeedbackRatingGuild(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		resp.FeedbackCount, err = client.GetFeedbackCountGuild(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		resp.TicketsPerDay, err = client.GetLastNTicketsPerDayGuild(groupCtx, guildId, days)
		return
	})

	group.Go(func() (err error) {
		resp.TopCloseReasons, err = client.GetTopCloseReasons(groupCtx, guildId, nil)
		return
	})

	if err := group.Wait(); err != nil {
		log.Logger.Error("Failed to retrieve analytics data", zap.Uint64("guild_id", guildId), zap.Error(err))
		ctx.JSON(500, utils.ErrorStr("Failed to retrieve analytics data. Please try again later."))
		return
	}

	resp.FirstResponseTime = convertTripleWindow(firstResponseTime)
	resp.ResolutionTime = convertTripleWindow(resolutionTime)

	// Ensure slices are non-nil for clean JSON output
	if resp.TicketsPerDay == nil {
		resp.TicketsPerDay = make([]analytics.CountOnDate, 0)
	}
	if resp.TopCloseReasons == nil {
		resp.TopCloseReasons = make([]string, 0)
	}

	ctx.JSON(200, resp)
}
