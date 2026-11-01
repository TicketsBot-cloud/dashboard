package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
)

func TestResendsMessage(t *testing.T) {
	tests := []struct {
		name                   string
		storedChannel, channel uint64
		storedV2, usesV2       bool
		want                   bool
	}{
		{name: "classic edits in place", storedChannel: 1, channel: 1},
		{name: "V2 edits in place", storedChannel: 1, channel: 1, storedV2: true, usesV2: true},
		{name: "classic to V2 edits in place", storedChannel: 1, channel: 1, usesV2: true},
		{name: "V2 back to classic resends", storedChannel: 1, channel: 1, storedV2: true, want: true},
		{name: "a channel change resends", storedChannel: 1, channel: 2, want: true},
		{name: "a channel change resends a V2 message", storedChannel: 1, channel: 2, storedV2: true, usesV2: true, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, resendsMessage(tt.storedChannel, tt.channel, tt.storedV2, tt.usesV2))
		})
	}
}

func TestShouldRepost(t *testing.T) {
	restError := func(status, code int) error {
		return request.RestError{StatusCode: status, ApiError: request.ApiV8Error{Code: code}}
	}

	tests := []struct {
		name        string
		err         error
		classicEdit bool
		liveV2      bool
		want        bool
		wantLookups int
	}{
		{name: "message gone", err: restError(404, 10008), classicEdit: true, want: true},
		{name: "another bot's message", err: restError(403, 50005), want: true},
		{name: "V2 message under a Classic row", err: restError(400, 50035), classicEdit: true, liveV2: true, want: true, wantLookups: 1},
		{name: "Classic message refused for its content", err: restError(400, 50035), classicEdit: true, wantLookups: 1},
		{name: "V2 edit refused", err: restError(400, 50035), liveV2: true},
		{name: "missing permissions", err: restError(403, 50013), classicEdit: true, liveV2: true},
		{name: "Discord unavailable", err: restError(502, 0), classicEdit: true, liveV2: true},
		{name: "transport error", err: errors.New("context deadline exceeded"), classicEdit: true, liveV2: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lookups := 0
			isComponentsV2 := func() bool {
				lookups++
				return tt.liveV2
			}

			require.Equal(t, tt.want, shouldRepost(tt.err, tt.classicEdit, isComponentsV2))
			require.Equal(t, tt.wantLookups, lookups)
		})
	}
}

func TestAbortPanelMessageError(t *testing.T) {
	gin.SetMode(gin.TestMode)

	invalidBody := request.RestError{
		StatusCode: 400,
		ApiError: request.ApiV8Error{
			Code:    50035,
			Message: "Invalid Form Body",
			Errors: []request.FieldError{{
				FieldName: "components[0].content",
				Code:      "BASE_TYPE_MAX_LENGTH",
				Message:   "Must be 4000 or fewer in length.",
			}},
		},
	}

	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantError  string
	}{
		{
			name:       "Discord refuses the message",
			err:        invalidBody,
			wantStatus: http.StatusBadRequest,
			wantError:  "Failed to update panel message: Invalid Form Body: components[0].content: Must be 4000 or fewer in length. (BASE_TYPE_MAX_LENGTH)",
		},
		{name: "Discord unavailable", err: request.RestError{StatusCode: 502, ApiError: request.ApiV8Error{Message: "Bad Gateway"}}, wantStatus: http.StatusInternalServerError},
		{name: "transport error", err: errors.New("context deadline exceeded"), wantStatus: http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			abortPanelMessageError(c, tt.err)
			require.Equal(t, tt.wantStatus, w.Code)

			if tt.wantStatus == http.StatusInternalServerError {
				require.Len(t, c.Errors, 1)

				var apiError *app.ApiError
				require.ErrorAs(t, c.Errors.Last(), &apiError)
				require.Equal(t, "Failed to update panel", apiError.ExternalMessage)
				return
			}

			require.Empty(t, c.Errors)

			var body map[string]any
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
			require.Equal(t, tt.wantError, body["error"])
		})
	}
}
