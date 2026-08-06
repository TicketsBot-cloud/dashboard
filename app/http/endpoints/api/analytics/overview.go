package api_analytics

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type (
	overviewResponse struct {
		TotalTickets         uint64                        `json:"total_tickets"`
		OpenTickets          uint64                        `json:"open_tickets"`
		FirstResponseTime    metricWindowSeconds           `json:"first_response_time"`
		ResolutionTime       metricWindowSeconds           `json:"resolution_time"`
		AverageRating        float64                       `json:"average_rating"`
		FeedbackCount        uint64                        `json:"feedback_count"`
		TicketsPerDay        []database.CountOnDate        `json:"tickets_per_day"`
		TopCloseReasons      []database.CloseReasonCount   `json:"top_close_reasons"`
		TicketsByPanel       []database.PanelTicketCount   `json:"tickets_by_panel"`
		TicketsByLabel       []database.LabelTicketCount   `json:"tickets_by_label"`
		FeedbackDistribution [5]int                        `json:"feedback_distribution"`
		FeedbackResponseRate database.FeedbackResponseRate `json:"feedback_response_rate"`
		AutoCloseStats       database.AutoCloseStats       `json:"auto_close_stats"`
		ThreadChannelSplit   database.ThreadChannelSplit   `json:"thread_channel_split"`
		BacklogTrend         []database.CountOnDate        `json:"backlog_trend"`
		OneTouchResolution   *float64                      `json:"one_touch_resolution_rate"`
		TotalClosed          *int                          `json:"total_closed"`
		AvgMessageCounts     database.AverageMessageCounts `json:"avg_message_counts"`
		PeakHours            []database.PeakHourEntry      `json:"peak_hours"`
		TicketsBySource      []database.SourceBreakdown    `json:"tickets_by_source"`
		ResponseTimeByHour   []database.ResponseTimeByHour `json:"response_time_by_hour"`
	}

	// metricWindowSeconds is the JSON shape for time-based metric windows.
	// Renamed from tripleWindowSeconds; JSON keys are unchanged for backwards
	// compatibility. The new "selected" field is purely additive.
	metricWindowSeconds struct {
		Selected *float64 `json:"selected"`
		AllTime  *float64 `json:"all_time"`
		Monthly  *float64 `json:"monthly"`
		Weekly   *float64 `json:"weekly"`
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

func convertMetricWindows(mw database.MetricWindows) metricWindowSeconds {
	return metricWindowSeconds{
		Selected: durationToSeconds(mw.Selected),
		AllTime:  durationToSeconds(mw.AllTime),
		Monthly:  durationToSeconds(mw.Monthly),
		Weekly:   durationToSeconds(mw.Weekly),
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
	case 0, 7, 30, 90, 365:
		return days
	default:
		return 30
	}
}

// parseCaseInsensitive reads the "case_insensitive" query param. Defaults to false.
func parseCaseInsensitive(ctx *gin.Context) bool {
	caseInsensitive, err := strconv.ParseBool(ctx.DefaultQuery("case_insensitive", "false"))
	if err != nil {
		return false
	}

	return caseInsensitive
}

func GetAnalyticsOverviewHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botCtx.Token, botCtx.RateLimiter)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if premiumTier == premium.None {
		ctx.JSON(http.StatusPaymentRequired, utils.ErrorStr("Analytics requires a premium subscription."))
		return
	}

	days := parseDays(ctx)
	caseInsensitive := parseCaseInsensitive(ctx)

	filter, ok := parsePanelFilter(ctx)
	if !ok {
		return // parsePanelFilter already wrote the 400 response
	}

	// Queries using generate_series or CURRENT_DATE arithmetic need a positive day count.
	// For "all time" (days=0), use a large value so the date filter includes everything.
	legacyDays := days
	if legacyDays == 0 {
		legacyDays = 36500
	}

	var resp overviewResponse
	var firstResponseTime, resolutionTime database.MetricWindows

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	group, groupCtx := errgroup.WithContext(timeoutCtx)
	group.SetLimit(fanOutLimit())

	group.Go(func() error {
		count, err := dbclient.Client.Tickets.GetTotalTicketCountFiltered(groupCtx, guildId, filter)
		if err != nil {
			return err
		}
		resp.TotalTickets = uint64(count)
		return nil
	})

	group.Go(func() error {
		count, err := dbclient.Client.Tickets.CountOpenTickets(groupCtx, guildId, filter)
		if err != nil {
			return err
		}
		resp.OpenTickets = uint64(count)
		return nil
	})

	group.Go(func() (err error) {
		firstResponseTime, err = dbclient.Client.FirstResponseTime.GetAverageWindows(groupCtx, guildId, days, filter)
		return
	})

	group.Go(func() (err error) {
		resolutionTime, err = dbclient.Client.Tickets.GetDurationWindows(groupCtx, guildId, days, filter)
		return
	})

	group.Go(func() error {
		avg, err := dbclient.Client.ServiceRatings.GetAverageFiltered(groupCtx, guildId, days, filter)
		if err != nil {
			return err
		}
		resp.AverageRating = float64(avg)
		return nil
	})

	group.Go(func() error {
		count, err := dbclient.Client.ServiceRatings.GetCountFiltered(groupCtx, guildId, days, filter)
		if err != nil {
			return err
		}
		resp.FeedbackCount = uint64(count)
		return nil
	})

	group.Go(func() (err error) {
		if days == 0 || days > 90 {
			resp.TicketsPerDay, err = dbclient.Client.Tickets.GetTicketsPerWeek(groupCtx, guildId, days, filter)
		} else {
			resp.TicketsPerDay, err = dbclient.Client.Tickets.GetTicketsPerDayFiltered(groupCtx, guildId, days, filter)
		}
		return
	})

	group.Go(func() (err error) {
		resp.TopCloseReasons, err = dbclient.Client.CloseReason.GetTopCloseReasonsWithCount(groupCtx, guildId, nil, 10, days, caseInsensitive, filter)
		return
	})

	// Tickets by panel
	group.Go(func() (err error) {
		resp.TicketsByPanel, err = dbclient.Client.Tickets.GetTicketCountByPanel(groupCtx, guildId, legacyDays, filter)
		return
	})

	// Tickets by label
	group.Go(func() (err error) {
		resp.TicketsByLabel, err = dbclient.Client.TicketLabelAssignments.GetTicketCountByLabel(groupCtx, guildId, legacyDays, filter)
		return
	})

	// Feedback distribution
	group.Go(func() (err error) {
		resp.FeedbackDistribution, err = dbclient.Client.ServiceRatings.GetDistributionFiltered(groupCtx, guildId, days, filter)
		return
	})

	// Feedback response rate
	group.Go(func() (err error) {
		resp.FeedbackResponseRate, err = dbclient.Client.ServiceRatings.GetResponseRateFiltered(groupCtx, guildId, legacyDays, filter)
		return
	})

	// Auto-close stats
	group.Go(func() (err error) {
		resp.AutoCloseStats, err = dbclient.Client.CloseReason.GetAutoCloseVsManualCloseFiltered(groupCtx, guildId, legacyDays, filter)
		return
	})

	// Thread vs channel split
	group.Go(func() (err error) {
		resp.ThreadChannelSplit, err = dbclient.Client.Tickets.GetThreadChannelSplitFiltered(groupCtx, guildId, legacyDays, filter)
		return
	})

	// Backlog trend (skip for "all" as it's too expensive to compute over full history)
	if days > 0 {
		group.Go(func() (err error) {
			resp.BacklogTrend, err = dbclient.Client.Tickets.GetBacklogTrend(groupCtx, guildId, days, filter)
			return
		})
	}

	// One-touch resolution rate - surface TotalClosed so the frontend can
	// suppress percentages at low sample sizes.
	group.Go(func() error {
		result, err := dbclient.Client.TicketMessageCounts.GetOneTouchResolutionRateFiltered(groupCtx, guildId, days, filter)
		if err != nil {
			return err
		}
		if result.TotalClosed > 0 {
			rate := float64(result.OneTouchCount) / float64(result.TotalClosed)
			resp.OneTouchResolution = &rate
			resp.TotalClosed = &result.TotalClosed
		}
		return nil
	})

	// Average message counts
	group.Go(func() (err error) {
		resp.AvgMessageCounts, err = dbclient.Client.TicketMessageCounts.GetAverageMessageCountsFiltered(groupCtx, guildId, days, filter)
		return
	})

	// Peak hours heatmap
	group.Go(func() (err error) {
		resp.PeakHours, err = dbclient.Client.Tickets.GetPeakHours(groupCtx, guildId, days, filter)
		return
	})

	// Tickets by source
	group.Go(func() (err error) {
		resp.TicketsBySource, err = dbclient.Client.Tickets.GetTicketsBySource(groupCtx, guildId, days, filter)
		return
	})

	// Response time by hour of day
	group.Go(func() (err error) {
		resp.ResponseTimeByHour, err = dbclient.Client.FirstResponseTime.GetAverageByHour(groupCtx, guildId, days, filter)
		return
	})

	if err := group.Wait(); err != nil {
		log.Logger.Error("Failed to retrieve analytics data", zap.Uint64("guild_id", guildId), zap.Error(err))
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve analytics data. Please try again later."))
		return
	}

	resp.FirstResponseTime = convertMetricWindows(firstResponseTime)
	resp.ResolutionTime = convertMetricWindows(resolutionTime)

	if resp.TicketsPerDay == nil {
		resp.TicketsPerDay = make([]database.CountOnDate, 0)
	}
	if resp.TopCloseReasons == nil {
		resp.TopCloseReasons = make([]database.CloseReasonCount, 0)
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
	if resp.PeakHours == nil {
		resp.PeakHours = make([]database.PeakHourEntry, 0)
	}
	if resp.TicketsBySource == nil {
		resp.TicketsBySource = make([]database.SourceBreakdown, 0)
	}
	if resp.ResponseTimeByHour == nil {
		resp.ResponseTimeByHour = make([]database.ResponseTimeByHour, 0)
	}

	ctx.JSON(200, resp)
}
