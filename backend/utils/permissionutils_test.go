package utils

import (
	"slices"
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/stretchr/testify/require"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/internal/admin"
)

func TestIsBotOwner(t *testing.T) {
	tests := []struct {
		name      string
		ownerId   uint64
		queryId   uint64
		expectOwn bool
	}{
		{
			name:      "matching owner",
			ownerId:   12345,
			queryId:   12345,
			expectOwn: true,
		},
		{
			name:      "non-matching user",
			ownerId:   12345,
			queryId:   99999,
			expectOwn: false,
		},
		{
			name:      "zero owner disables bypass",
			ownerId:   0,
			queryId:   12345,
			expectOwn: false,
		},
		{
			name:      "zero user against set owner",
			ownerId:   12345,
			queryId:   0,
			expectOwn: false,
		},
	}

	originalOwner := config.Conf.Owner
	defer func() { config.Conf.Owner = originalOwner }()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config.Conf.Owner = tt.ownerId
			require.Equal(t, tt.expectOwn, admin.IsBotOwner(tt.queryId))
		})
	}
}

func TestScopePanelFilter(t *testing.T) {
	tests := []struct {
		name       string
		filter     *database.PanelFilter
		accessible []int
		expectIds  []int
	}{
		{
			name:       "no filter returns accessible panels sorted",
			filter:     nil,
			accessible: []int{7, 3},
			expectIds:  []int{3, 7},
		},
		{
			name:       "filter is intersected with accessible panels",
			filter:     &database.PanelFilter{PanelIds: []int{1, 3, 9}},
			accessible: []int{3, 7, 9},
			expectIds:  []int{3, 9},
		},
		{
			name:       "disjoint filter matches nothing",
			filter:     &database.PanelFilter{PanelIds: []int{1, 2}},
			accessible: []int{3},
			expectIds:  []int{0},
		},
		{
			name:       "unassigned-only filter matches nothing",
			filter:     &database.PanelFilter{IncludeUnassigned: true},
			accessible: []int{3},
			expectIds:  []int{0},
		},
		{
			name:       "no accessible panels matches nothing",
			filter:     nil,
			accessible: nil,
			expectIds:  []int{0},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			accessibleBefore := slices.Clone(tt.accessible)

			scoped := ScopePanelFilter(tt.filter, tt.accessible)

			require.Equal(t, tt.expectIds, scoped.PanelIds)
			require.False(t, scoped.IncludeUnassigned)
			require.True(t, scoped.IsActive(), "scoped filter must never mean every panel")
			require.Equal(t, accessibleBefore, tt.accessible)
		})
	}
}
