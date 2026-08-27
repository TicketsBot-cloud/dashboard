package api_analytics

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgtype"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type panelAnalyticsResponse struct {
	Days     int                `json:"days"`
	HasTrend bool               `json:"has_trend"`
	Panels   []panelPerformance `json:"panels"`
	Groups   panelGroups        `json:"groups"`
}

type panelPerformance struct {
	PanelId       *int    `json:"panel_id"`
	Title         string  `json:"title"`
	ChannelId     *uint64 `json:"channel_id,string,omitempty"`
	Disabled      bool    `json:"disabled"`
	ForceDisabled bool    `json:"force_disabled"`
	TicketCount   int     `json:"ticket_count"`
	ClosedCount   int     `json:"closed_count"`

	AvgFirstResponseSeconds *float64 `json:"avg_first_response_seconds"`
	AvgResolutionSeconds    *float64 `json:"avg_resolution_seconds"`
	AvgRating               *float64 `json:"avg_rating"`
	RatingCount             int      `json:"rating_count"`

	Previous *panelPreviousMetrics `json:"previous"`
	Trend    *panelTrendMetrics    `json:"trend"`
}

type panelPreviousMetrics struct {
	TicketCount             int      `json:"ticket_count"`
	ClosedCount             int      `json:"closed_count"`
	AvgFirstResponseSeconds *float64 `json:"avg_first_response_seconds"`
	AvgResolutionSeconds    *float64 `json:"avg_resolution_seconds"`
	AvgRating               *float64 `json:"avg_rating"`
	RatingCount             int      `json:"rating_count"`
}

type panelTrendMetrics struct {
	TicketCountPct   *float64 `json:"ticket_count_pct"`
	FirstResponsePct *float64 `json:"first_response_pct"`
	ResolutionPct    *float64 `json:"resolution_pct"`
	RatingDelta      *float64 `json:"rating_delta"`
}

type panelGroups struct {
	Teams               []panelGroup `json:"teams"`
	MultiPanels         []panelGroup `json:"multi_panels"`
	DefaultTeamPanelIds []int        `json:"default_team_panel_ids"`
}

type panelGroup struct {
	Id       int    `json:"id"`
	Name     string `json:"name"`
	PanelIds []int  `json:"panel_ids"`
}

// panelRawMetrics holds the raw aggregated values from the comparison query,
// before trend computation. Used for both current and previous periods.
type panelRawMetrics struct {
	ticketCount int
	closedCount int
	avgFrtSecs  *float64
	avgResSecs  *float64
	avgRating   *float64
	ratingCount int
}

func float64Ptr(v float64) *float64 { return &v }

func GetAnalyticsPanelsHandler(ctx *gin.Context) {
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

	filter, ok := parsePanelFilter(ctx)
	if !ok {
		return // parsePanelFilter already wrote the 400 response
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	group, groupCtx := errgroup.WithContext(timeoutCtx)
	group.SetLimit(fanOutLimit())

	type comparisonRow struct {
		panelId       *int
		title         *string
		channelId     *uint64
		disabled      bool
		forceDisabled bool
		current       panelRawMetrics
		previous      panelRawMetrics
	}

	var comparisonRows []comparisonRow

	// Comparison query: one query joining tickets, first_response_time, and
	// service_ratings with FILTER clauses for current and previous periods.
	group.Go(func() error {
		query := `
WITH bounds AS (
    SELECT
        CASE WHEN $2 > 0 THEN NOW() - make_interval(days => $2) ELSE '-infinity'::timestamptz END AS current_start,
        CASE WHEN $2 > 0 THEN NOW() - make_interval(days => $2 * 2) ELSE NULL END AS previous_start,
        CASE WHEN $2 > 0 THEN NOW() - make_interval(days => $2) ELSE NULL END AS previous_end
),
scoped AS (
    SELECT
        t.panel_id,
        t.open_time >= b.current_start AS in_current,
        CASE WHEN b.previous_start IS NOT NULL
            THEN t.open_time >= b.previous_start AND t.open_time < b.previous_end
            ELSE false
        END AS in_previous,
        t.open = false AS is_closed,
        EXTRACT(EPOCH FROM frt.response_time) AS frt_secs,
        sr.rating::float8 AS rating,
        CASE WHEN t.close_time IS NOT NULL
            THEN EXTRACT(EPOCH FROM (t.close_time - t.open_time))
        END AS resolution_secs
    FROM tickets t
    CROSS JOIN bounds b
    LEFT JOIN first_response_time frt ON frt.guild_id = t.guild_id AND frt.ticket_id = t.id
    LEFT JOIN service_ratings sr ON sr.guild_id = t.guild_id AND sr.ticket_id = t.id
    WHERE t.guild_id = $1
        AND t.open_time >= COALESCE(b.previous_start, b.current_start)` + database.PanelPredicate("t", 3, 4) + `
),
agg AS (
    SELECT
        panel_id,
        COUNT(*) FILTER (WHERE in_current)::int AS ticket_count,
        COUNT(*) FILTER (WHERE in_current AND is_closed)::int AS closed_count,
        AVG(frt_secs) FILTER (WHERE in_current AND frt_secs IS NOT NULL) AS avg_frt_secs,
        AVG(resolution_secs) FILTER (WHERE in_current AND resolution_secs IS NOT NULL) AS avg_resolution_secs,
        AVG(rating) FILTER (WHERE in_current AND rating IS NOT NULL) AS avg_rating,
        COUNT(rating) FILTER (WHERE in_current)::int AS rating_count,
        COUNT(*) FILTER (WHERE in_previous)::int AS prev_ticket_count,
        COUNT(*) FILTER (WHERE in_previous AND is_closed)::int AS prev_closed_count,
        AVG(frt_secs) FILTER (WHERE in_previous AND frt_secs IS NOT NULL) AS prev_avg_frt_secs,
        AVG(resolution_secs) FILTER (WHERE in_previous AND resolution_secs IS NOT NULL) AS prev_avg_resolution_secs,
        AVG(rating) FILTER (WHERE in_previous AND rating IS NOT NULL) AS prev_avg_rating,
        COUNT(rating) FILTER (WHERE in_previous)::int AS prev_rating_count
    FROM scoped
    GROUP BY panel_id
)
SELECT
    p.panel_id, p.title, p.channel_id, p.disabled, p.force_disabled,
    COALESCE(a.ticket_count, 0), COALESCE(a.closed_count, 0),
    a.avg_frt_secs, a.avg_resolution_secs, a.avg_rating, COALESCE(a.rating_count, 0),
    COALESCE(a.prev_ticket_count, 0), COALESCE(a.prev_closed_count, 0),
    a.prev_avg_frt_secs, a.prev_avg_resolution_secs, a.prev_avg_rating, COALESCE(a.prev_rating_count, 0)
FROM panels p
LEFT JOIN agg a ON a.panel_id = p.panel_id
WHERE p.guild_id = $1` + database.PanelPredicate("p", 3, 4) + `
UNION ALL
SELECT
    NULL::int, NULL::text, NULL::int8, false, false,
    COALESCE(a.ticket_count, 0), COALESCE(a.closed_count, 0),
    a.avg_frt_secs, a.avg_resolution_secs, a.avg_rating, COALESCE(a.rating_count, 0),
    COALESCE(a.prev_ticket_count, 0), COALESCE(a.prev_closed_count, 0),
    a.prev_avg_frt_secs, a.prev_avg_resolution_secs, a.prev_avg_rating, COALESCE(a.prev_rating_count, 0)
FROM agg a
WHERE a.panel_id IS NULL;`

		// The second UNION ALL branch reads "agg", which is built from "scoped",
		// which already carries the panel predicate. So when the filter excludes
		// unassigned tickets, "scoped" contains none, "agg" has no panel_id IS
		// NULL group, and this branch naturally returns zero rows without its
		// own copy of the predicate.
		arr, unassigned, err := filter.Args()
		if err != nil {
			return err
		}

		rows, err := dbclient.Client.Tickets.Query(groupCtx, query, guildId, days, arr, unassigned)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var r comparisonRow
			if err := rows.Scan(
				&r.panelId, &r.title, &r.channelId, &r.disabled, &r.forceDisabled,
				&r.current.ticketCount, &r.current.closedCount,
				&r.current.avgFrtSecs, &r.current.avgResSecs, &r.current.avgRating, &r.current.ratingCount,
				&r.previous.ticketCount, &r.previous.closedCount,
				&r.previous.avgFrtSecs, &r.previous.avgResSecs, &r.previous.avgRating, &r.previous.ratingCount,
			); err != nil {
				return err
			}
			comparisonRows = append(comparisonRows, r)
		}
		return nil
	})

	// Grouping queries: teams, multipanels, and default_team panels.

	type panelGrouping struct {
		panelId    int
		teamIds    []int
		mpIds      []int
		hasDefault bool
	}

	var panelGroupings []panelGrouping

	group.Go(func() error {
		query := `
SELECT
    p.panel_id,
    ARRAY_AGG(DISTINCT pt.team_id) FILTER (WHERE pt.team_id IS NOT NULL),
    ARRAY_AGG(DISTINCT mpt.multi_panel_id) FILTER (WHERE mpt.multi_panel_id IS NOT NULL),
    p.default_team
FROM panels p
LEFT JOIN panel_teams pt ON pt.panel_id = p.panel_id
LEFT JOIN multi_panel_targets mpt ON mpt.panel_id = p.panel_id
WHERE p.guild_id = $1
GROUP BY p.panel_id, p.default_team;`

		rows, err := dbclient.Client.Tickets.Query(groupCtx, query, guildId)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var pg panelGrouping
			var teamIds, mpIds pgtype.Int4Array

			if err := rows.Scan(&pg.panelId, &teamIds, &mpIds, &pg.hasDefault); err != nil {
				return err
			}

			// ARRAY_AGG with FILTER yields NULL when nothing matched, which
			// assignInts renders as an empty slice.
			if err := assignInts(teamIds, &pg.teamIds); err != nil {
				return fmt.Errorf("panel groupings: team ids for panel %d: %w", pg.panelId, err)
			}
			if err := assignInts(mpIds, &pg.mpIds); err != nil {
				return fmt.Errorf("panel groupings: multipanel ids for panel %d: %w", pg.panelId, err)
			}

			panelGroupings = append(panelGroupings, pg)
		}
		return nil
	})

	type teamInfo struct {
		id   int
		name string
	}
	type mpInfo struct {
		id    int
		title *string
	}

	var teams []teamInfo
	var multiPanels []mpInfo

	group.Go(func() error {
		// This endpoint is Support level, whereas /api/:id/team is Admin only.
		// Returning team names here was reviewed and accepted on the basis that
		// names alone are already visible to Support staff through /oncall.
		// Select "id" and "name" only. In particular do not add on_call_role_id,
		// which is a Discord role ID and is not Support-visible today. Widening
		// this SELECT widens the permission model, so it needs its own review.
		query := `SELECT id, name FROM support_team WHERE guild_id = $1;`
		rows, err := dbclient.Client.Tickets.Query(groupCtx, query, guildId)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var ti teamInfo
			if err := rows.Scan(&ti.id, &ti.name); err != nil {
				return err
			}
			teams = append(teams, ti)
		}
		return nil
	})

	group.Go(func() error {
		// The primary key is "id". "multi_panel_id" is the FK name on
		// multi_panel_targets, not a column here.
		query := `SELECT id, embed->>'title' FROM multi_panels WHERE guild_id = $1;`
		rows, err := dbclient.Client.Tickets.Query(groupCtx, query, guildId)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var mi mpInfo
			if err := rows.Scan(&mi.id, &mi.title); err != nil {
				return err
			}
			multiPanels = append(multiPanels, mi)
		}
		return nil
	})

	if err := group.Wait(); err != nil {
		// Respond with ctx.JSON rather than AbortWithError: the error handler
		// middleware serialises the underlying error into the response body,
		// which would hand the caller raw driver and schema detail.
		log.Logger.Error("Failed to retrieve panel analytics", zap.Uint64("guild_id", guildId), zap.Error(err))
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to retrieve panel analytics. Please try again later."))
		return
	}

	// Build the response.
	resp := panelAnalyticsResponse{
		Days:     days,
		HasTrend: days > 0,
		Panels:   make([]panelPerformance, 0, len(comparisonRows)),
	}

	for _, r := range comparisonRows {
		pp := panelPerformance{
			PanelId:                 r.panelId,
			ChannelId:               r.channelId,
			Disabled:                r.disabled,
			ForceDisabled:           r.forceDisabled,
			TicketCount:             r.current.ticketCount,
			ClosedCount:             r.current.closedCount,
			AvgFirstResponseSeconds: r.current.avgFrtSecs,
			AvgResolutionSeconds:    r.current.avgResSecs,
			AvgRating:               r.current.avgRating,
			RatingCount:             r.current.ratingCount,
			Previous:                computePrevious(days, r.previous),
			Trend:                   computeTrend(days, r.current, r.previous),
		}

		if r.title != nil {
			pp.Title = *r.title
		} else {
			// panel_id IS NULL: tickets whose panel was deleted or opened without one.
			pp.Title = "No panel"
		}

		resp.Panels = append(resp.Panels, pp)
	}

	// Build group presets.
	// Invert panel-to-group into group-to-panels.
	teamPanels := make(map[int][]int)
	mpPanels := make(map[int][]int)
	var defaultPanelIds []int

	for _, pg := range panelGroupings {
		for _, tid := range pg.teamIds {
			teamPanels[tid] = append(teamPanels[tid], pg.panelId)
		}
		for _, mid := range pg.mpIds {
			mpPanels[mid] = append(mpPanels[mid], pg.panelId)
		}
		if pg.hasDefault {
			defaultPanelIds = append(defaultPanelIds, pg.panelId)
		}
	}

	resp.Groups.Teams = make([]panelGroup, 0, len(teams))
	for _, ti := range teams {
		pids := teamPanels[ti.id]
		if len(pids) == 0 {
			continue
		}
		resp.Groups.Teams = append(resp.Groups.Teams, panelGroup{
			Id:       ti.id,
			Name:     ti.name,
			PanelIds: pids,
		})
	}

	resp.Groups.MultiPanels = make([]panelGroup, 0, len(multiPanels))
	for _, mi := range multiPanels {
		pids := mpPanels[mi.id]
		if len(pids) == 0 {
			continue
		}
		name := "Multipanel"
		if mi.title != nil && *mi.title != "" {
			name = *mi.title
		}
		resp.Groups.MultiPanels = append(resp.Groups.MultiPanels, panelGroup{
			Id:       mi.id,
			Name:     name,
			PanelIds: pids,
		})
	}

	if defaultPanelIds == nil {
		defaultPanelIds = []int{}
	}
	resp.Groups.DefaultTeamPanelIds = defaultPanelIds

	ctx.JSON(200, resp)
}

// computePrevious returns nil when days == 0 (all-time has no previous
// period). Otherwise it populates the previous-period metrics.
func computePrevious(days int, prev panelRawMetrics) *panelPreviousMetrics {
	if days == 0 {
		return nil
	}
	return &panelPreviousMetrics{
		TicketCount:             prev.ticketCount,
		ClosedCount:             prev.closedCount,
		AvgFirstResponseSeconds: prev.avgFrtSecs,
		AvgResolutionSeconds:    prev.avgResSecs,
		AvgRating:               prev.avgRating,
		RatingCount:             prev.ratingCount,
	}
}

// computeTrend computes the four trend deltas. Returns nil when days == 0.
// Previous zero yields nil for that metric, never infinity or -100%.
func computeTrend(days int, current, previous panelRawMetrics) *panelTrendMetrics {
	if days == 0 {
		return nil
	}

	return &panelTrendMetrics{
		TicketCountPct:   computePctChange(float64(current.ticketCount), float64(previous.ticketCount)),
		FirstResponsePct: computePctChangePtr(current.avgFrtSecs, previous.avgFrtSecs),
		ResolutionPct:    computePctChangePtr(current.avgResSecs, previous.avgResSecs),
		RatingDelta:      computeAbsDelta(current.avgRating, previous.avgRating),
	}
}

// computePctChange returns the percentage change from previous to current.
// Returns nil when previous is zero to avoid infinity.
func computePctChange(current, previous float64) *float64 {
	if previous == 0 {
		return nil
	}
	pct := ((current - previous) / previous) * 100
	return &pct
}

// computePctChangePtr handles nullable float64 pointers.
func computePctChangePtr(current, previous *float64) *float64 {
	if current == nil || previous == nil {
		return nil
	}
	return computePctChange(*current, *previous)
}

// computeAbsDelta returns the absolute difference between two nullable
// float64s. Used for rating, which is on a 1-5 scale where percentages
// are misleading.
func computeAbsDelta(current, previous *float64) *float64 {
	if current == nil || previous == nil {
		return nil
	}
	delta := *current - *previous
	return &delta
}

// assignInts copies a scanned int4[] into dst, treating SQL NULL as empty.
// ARRAY_AGG with FILTER yields NULL when no rows matched, which is the normal
// case for a panel belonging to no team. Letting pgtype decode the value keeps
// us correct under both the text and binary wire protocols.
func assignInts(arr pgtype.Int4Array, dst *[]int) error {
	if arr.Status != pgtype.Present {
		*dst = nil
		return nil
	}

	return arr.AssignTo(dst)
}
