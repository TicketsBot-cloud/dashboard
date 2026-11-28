package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type fakeSnapshotWriter struct {
	applied bool
	err     error

	calls []database.WhitelabelBot
}

func (f *fakeSnapshotWriter) WriteEncryptedIfSnapshot(_ context.Context, snapshot database.WhitelabelBot, _, _ uint64, _ string, _ []byte, _ int16) (bool, error) {
	f.calls = append(f.calls, snapshot)
	return f.applied, f.err
}

func TestStoreSnapshotted(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name         string
		writer       *fakeSnapshotWriter
		snapshot     database.WhitelabelBot
		wantProceed  bool
		wantStatus   int
		wantBodyPart string
		wantAbortErr bool
	}{
		{name: "new row written", writer: &fakeSnapshotWriter{applied: true}, wantProceed: true, wantStatus: http.StatusOK},
		{name: "existing row written", writer: &fakeSnapshotWriter{applied: true}, snapshot: database.WhitelabelBot{BotId: 5}, wantProceed: true, wantStatus: http.StatusOK},
		{name: "snapshot superseded returns 409", writer: &fakeSnapshotWriter{applied: false}, snapshot: database.WhitelabelBot{BotId: 5}, wantStatus: http.StatusConflict, wantBodyPart: "Please refresh the page and try again."},
		{name: "insert lost to another bot owner returns 409", writer: &fakeSnapshotWriter{applied: false}, wantStatus: http.StatusConflict, wantBodyPart: "already in use"},
		{name: "store error aborts with 500", writer: &fakeSnapshotWriter{err: errors.New("db down")}, wantStatus: http.StatusInternalServerError, wantAbortErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodPost, "/", nil)

			got := storeSnapshotted(c, tt.writer, tt.snapshot, 1, 2, "pk", []byte("sealed"), 1)

			require.Equal(t, tt.wantProceed, got)
			require.Equal(t, []database.WhitelabelBot{tt.snapshot}, tt.writer.calls)

			if tt.wantAbortErr {
				require.Error(t, c.Errors.Last())
				require.NotContains(t, rec.Body.String(), "db down")
				return
			}

			if !tt.wantProceed {
				require.Equal(t, tt.wantStatus, rec.Code)
				require.Contains(t, rec.Body.String(), tt.wantBodyPart)
				require.Contains(t, rec.Body.String(), `"success":false`)
			}
		})
	}
}
