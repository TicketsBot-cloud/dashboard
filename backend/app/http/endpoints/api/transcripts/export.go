package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/archiverclient"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func ExportTranscript(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	ticketId, ok := ownedTranscriptId(ctx, guildId, userId)
	if !ok {
		return
	}

	transcript, err := utils.ArchiverClient.Get(ctx, guildId, ticketId)
	if err != nil {
		if archiverclient.IsNotFound(err) {
			ctx.JSON(http.StatusNotFound, utils.ErrorStr("This ticket has no transcript."))
		} else {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch records. Please try again."))
		}

		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTranscriptExport,
		ResourceType: database.AuditResourceTranscript,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
	})

	ctx.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="transcript-%d-%d.json"`, guildId, ticketId))
	ctx.JSON(http.StatusOK, transcript)
}
