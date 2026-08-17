package utils

import (
	"testing"

	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/internal/admin"
	"github.com/stretchr/testify/require"
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
