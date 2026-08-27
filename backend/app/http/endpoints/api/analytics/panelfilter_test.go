package api_analytics

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestParsePanelFilter(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name         string
		query        string
		expectOk     bool
		expectNil    bool
		expectFilter *database.PanelFilter
		expectStatus int
	}{
		{
			name:      "absent",
			query:     "",
			expectOk:  true,
			expectNil: true,
		},
		{
			name:      "empty string",
			query:     "panels=",
			expectOk:  true,
			expectNil: true,
		},
		{
			name:     "none alone",
			query:    "panels=none",
			expectOk: true,
			expectFilter: &database.PanelFilter{
				IncludeUnassigned: true,
			},
		},
		{
			name:     "single panel",
			query:    "panels=1",
			expectOk: true,
			expectFilter: &database.PanelFilter{
				PanelIds: []int{1},
			},
		},
		{
			name:     "panel and none",
			query:    "panels=1,none",
			expectOk: true,
			expectFilter: &database.PanelFilter{
				PanelIds:          []int{1},
				IncludeUnassigned: true,
			},
		},
		{
			name:     "deduplicate",
			query:    "panels=1,1,5",
			expectOk: true,
			expectFilter: &database.PanelFilter{
				PanelIds: []int{1, 5},
			},
		},
		{
			name:     "NONE case insensitive",
			query:    "panels=NONE",
			expectOk: true,
			expectFilter: &database.PanelFilter{
				IncludeUnassigned: true,
			},
		},
		{
			name:         "abc rejected",
			query:        "panels=abc",
			expectOk:     false,
			expectStatus: http.StatusBadRequest,
		},
		{
			name:         "negative rejected",
			query:        "panels=-1",
			expectOk:     false,
			expectStatus: http.StatusBadRequest,
		},
		{
			name:         "zero rejected",
			query:        "panels=0",
			expectOk:     false,
			expectStatus: http.StatusBadRequest,
		},
		{
			name:     "sorted output",
			query:    "panels=5,1,3",
			expectOk: true,
			expectFilter: &database.PanelFilter{
				PanelIds: []int{1, 3, 5},
			},
		},
		{
			name:     "whitespace trimmed",
			query:    "panels=+1+,+5+,+none+",
			expectOk: true,
			expectFilter: &database.PanelFilter{
				PanelIds:          []int{1, 5},
				IncludeUnassigned: true,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(w)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/test?"+tc.query, nil)

			filter, ok := parsePanelFilter(ctx)

			require.Equal(t, tc.expectOk, ok, "ok mismatch")

			if !tc.expectOk {
				require.Equal(t, tc.expectStatus, w.Code, "expected HTTP %d", tc.expectStatus)
				return
			}

			if tc.expectNil {
				require.Nil(t, filter, "expected nil filter")
				return
			}

			require.NotNil(t, filter, "expected non-nil filter")
			require.Equal(t, tc.expectFilter.IncludeUnassigned, filter.IncludeUnassigned)

			if tc.expectFilter.PanelIds == nil {
				require.Nil(t, filter.PanelIds)
			} else {
				require.Equal(t, tc.expectFilter.PanelIds, filter.PanelIds)
			}
		})
	}
}

func TestParsePanelFilter_TooManyIds(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Build a query string with 201 distinct IDs.
	parts := make([]string, 201)
	for i := range parts {
		parts[i] = strconv.Itoa(i + 1)
	}
	query := "panels=" + strings.Join(parts, ",")

	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/test?"+query, nil)

	_, ok := parsePanelFilter(ctx)
	require.False(t, ok)
	require.Equal(t, http.StatusBadRequest, w.Code)
}
