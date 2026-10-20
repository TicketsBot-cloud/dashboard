package api

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPanelName(t *testing.T) {
	str := func(s string) *string { return &s }

	tests := []struct {
		name    string
		in      *string
		want    *string
		wantErr bool
	}{
		{name: "omitted", in: nil, want: nil},
		{name: "empty", in: str(""), want: nil},
		{name: "whitespace only", in: str("  \t "), want: nil},
		{name: "trimmed", in: str("  Billing  "), want: str("Billing")},
		{name: "exactly 100 characters", in: str(strings.Repeat("a", 100)), want: str(strings.Repeat("a", 100))},
		{name: "100 multi-byte characters", in: str(strings.Repeat("é", 100)), want: str(strings.Repeat("é", 100))},
		{name: "101 characters", in: str(strings.Repeat("a", 101)), wantErr: true},
		{name: "100 characters plus padding", in: str(" " + strings.Repeat("a", 100) + " "), want: str(strings.Repeat("a", 100))},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data := panelBody{Name: tt.in}

			err := validateName(PanelValidationContext{Data: data})()
			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.Equal(t, tt.want, data.trimmedName())
		})
	}
}
