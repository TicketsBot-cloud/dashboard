package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/archiverclient"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
)

var fetchGuild = utils.GetGuildLive

func DeleteTranscript(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	ticketId, ok := ownedTranscriptId(ctx, guildId, userId)
	if !ok {
		return
	}

	if err := deleteArchivedTranscript(ctx, guildId, ticketId); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete the transcript. Please try again."))
		return
	}

	if err := dbclient.Client.Tickets.SetHasTranscript(ctx, guildId, ticketId, false); err != nil {
		log.Logger.Error("Failed to update has_transcript flag after deletion", zap.Uint64("guild_id", guildId), zap.Int("ticket_id", ticketId), zap.Error(err))
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTranscriptDelete,
		ResourceType: database.AuditResourceTranscript,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
	})

	ctx.Status(http.StatusNoContent)
}

func deleteArchivedTranscript(ctx context.Context, guildId uint64, ticketId int) error {
	if err := utils.ArchiverProxy.DeleteTicket(ctx, guildId, ticketId); err != nil && !errors.Is(err, archiverclient.ErrNotFound) {
		return err
	}
	return nil
}

func ownedTranscriptId(ctx *gin.Context, guildId, userId uint64) (int, bool) {
	ticketId, err := strconv.ParseUint(ctx.Param("ticketId"), 10, 31)
	if err != nil || ticketId == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return 0, false
	}

	guild, err := fetchGuild(ctx, guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return 0, false
	}

	if guild.OwnerId != userId {
		ctx.JSON(http.StatusForbidden, utils.ErrorStr("Only the server owner can delete or export transcripts."))
		return 0, false
	}

	found, err := dbclient.Client.Tickets.FilterClosedWithTranscript(ctx, guildId, []int{int(ticketId)})
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch records. Please try again."))
		return 0, false
	}

	if len(found) == 0 {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("This ticket has no transcript."))
		return 0, false
	}

	return int(ticketId), true
}
