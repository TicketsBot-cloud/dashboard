package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/TicketsBot-cloud/archiverclient"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func TestOwnedTranscriptIdRejectsInvalidIds(t *testing.T) {
	for _, param := range []string{"", "abc", "0", "-1", "+5", "1.5", "1e3", "2147483648"} {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Params = gin.Params{{Key: "ticketId", Value: param}}

		_, ok := ownedTranscriptId(ctx, 1, 2)
		require.False(t, ok, param)
		require.Equal(t, http.StatusBadRequest, rec.Code, param)
		require.JSONEq(t, `{"success":false,"error":"Invalid request data. Please check your input and try again."}`, rec.Body.String(), param)
	}
}

func TestOwnedTranscriptIdRejectsNonOwner(t *testing.T) {
	prev := fetchGuild
	fetchGuild = func(context.Context, uint64) (guild.Guild, error) { return guild.Guild{Id: 1, OwnerId: 9}, nil }
	t.Cleanup(func() { fetchGuild = prev })

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Params = gin.Params{{Key: "ticketId", Value: "5"}}

	_, ok := ownedTranscriptId(ctx, 1, 2)
	require.False(t, ok)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.JSONEq(t, `{"success":false,"error":"Only the server owner can delete or export transcripts."}`, rec.Body.String())
}

func TestDeleteArchivedTranscriptTreatsMissingAsDeleted(t *testing.T) {
	statuses := map[string]int{"1": http.StatusNoContent, "2": http.StatusNotFound, "3": http.StatusInternalServerError}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(statuses[r.URL.Query().Get("id")])
		w.Write([]byte(`{"message":"client not found"}`))
	}))
	t.Cleanup(srv.Close)

	prev := utils.ArchiverProxy
	utils.ArchiverProxy = archiverclient.NewProxyRetriever(srv.URL)
	t.Cleanup(func() { utils.ArchiverProxy = prev })

	for ticketId, wantDeleted := range map[int]bool{1: true, 2: true, 3: false} {
		err := deleteArchivedTranscript(context.Background(), 9, ticketId)
		require.Equal(t, wantDeleted, err == nil, "ticket %d: %v", ticketId, err)
	}
}
