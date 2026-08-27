package api_analytics

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestComputePctChange(t *testing.T) {
	tests := []struct {
		name     string
		current  float64
		previous float64
		expect   *float64
	}{
		{
			name:     "normal increase",
			current:  150,
			previous: 100,
			expect:   float64Ptr(50),
		},
		{
			name:     "normal decrease",
			current:  50,
			previous: 100,
			expect:   float64Ptr(-50),
		},
		{
			name:     "no change",
			current:  100,
			previous: 100,
			expect:   float64Ptr(0),
		},
		{
			name:     "previous zero",
			current:  50,
			previous: 0,
			expect:   nil,
		},
		{
			name:     "both zero",
			current:  0,
			previous: 0,
			expect:   nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := computePctChange(tc.current, tc.previous)
			if tc.expect == nil {
				require.Nil(t, result)
			} else {
				require.NotNil(t, result)
				require.InDelta(t, *tc.expect, *result, 0.001)
			}
		})
	}
}

func TestComputeAbsDelta(t *testing.T) {
	tests := []struct {
		name     string
		current  *float64
		previous *float64
		expect   *float64
	}{
		{
			name:     "normal increase",
			current:  float64Ptr(4.5),
			previous: float64Ptr(4.0),
			expect:   float64Ptr(0.5),
		},
		{
			name:     "normal decrease",
			current:  float64Ptr(3.0),
			previous: float64Ptr(4.0),
			expect:   float64Ptr(-1.0),
		},
		{
			name:     "current nil",
			current:  nil,
			previous: float64Ptr(4.0),
			expect:   nil,
		},
		{
			name:     "previous nil",
			current:  float64Ptr(4.0),
			previous: nil,
			expect:   nil,
		},
		{
			name:     "both nil",
			current:  nil,
			previous: nil,
			expect:   nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := computeAbsDelta(tc.current, tc.previous)
			if tc.expect == nil {
				require.Nil(t, result)
			} else {
				require.NotNil(t, result)
				require.InDelta(t, *tc.expect, *result, 0.001)
			}
		})
	}
}

func TestComputeTrendNilWhenDaysZero(t *testing.T) {
	// When days == 0 (all time), there is no previous period, so trend must be nil.
	trend := computeTrend(0, panelRawMetrics{
		ticketCount: 100,
	}, panelRawMetrics{
		ticketCount: 50,
	})
	require.Nil(t, trend, "trend must be nil when days == 0")
}

func TestComputePreviousNilWhenDaysZero(t *testing.T) {
	prev := computePrevious(0, panelRawMetrics{
		ticketCount: 50,
	})
	require.Nil(t, prev, "previous must be nil when days == 0")
}
