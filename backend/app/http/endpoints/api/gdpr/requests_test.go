package gdpr

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/TicketsBot-cloud/common/gdprrelay"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/stretchr/testify/require"
)

func TestValidateCreateBody(t *testing.T) {
	manyGuilds := make([]uint64, 101)
	for i := range manyGuilds {
		manyGuilds[i] = uint64(i + 1)
	}

	manyCategories := make([]string, 26)
	for i := range manyCategories {
		manyCategories[i] = "settings"
	}

	tests := []struct {
		name        string
		body        createRequestBody
		want        gdprrelay.GDPRRequest
		wantErr     bool
		wantInvalid []string
	}{
		{name: "unknown type", body: createRequestBody{Type: "delete", Scope: "all", GuildIds: []uint64{1}}, wantErr: true},
		{name: "unknown scope", body: createRequestBody{Type: "anonymize", Scope: "some", GuildIds: []uint64{1}}, wantErr: true},
		{
			name: "every ticket separator",
			body: createRequestBody{Type: "anonymize", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "1,2;3\n4\t5 6 1"},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeSpecificMessages, GuildIds: []uint64{1}, TicketIds: []int{1, 2, 3, 4, 5, 6}},
		},
		{
			name:        "invalid ticket tokens",
			body:        createRequestBody{Type: "anonymize", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "1, 0, -1, abc, 1.5"},
			wantErr:     true,
			wantInvalid: []string{"0", "-1", "abc", "1.5"},
		},
		{
			name: "anonymize all dedupes servers",
			body: createRequestBody{Type: "anonymize", Scope: "all", GuildIds: []uint64{2, 1, 2}},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeAllMessages, GuildIds: []uint64{1, 2}},
		},
		{name: "anonymize all without servers", body: createRequestBody{Type: "anonymize", Scope: "all"}, wantErr: true},
		{name: "anonymize all with ticket ids", body: createRequestBody{Type: "anonymize", Scope: "all", GuildIds: []uint64{1}, TicketIds: "5"}, wantErr: true},
		{name: "anonymize specific with two servers", body: createRequestBody{Type: "anonymize", Scope: "specific", GuildIds: []uint64{1, 2}, TicketIds: "5"}, wantErr: true},
		{name: "anonymize specific without ticket ids", body: createRequestBody{Type: "anonymize", Scope: "specific", GuildIds: []uint64{1}}, wantErr: true},
		{
			name: "transcripts all with several servers",
			body: createRequestBody{Type: "transcripts", Scope: "all", GuildIds: []uint64{2, 1, 2}},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeAllTranscripts, GuildIds: []uint64{1, 2}},
		},
		{name: "transcripts all without servers", body: createRequestBody{Type: "transcripts", Scope: "all"}, wantErr: true},
		{name: "transcripts all with ticket ids", body: createRequestBody{Type: "transcripts", Scope: "all", GuildIds: []uint64{1}, TicketIds: "5"}, wantErr: true},
		{name: "transcripts all with categories", body: createRequestBody{Type: "transcripts", Scope: "all", GuildIds: []uint64{1}, Categories: []string{"transcripts"}}, wantErr: true},
		{
			name: "transcripts specific",
			body: createRequestBody{Type: "transcripts", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "4, 2"},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeSpecificTranscripts, GuildIds: []uint64{1}, TicketIds: []int{4, 2}},
		},
		{name: "transcripts specific with two servers", body: createRequestBody{Type: "transcripts", Scope: "specific", GuildIds: []uint64{1, 2}, TicketIds: "5"}, wantErr: true},
		{name: "transcripts specific without ticket ids", body: createRequestBody{Type: "transcripts", Scope: "specific", GuildIds: []uint64{1}}, wantErr: true},
		{name: "transcripts specific invalid ticket ids", body: createRequestBody{Type: "transcripts", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "5, x"}, wantErr: true, wantInvalid: []string{"x"}},
		{name: "transcripts specific with categories", body: createRequestBody{Type: "transcripts", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "5", Categories: []string{"transcripts"}}, wantErr: true},
		{
			name: "server all ignores picked categories",
			body: createRequestBody{Type: "server", Scope: "all", GuildIds: []uint64{1, 2}, Categories: []string{"tags"}},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeExportGuild, GuildIds: []uint64{1, 2}, Categories: database.GdprExportTypeServer.Categories()},
		},
		{name: "server all without servers", body: createRequestBody{Type: "server", Scope: "all"}, wantErr: true},
		{name: "server all with ticket ids", body: createRequestBody{Type: "server", Scope: "all", GuildIds: []uint64{1}, TicketIds: "5"}, wantErr: true},
		{
			name: "server specific categories canonical and deduped",
			body: createRequestBody{Type: "server", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "7", Categories: []string{"transcripts", "settings", "transcripts"}},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeExportGuild, GuildIds: []uint64{1}, TicketIds: []int{7}, Categories: []string{"settings", "transcripts"}},
		},
		{name: "server specific with two servers", body: createRequestBody{Type: "server", Scope: "specific", GuildIds: []uint64{1, 2}, Categories: []string{"tags"}}, wantErr: true},
		{name: "server specific without categories", body: createRequestBody{Type: "server", Scope: "specific", GuildIds: []uint64{1}}, wantErr: true},
		{name: "server specific with a user category", body: createRequestBody{Type: "server", Scope: "specific", GuildIds: []uint64{1}, Categories: []string{"settings", "account"}}, wantErr: true},
		{name: "server specific ticket ids without transcripts", body: createRequestBody{Type: "server", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "7", Categories: []string{"settings"}}, wantErr: true},
		{
			name: "user all",
			body: createRequestBody{Type: "user", Scope: "all"},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeExportUser, Categories: database.GdprExportTypeUser.Categories()},
		},
		{name: "user all with a server", body: createRequestBody{Type: "user", Scope: "all", GuildIds: []uint64{1}}, wantErr: true},
		{name: "user all with ticket ids", body: createRequestBody{Type: "user", Scope: "all", TicketIds: "3"}, wantErr: true},
		{
			name: "user specific categories only",
			body: createRequestBody{Type: "user", Scope: "specific", Categories: []string{"gdpr_requests", "settings"}},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeExportUser, Categories: []string{"settings", "gdpr_requests"}},
		},
		{
			name: "user specific server and ticket ids",
			body: createRequestBody{Type: "user", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "3", Categories: []string{"transcripts"}},
			want: gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeExportUser, GuildIds: []uint64{1}, TicketIds: []int{3}, Categories: []string{"transcripts"}},
		},
		{name: "user specific server without ticket ids", body: createRequestBody{Type: "user", Scope: "specific", GuildIds: []uint64{1}, Categories: []string{"transcripts"}}, wantErr: true},
		{name: "user specific ticket ids without server", body: createRequestBody{Type: "user", Scope: "specific", TicketIds: "3", Categories: []string{"transcripts"}}, wantErr: true},
		{name: "user specific with two servers", body: createRequestBody{Type: "user", Scope: "specific", GuildIds: []uint64{1, 2}, TicketIds: "3", Categories: []string{"transcripts"}}, wantErr: true},
		{name: "user specific ticket ids without transcripts", body: createRequestBody{Type: "user", Scope: "specific", GuildIds: []uint64{1}, TicketIds: "3", Categories: []string{"settings"}}, wantErr: true},
		{name: "user specific with a server category", body: createRequestBody{Type: "user", Scope: "specific", Categories: []string{"panels"}}, wantErr: true},
		{name: "too many servers", body: createRequestBody{Type: "anonymize", Scope: "all", GuildIds: manyGuilds}, wantErr: true},
		{name: "too many categories", body: createRequestBody{Type: "user", Scope: "specific", Categories: manyCategories}, wantErr: true},
		{name: "ticket input too long", body: createRequestBody{Type: "anonymize", Scope: "specific", GuildIds: []uint64{1}, TicketIds: strings.Repeat("1,", 501)}, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, reqErr := validateCreateBody(tt.body)
			if tt.wantErr {
				require.NotNil(t, reqErr)
				require.Equal(t, http.StatusBadRequest, reqErr.Status)
				require.Equal(t, tt.wantInvalid, reqErr.InvalidTicketIds)
				return
			}

			require.Nil(t, reqErr)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestMergeGdprRequests(t *testing.T) {
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	serverKey, userKey := "server/10.zip", "user/11.zip"

	logs := []database.GDPRLog{
		{Id: 3, RequestType: "ExportGuild", Status: database.GdprLogStatusCompleted, RequestDate: now.Add(-time.Hour)},
		{Id: 2, RequestType: "AllMessages", Status: database.GdprLogStatusQueued, RequestDate: now.Add(-2 * time.Hour)},
		{Id: 1, RequestType: "ExportUser", Status: database.GdprLogStatusCompleted, RequestDate: now.Add(-31 * 24 * time.Hour)},
	}

	exports := []database.GdprExport{
		{Id: 11, Type: database.GdprExportTypeUser, RequesterId: 5, Status: database.GdprExportStatusReady, ObjectKey: &userKey, GdprLogId: 1, ExpiresAt: now.Add(-time.Hour)},
		{Id: 10, Type: database.GdprExportTypeServer, RequesterId: 5, GuildIds: []uint64{100, 200}, Categories: []string{"settings"}, Status: database.GdprExportStatusReady, ObjectKey: &serverKey, GdprLogId: 3, ExpiresAt: now.Add(time.Hour)},
	}

	guilds := map[uint64]guild.Guild{100: {Id: 100, Name: "Alpha"}}

	got := mergeGdprRequests(logs, exports, guilds, now)

	require.Len(t, got, 3)
	require.Equal(t, []int{3, 2, 1}, []int{got[0].Id, got[1].Id, got[2].Id})

	require.NotNil(t, got[0].Export)
	require.EqualValues(t, 10, got[0].Export.Id)
	require.Equal(t, []string{"settings"}, got[0].Export.Categories)
	require.Nil(t, got[0].Export.TicketIds)
	require.Equal(t, []gdprGuild{{Id: 200, Name: "200"}, {Id: 100, Name: "Alpha"}}, got[0].Export.Guilds)
	require.True(t, got[0].Export.Downloadable)

	require.Nil(t, got[1].Export)

	require.NotNil(t, got[2].Export)
	require.EqualValues(t, 11, got[2].Export.Id)
	require.False(t, got[2].Export.Downloadable, "an expired ready export is not downloadable")
}

func TestTranscriptAuditEntries(t *testing.T) {
	all := transcriptAuditEntries(gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeAllTranscripts, UserId: 5, GuildIds: []uint64{1, 2}}, 9)
	require.Len(t, all, 2)
	for i, guildId := range []uint64{1, 2} {
		require.Equal(t, guildId, *all[i].GuildId)
		require.EqualValues(t, 5, all[i].UserId)
		require.Equal(t, database.AuditActionTranscriptDeleteAll, all[i].ActionType)
		require.Equal(t, database.AuditResourceTranscript, all[i].ResourceType)
		require.Nil(t, all[i].ResourceId)
		require.Equal(t, map[string]any{"gdpr_request_id": 9}, all[i].Metadata)
	}

	specific := transcriptAuditEntries(gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeSpecificTranscripts, UserId: 5, GuildIds: []uint64{3}, TicketIds: []int{7, 8}}, 9)
	require.Len(t, specific, 2)
	for i, ticketId := range []string{"7", "8"} {
		require.EqualValues(t, 3, *specific[i].GuildId)
		require.Equal(t, database.AuditActionTranscriptDelete, specific[i].ActionType)
		require.Equal(t, ticketId, *specific[i].ResourceId)
	}

	require.Empty(t, transcriptAuditEntries(gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeAllMessages, UserId: 5, GuildIds: []uint64{1}}, 9))
}

func TestNotOwnerError(t *testing.T) {
	err := notOwnerError([]uint64{1, 2, 3}, map[uint64]string{1: "Alpha", 3: ""})
	require.Equal(t, http.StatusForbidden, err.Status)
	require.Equal(t, "You must be the owner of every server you choose. Not owned: Alpha (1), 2, 3", err.Error)

	require.Equal(t, "You must be the owner of every server you choose. Not owned: 4", notOwnerError([]uint64{4}, nil).Error)
}

func TestExportDownloadError(t *testing.T) {
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	key := "user/1.zip"
	ready := database.GdprExport{RequesterId: 5, Status: database.GdprExportStatusReady, ObjectKey: &key, ExpiresAt: now.Add(time.Minute)}

	with := func(change func(e *database.GdprExport)) *database.GdprExport {
		e := ready
		change(&e)
		return &e
	}

	tests := []struct {
		name   string
		export *database.GdprExport
		want   int
	}{
		{name: "missing", export: nil, want: http.StatusNotFound},
		{name: "other requester", export: with(func(e *database.GdprExport) { e.RequesterId = 6 }), want: http.StatusNotFound},
		{name: "queued", export: with(func(e *database.GdprExport) { e.Status, e.ObjectKey = database.GdprExportStatusQueued, nil }), want: http.StatusConflict},
		{name: "processing", export: with(func(e *database.GdprExport) { e.Status, e.ObjectKey = database.GdprExportStatusProcessing, nil }), want: http.StatusConflict},
		{name: "failed", export: with(func(e *database.GdprExport) { e.Status, e.ObjectKey = database.GdprExportStatusFailed, nil }), want: http.StatusConflict},
		{name: "no data", export: with(func(e *database.GdprExport) { e.Status, e.ObjectKey = database.GdprExportStatusNoData, nil }), want: http.StatusConflict},
		{name: "ready without object key", export: with(func(e *database.GdprExport) { e.ObjectKey = nil }), want: http.StatusConflict},
		{name: "expires now", export: with(func(e *database.GdprExport) { e.ExpiresAt = now }), want: http.StatusGone},
		{name: "expired", export: with(func(e *database.GdprExport) { e.ExpiresAt = now.Add(-time.Hour) }), want: http.StatusGone},
		{name: "ready", export: &ready, want: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, exportDownloadError(tt.export, 5, now))
		})
	}
}
