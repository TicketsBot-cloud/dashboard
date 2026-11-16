package gdpr

import (
	"context"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/TicketsBot-cloud/common/gdprrelay"
	commonutils "github.com/TicketsBot-cloud/common/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
	"go.uber.org/zap"
)

type requestResponse struct {
	Id          int             `json:"id"`
	RequestType string          `json:"request_type"`
	Status      string          `json:"status"`
	RequestedAt time.Time       `json:"requested_at"`
	Export      *exportResponse `json:"export,omitempty"`
}

type exportResponse struct {
	Id           int64                     `json:"id"`
	Type         database.GdprExportType   `json:"type"`
	Status       database.GdprExportStatus `json:"status"`
	Guilds       []gdprGuild               `json:"guilds"`
	Categories   []string                  `json:"categories"`
	TicketIds    []int                     `json:"ticket_ids"`
	ExpiresAt    time.Time                 `json:"expires_at"`
	Downloadable bool                      `json:"downloadable"`
}

type createRequestBody struct {
	Type       string                  `json:"type"`
	Scope      string                  `json:"scope"`
	GuildIds   types.UInt64StringSlice `json:"guild_ids"`
	TicketIds  string                  `json:"ticket_ids"`
	Categories []string                `json:"categories"`
}

type requestError struct {
	Status           int      `json:"-"`
	Error            string   `json:"error"`
	InvalidTicketIds []string `json:"invalid_ticket_ids,omitempty"`
}

func ListRequests(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	logs, err := dbclient.Client.GdprLogs.ListByRequester(ctx, database.HashGdprRequester(userId))
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch records. Please try again."))
		return
	}

	exports, err := dbclient.Client.GdprExports.ListByRequester(ctx, userId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch records. Please try again."))
		return
	}

	var guildIds []uint64
	for _, export := range exports {
		guildIds = append(guildIds, export.GuildIds...)
	}

	guilds, err := cache.Instance.GetGuilds(ctx, guildIds)
	if err != nil {
		log.Logger.Warn("Failed to resolve GDPR export servers", zap.Error(err))
	}

	ctx.JSON(http.StatusOK, mergeGdprRequests(logs, exports, guilds, time.Now()))
}

func mergeGdprRequests(logs []database.GDPRLog, exports []database.GdprExport, guilds map[uint64]guild.Guild, now time.Time) []requestResponse {
	byLogId := make(map[int]database.GdprExport, len(exports))
	for _, export := range exports {
		byLogId[export.GdprLogId] = export
	}

	requests := make([]requestResponse, len(logs))
	for i, entry := range logs {
		requests[i] = requestResponse{
			Id:          entry.Id,
			RequestType: entry.RequestType,
			Status:      entry.Status,
			RequestedAt: entry.RequestDate,
		}

		if export, ok := byLogId[entry.Id]; ok {
			requests[i].Export = &exportResponse{
				Id:           export.Id,
				Type:         export.Type,
				Status:       export.Status,
				Guilds:       toGdprGuilds(export.GuildIds, guilds),
				Categories:   export.Categories,
				TicketIds:    export.TicketIds,
				ExpiresAt:    export.ExpiresAt,
				Downloadable: exportDownloadError(&export, export.RequesterId, now) == 0,
			}
		}
	}

	return requests
}

func CreateRequest(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body createRequestBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	request, reqErr := validateCreateBody(body)
	if reqErr != nil {
		ctx.JSON(reqErr.Status, reqErr)
		return
	}

	if !utils.RequireGdprWorker(ctx) {
		return
	}

	reqErr, err := checkScope(ctx, userId, request)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to check your request. Please try again."))
		return
	}

	if reqErr != nil {
		ctx.JSON(reqErr.Status, reqErr)
		return
	}

	request.UserId = userId
	request.Source = gdprrelay.SourceDashboard

	requestId, next, err := gdprrelay.Queue(ctx, redis.Client.Client, dbclient.Client, request)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to queue GDPR request. Please try again later."))
		return
	}

	for _, entry := range transcriptAuditEntries(request, requestId) {
		audit.Log(entry)
	}

	if next != nil {
		ctx.JSON(http.StatusTooManyRequests, gin.H{
			"success":         false,
			"error":           "You can request one export of this type every 24 hours.",
			"next_allowed_at": next,
		})
		return
	}

	ctx.JSON(http.StatusAccepted, gin.H{"success": true, "request_id": requestId})
}

func validateCreateBody(body createRequestBody) (gdprrelay.GDPRRequest, *requestError) {
	if len(body.GuildIds) > 100 || len(body.Categories) > 25 || len(body.TicketIds) > 1000 {
		return gdprrelay.GDPRRequest{}, badRequest("This request has too many servers, categories or ticket IDs.")
	}

	ticketIds, invalid := commonutils.ParseTicketIds(body.TicketIds)
	if len(invalid) > 0 {
		return gdprrelay.GDPRRequest{}, invalidTicketIds(invalid)
	}

	if body.Scope == "all" && len(ticketIds) > 0 {
		return gdprrelay.GDPRRequest{}, badRequest("Ticket IDs can only be used in a request for specific data.")
	}

	if body.Type == "transcripts" && len(body.Categories) > 0 {
		return gdprrelay.GDPRRequest{}, badRequest("A transcript deletion request doesn't take categories.")
	}

	guildIds := slices.Compact(slices.Sorted(slices.Values(body.GuildIds)))

	switch body.Type + "/" + body.Scope {
	case "anonymize/all":
		if len(guildIds) == 0 {
			return gdprrelay.GDPRRequest{}, badRequest("Select at least one server.")
		}

		return gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeAllMessages, GuildIds: guildIds}, nil
	case "anonymize/specific":
		if len(guildIds) != 1 {
			return gdprrelay.GDPRRequest{}, badRequest("Select one server.")
		}

		if len(ticketIds) == 0 {
			return gdprrelay.GDPRRequest{}, badRequest("Enter at least one ticket ID.")
		}

		return gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeSpecificMessages, GuildIds: guildIds, TicketIds: ticketIds}, nil
	case "transcripts/all":
		if len(guildIds) == 0 {
			return gdprrelay.GDPRRequest{}, badRequest("Select at least one server.")
		}

		return gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeAllTranscripts, GuildIds: guildIds}, nil
	case "transcripts/specific":
		if len(guildIds) != 1 {
			return gdprrelay.GDPRRequest{}, badRequest("Select one server.")
		}

		if len(ticketIds) == 0 {
			return gdprrelay.GDPRRequest{}, badRequest("Enter at least one ticket ID.")
		}

		return gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeSpecificTranscripts, GuildIds: guildIds, TicketIds: ticketIds}, nil
	case "server/all":
		if len(guildIds) == 0 {
			return gdprrelay.GDPRRequest{}, badRequest("Select at least one server.")
		}

		return gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeExportGuild, GuildIds: guildIds, Categories: database.GdprExportTypeServer.Categories()}, nil
	case "server/specific":
		if len(guildIds) != 1 {
			return gdprrelay.GDPRRequest{}, badRequest("Select one server.")
		}

		return specificExport(gdprrelay.RequestTypeExportGuild, guildIds, ticketIds, body.Categories)
	case "user/all":
		if len(guildIds) > 0 {
			return gdprrelay.GDPRRequest{}, badRequest("A personal data export of all data doesn't take servers.")
		}

		return gdprrelay.GDPRRequest{Type: gdprrelay.RequestTypeExportUser, Categories: database.GdprExportTypeUser.Categories()}, nil
	case "user/specific":
		if len(guildIds) > 1 {
			return gdprrelay.GDPRRequest{}, badRequest("Select at most one server.")
		}

		if (len(guildIds) == 1) != (len(ticketIds) > 0) {
			return gdprrelay.GDPRRequest{}, badRequest("Select a server and enter ticket IDs together, or leave both empty to export all of your transcripts.")
		}

		return specificExport(gdprrelay.RequestTypeExportUser, guildIds, ticketIds, body.Categories)
	default:
		return gdprrelay.GDPRRequest{}, badRequest("Unknown request type.")
	}
}

func specificExport(requestType gdprrelay.RequestType, guildIds []uint64, ticketIds []int, requested []string) (gdprrelay.GDPRRequest, *requestError) {
	categories, ok := gdprrelay.ExportTypes[requestType].NormaliseCategories(requested)
	if !ok {
		return gdprrelay.GDPRRequest{}, badRequest("Select at least one valid category.")
	}

	if len(ticketIds) > 0 && !slices.Contains(categories, database.GdprExportCategoryTranscripts) {
		return gdprrelay.GDPRRequest{}, badRequest("Ticket IDs can only be used when Transcripts is one of the selected categories.")
	}

	return gdprrelay.GDPRRequest{Type: requestType, GuildIds: guildIds, TicketIds: ticketIds, Categories: categories}, nil
}

func checkScope(ctx context.Context, userId uint64, request gdprrelay.GDPRRequest) (*requestError, error) {
	switch request.Type {
	case gdprrelay.RequestTypeAllMessages, gdprrelay.RequestTypeSpecificMessages:
		refs, err := dbclient.Client.Tickets.GetUserTranscriptRefs(ctx, userId)
		if err != nil {
			return nil, err
		}

		if len(missing(request.GuildIds, database.TranscriptRefGuildIds(refs))) > 0 {
			return badRequest("Invalid server ID provided."), nil
		}
	case gdprrelay.RequestTypeExportGuild, gdprrelay.RequestTypeAllTranscripts, gdprrelay.RequestTypeSpecificTranscripts:
		owned, err := cache.Instance.GetGuildIdsByOwner(ctx, userId)
		if err != nil {
			return nil, err
		}

		// The cache pre-filter bounds how many guilds are fetched from Discord.
		notOwned := missing(request.GuildIds, owned)
		if len(notOwned) == 0 {
			var unreachable []uint64
			_, notOwned, unreachable, err = commonutils.SplitOwnedGuilds(ctx, userId, request.GuildIds, utils.GetGuildLive)
			if err != nil {
				return nil, err
			}

			if len(unreachable) > 0 {
				ids := utils.Map(unreachable, func(id uint64) string { return strconv.FormatUint(id, 10) })
				return badRequest("The bot is not in these servers, so ownership can't be verified: " + strings.Join(ids, ", ")), nil
			}
		}

		if len(notOwned) > 0 {
			// Names come only from the caller's own server list, so a request can't reveal other servers' names.
			userGuilds, err := dbclient.Client.UserGuilds.Get(ctx, userId)
			if err != nil {
				log.Logger.Warn("Failed to resolve GDPR request servers", zap.Error(err))
			}

			names := make(map[uint64]string, len(userGuilds))
			for _, g := range userGuilds {
				names[g.GuildId] = g.Name
			}

			return notOwnerError(notOwned, names), nil
		}
	case gdprrelay.RequestTypeExportUser:
		if len(request.TicketIds) == 0 {
			return nil, nil
		}

		refs, err := dbclient.Client.Tickets.GetUserTranscriptRefs(ctx, userId)
		if err != nil {
			return nil, err
		}

		var allowed []int
		for _, ref := range refs {
			if ref.GuildId == request.GuildIds[0] {
				allowed = append(allowed, ref.TicketId)
			}
		}

		return ticketIdsIn(request.TicketIds, allowed), nil
	}

	if len(request.TicketIds) == 0 {
		return nil, nil
	}

	found, err := dbclient.Client.Tickets.FilterClosedWithTranscript(ctx, request.GuildIds[0], request.TicketIds)
	if err != nil {
		return nil, err
	}

	return ticketIdsIn(request.TicketIds, found), nil
}

func transcriptAuditEntries(request gdprrelay.GDPRRequest, requestId int) []audit.LogEntry {
	metadata := map[string]any{"gdpr_request_id": requestId}

	var entries []audit.LogEntry
	switch request.Type {
	case gdprrelay.RequestTypeAllTranscripts:
		for _, guildId := range request.GuildIds {
			entries = append(entries, audit.LogEntry{
				GuildId:      audit.Uint64Ptr(guildId),
				UserId:       request.UserId,
				ActionType:   database.AuditActionTranscriptDeleteAll,
				ResourceType: database.AuditResourceTranscript,
				Metadata:     metadata,
			})
		}
	case gdprrelay.RequestTypeSpecificTranscripts:
		for _, ticketId := range request.TicketIds {
			entries = append(entries, audit.LogEntry{
				GuildId:      audit.Uint64Ptr(request.GuildIds[0]),
				UserId:       request.UserId,
				ActionType:   database.AuditActionTranscriptDelete,
				ResourceType: database.AuditResourceTranscript,
				ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
				Metadata:     metadata,
			})
		}
	}

	return entries
}

func notOwnerError(guildIds []uint64, names map[uint64]string) *requestError {
	display := utils.Map(guildIds, func(id uint64) string { return commonutils.FormatGuildDisplay(id, names[id]) })
	return &requestError{Status: http.StatusForbidden, Error: "You must be the owner of every server you choose. Not owned: " + strings.Join(display, ", ")}
}

func ticketIdsIn(ticketIds, allowed []int) *requestError {
	if invalid := missing(ticketIds, allowed); len(invalid) > 0 {
		return invalidTicketIds(utils.Map(invalid, strconv.Itoa))
	}

	return nil
}

func missing[T comparable](requested, allowed []T) []T {
	var out []T
	for _, v := range requested {
		if !slices.Contains(allowed, v) {
			out = append(out, v)
		}
	}

	return out
}

func badRequest(message string) *requestError {
	return &requestError{Status: http.StatusBadRequest, Error: message}
}

func invalidTicketIds(invalid []string) *requestError {
	return &requestError{Status: http.StatusBadRequest, Error: "These ticket IDs can't be used: " + strings.Join(invalid, ", "), InvalidTicketIds: invalid}
}
