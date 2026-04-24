package automations

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// runSummary is the wire-facing projection of database.AutomationRun.
// We avoid sending []byte through Go's default JSON encoder (which base64s it)
// and cast the int64 id to string so the frontend doesn't lose precision on
// 53-bit JS numbers.
type runSummary struct {
	Id              string          `json:"id"`
	AutomationId    *string         `json:"automation_id,omitempty"`
	AutomationName  string          `json:"automation_name"`
	TriggerType     string          `json:"trigger_type"`
	TriggerPayload  json.RawMessage `json:"trigger_payload,omitempty"`
	Status          string          `json:"status"`
	StartedAt       time.Time       `json:"started_at"`
	FinishedAt      *time.Time      `json:"finished_at,omitempty"`
	DurationMs      *int            `json:"duration_ms,omitempty"`
	Error           *string         `json:"error,omitempty"`
	CausationId     string          `json:"causation_id"`
	WorkflowVersion int             `json:"workflow_version"`
}

type runsResponse struct {
	Runs   []runSummary `json:"runs"`
	Limit  int          `json:"limit"`
	Offset int          `json:"offset"`
}

const (
	defaultRunsLimit = 50
	maxRunsLimit     = 200
)

// ListRuns returns a paginated slice of execution records for an automation.
// Ordered newest-first by started_at. Always returns 200 with `runs: []` for
// empty results so the UI can distinguish "no data" from a fetch failure.
func ListRuns(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}

	limit, offset := parsePagination(c)

	rows, err := dbclient.Client.AutomationRuns.GetByAutomation(c, auto.Id, limit, offset)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load automation runs"))
		return
	}

	out := make([]runSummary, 0, len(rows))
	for _, r := range rows {
		out = append(out, projectRun(r))
	}

	c.JSON(200, runsResponse{Runs: out, Limit: limit, Offset: offset})
}

func parsePagination(c *gin.Context) (int, int) {
	limit := defaultRunsLimit
	if raw := c.Query("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
			if limit > maxRunsLimit {
				limit = maxRunsLimit
			}
		}
	}
	offset := 0
	if raw := c.Query("offset"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 0 {
			offset = n
		}
	}
	return limit, offset
}

func projectRun(r database.AutomationRun) runSummary {
	var autoId *string
	if r.AutomationId != nil {
		s := strconv.FormatInt(*r.AutomationId, 10)
		autoId = &s
	}

	// The DB stores the payload as raw JSON bytes. Embed it verbatim as a
	// json.RawMessage — no double-marshalling, and the frontend sees structured
	// JSON rather than a base64 blob.
	var payload json.RawMessage
	if len(r.TriggerPayload) > 0 {
		payload = json.RawMessage(r.TriggerPayload)
	}

	return runSummary{
		Id:              strconv.FormatInt(r.Id, 10),
		AutomationId:    autoId,
		AutomationName:  r.AutomationName,
		TriggerType:     r.TriggerType,
		TriggerPayload:  payload,
		Status:          r.Status,
		StartedAt:       r.StartedAt,
		FinishedAt:      r.FinishedAt,
		DurationMs:      r.DurationMs,
		Error:           r.Error,
		CausationId:     r.CausationId,
		WorkflowVersion: r.WorkflowVersion,
	}
}
