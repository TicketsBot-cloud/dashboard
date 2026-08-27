package api_analytics

import (
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

const maxPanelFilterIds = 200

// fanOutLimit caps how many connections a single analytics request may hold at
// once. The analytics handlers fan out far wider than the pool is deep, so
// without a cap one request queues every acquisition ahead of every other
// endpoint sharing the pool and stalls them for several query rounds.
//
// Derived from the configured pool size rather than hardcoded, so lowering
// DATABASE_MAX_CONNS cannot silently turn the cap into a no-op.
func fanOutLimit() int {
	maxConns := int(config.Conf.Database.MaxConns)
	if maxConns < 2 {
		return 1
	}

	return maxConns / 2
}

// parsePanelFilter reads the "panels" query param and returns a *PanelFilter.
//
// Absent or empty returns nil (no filter), never "match nothing".
//
// "none" (case-insensitive, that spelling only) sets IncludeUnassigned.
// Other tokens must parse as positive base-10 integers. Duplicates are removed.
//
// This deliberately diverges from parseDays, which coerces junk to 30:
// a wrong days value shows a differently-sized window that the UI labels
// correctly, whereas a silently-ignored panels param shows whole-guild
// numbers labelled as one panel's numbers.
func parsePanelFilter(ctx *gin.Context) (*database.PanelFilter, bool) {
	raw := strings.TrimSpace(ctx.Query("panels"))
	if raw == "" {
		return nil, true
	}

	tokens := strings.Split(raw, ",")

	// Bound the work before allocating anything sized by the input. The header
	// limit allows on the order of 150k tokens, which would otherwise build a
	// map and slice of that size before being rejected below.
	if len(tokens) > maxPanelFilterIds {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Too many panel IDs in filter (maximum 200)."))
		return nil, false
	}

	var includeUnassigned bool
	seen := make(map[int]bool)
	var ids []int

	for _, tok := range tokens {
		tok = strings.TrimSpace(tok)
		if tok == "" {
			continue
		}

		if strings.EqualFold(tok, "none") {
			includeUnassigned = true
			continue
		}

		id, err := strconv.Atoi(tok)
		if err != nil || id <= 0 {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid panel ID in filter."))
			return nil, false
		}

		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}

	if len(ids) > maxPanelFilterIds {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Too many panel IDs in filter (maximum 200)."))
		return nil, false
	}

	if len(ids) == 0 && !includeUnassigned {
		return nil, true
	}

	// Canonical order. The SQL text never varies with the filter contents, so
	// this is not about the statement cache; it makes the bound array stable
	// so that equivalent requests reuse the same query plan.
	sort.Ints(ids)

	return &database.PanelFilter{
		PanelIds:          ids,
		IncludeUnassigned: includeUnassigned,
	}, true
}
