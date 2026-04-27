package api_analytics

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type (
	overviewResponse struct {
		TotalTickets         uint64                        `json:"total_tickets"`
		OpenTickets          uint64                        `json:"open_tickets"`
		FirstResponseTime    tripleWindowSeconds           `json:"first_response_time"`
		ResolutionTime       tripleWindowSeconds           `json:"resolution_time"`
		AverageRating        float64                       `json:"average_rating"`
		FeedbackCount        uint64                        `json:"feedback_count"`
		TicketsPerDay        []database.CountOnDate        `json:"tickets_per_day"`
		TopCloseReasons      []string                      `json:"top_close_reasons"`
		TicketsByPanel       []database.PanelTicketCount   `json:"tickets_by_panel"`
		TicketsByLabel       []database.LabelTicketCount   `json:"tickets_by_label"`
		FeedbackDistribution [5]int                        `json:"feedback_distribution"`
		FeedbackResponseRate database.FeedbackResponseRate `json:"feedback_response_rate"`
		AutoCloseStats       database.AutoCloseStats       `json:"auto_close_stats"`
		ThreadChannelSplit   database.ThreadChannelSplit   `json:"thread_channel_split"`
		BacklogTrend         []database.CountOnDate        `json:"backlog_trend"`
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

func convertTripleWindow(tw database.TripleWindow) tripleWindowSeconds {
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
	guildId := ctx.Keys["guildid"].(uint64)
	days := parseDays(ctx)

	var resp overviewResponse
	var firstResponseTime, resolutionTime database.TripleWindow

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	group, groupCtx := errgroup.WithContext(timeoutCtx)

	group.Go(func() error {
		count, err := dbclient.Client.Tickets.GetTotalTicketCount(groupCtx, guildId)
		if err != nil {
			return err
		}
		resp.TotalTickets = uint64(count)
		return nil
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
		firstResponseTime, err = dbclient.Client.FirstResponseTime.GetAverageTripleWindow(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		resolutionTime, err = dbclient.Client.Tickets.GetTicketDurationTripleWindow(groupCtx, guildId)
		return
	})

	group.Go(func() error {
		avg, err := dbclient.Client.ServiceRatings.GetAverage(groupCtx, guildId)
		if err != nil {
			return err
		}
		resp.AverageRating = float64(avg)
		return nil
	})

	group.Go(func() error {
		count, err := dbclient.Client.ServiceRatings.GetCount(groupCtx, guildId)
		if err != nil {
			return err
		}
		resp.FeedbackCount = uint64(count)
		return nil
	})

	group.Go(func() (err error) {
		resp.TicketsPerDay, err = dbclient.Client.Tickets.GetTicketsPerDay(groupCtx, guildId, days)
		return
	})

	group.Go(func() (err error) {
		resp.TopCloseReasons, err = dbclient.Client.CloseReason.GetTopCloseReasons(groupCtx, guildId, nil, 10)
		return
	})

	// Tickets by panel
	group.Go(func() (err error) {
		resp.TicketsByPanel, err = dbclient.Client.Tickets.GetTicketCountByPanel(groupCtx, guildId, days)
		return
	})

	// Tickets by label
	group.Go(func() (err error) {
		resp.TicketsByLabel, err = dbclient.Client.TicketLabelAssignments.GetTicketCountByLabel(groupCtx, guildId, days)
		return
	})

	// Feedback distribution
	group.Go(func() (err error) {
		resp.FeedbackDistribution, err = dbclient.Client.ServiceRatings.GetDistribution(groupCtx, guildId)
		return
	})

	// Feedback response rate
	group.Go(func() (err error) {
		resp.FeedbackResponseRate, err = dbclient.Client.ServiceRatings.GetResponseRate(groupCtx, guildId, days)
		return
	})

	// Auto-close stats
	group.Go(func() (err error) {
		resp.AutoCloseStats, err = dbclient.Client.CloseReason.GetAutoCloseVsManualClose(groupCtx, guildId, days)
		return
	})

	// Thread vs channel split
	group.Go(func() (err error) {
		resp.ThreadChannelSplit, err = dbclient.Client.Tickets.GetThreadChannelSplit(groupCtx, guildId, days)
		return
	})

	// Backlog trend
	group.Go(func() (err error) {
		resp.BacklogTrend, err = dbclient.Client.Tickets.GetBacklogTrend(groupCtx, guildId, days)
		return
	})

	if err := group.Wait(); err != nil {
		log.Logger.Error("Failed to retrieve analytics data", zap.Uint64("guild_id", guildId), zap.Error(err))
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve analytics data. Please try again later."))
		return
	}

	resp.FirstResponseTime = convertTripleWindow(firstResponseTime)
	resp.ResolutionTime = convertTripleWindow(resolutionTime)

	if resp.TicketsPerDay == nil {
		resp.TicketsPerDay = make([]database.CountOnDate, 0)
	}
	if resp.TopCloseReasons == nil {
		resp.TopCloseReasons = make([]string, 0)
	}
	if resp.TicketsByPanel == nil {
		resp.TicketsByPanel = make([]database.PanelTicketCount, 0)
	}
	if resp.TicketsByLabel == nil {
		resp.TicketsByLabel = make([]database.LabelTicketCount, 0)
	}
	if resp.BacklogTrend == nil {
		resp.BacklogTrend = make([]database.CountOnDate, 0)
	}

	ctx.JSON(200, resp)
}
