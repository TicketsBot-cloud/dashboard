package automations

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// statsResponse is what the StatusStrip's sparkline consumes: a per-day series
// plus a lightweight summary the UI uses for "94% success (7d)" style text.
type statsResponse struct {
	Window int                      `json:"window_days"`
	Days   []dailyStatDTO           `json:"days"`
	Totals statsTotals              `json:"totals"`
}

type dailyStatDTO struct {
	Day     string `json:"day"` // ISO date (no time part)
	Total   int    `json:"total"`
	Success int    `json:"success"`
	Failed  int    `json:"failed"`
}

type statsTotals struct {
	Total          int     `json:"total"`
	Success        int     `json:"success"`
	Failed         int     `json:"failed"`
	SuccessRate    float64 `json:"success_rate"`     // 0.0 – 1.0; NaN-safe (0 when no runs)
	AvgDurationMs  int     `json:"avg_duration_ms"`  // average across all runs in the window
	Slow           bool    `json:"slow"`             // true if avg > slowThresholdMs
}

const (
	defaultStatsWindow = 7
	maxStatsWindow     = 90
)

// GetStats returns a per-day aggregate for the trailing `window` days (default 7).
// Zero-run days are included so the sparkline always has the full window shape.
func GetStats(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}

	window := defaultStatsWindow
	if raw := c.Query("window"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			window = n
			if window > maxStatsWindow {
				window = maxStatsWindow
			}
		}
	}

	days, err := dbclient.Client.AutomationRuns.StatsForAutomation(c, auto.Id, window)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load automation stats"))
		return
	}

	out := make([]dailyStatDTO, 0, len(days))
	var total, success, failed int
	for _, d := range days {
		out = append(out, dailyStatDTO{
			Day:     d.Day.UTC().Format("2006-01-02"),
			Total:   d.Total,
			Success: d.Success,
			Failed:  d.Failed,
		})
		total += d.Total
		success += d.Success
		failed += d.Failed
	}

	var rate float64
	if total > 0 {
		rate = float64(success) / float64(total)
	}

	// Average run duration across the window. Fetched separately since the
	// generate_series query doesn't carry duration data (runs table only).
	var avgDuration int
	{
		row := dbclient.Client.AutomationRuns.QueryRow(c,
			`SELECT COALESCE(AVG(duration_ms)::int, 0)
			   FROM automation_runs
			  WHERE automation_id = $1
			    AND started_at >= now() - make_interval(days => $2)`,
			auto.Id, window,
		)
		if err := row.Scan(&avgDuration); err != nil {
			log.Logger.Warn("stats: avg_duration query failed", zap.Error(err), zap.Int64("automation_id", auto.Id))
		}
	}

	const slowThresholdMs = 5000

	c.JSON(200, statsResponse{
		Window: window,
		Days:   out,
		Totals: statsTotals{
			Total:         total,
			Success:       success,
			Failed:        failed,
			SuccessRate:   rate,
			AvgDurationMs: avgDuration,
			Slow:          avgDuration > slowThresholdMs,
		},
	})
}
