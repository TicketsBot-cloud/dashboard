package api

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/archiverclient"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/chatreplica"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func GetTranscriptRenderHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	// format ticket ID
	ticketId, err := strconv.Atoi(ctx.Param("ticketId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr(fmt.Sprintf("Invalid ticket ID provided: %s", ctx.Param("ticketId"))))
		return
	}

	// get ticket object
	ticket, err := dbclient.Client.Tickets.Get(ctx, ticketId, guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Unable to load ticket. Please try again."))
		return
	}

	// Verify this is a valid ticket and it is closed
	if ticket.UserId == 0 || ticket.Open {
		ctx.JSON(404, utils.ErrorStr("Transcript not found"))
		return
	}

	// Verify the user has permissions to be here
	// ticket.UserId cannot be 0
	if ticket.UserId != userId {
		hasPermission, err := utils.HasPermissionToViewTicket(ctx, guildId, userId, ticket)
		if err != nil {
			ctx.JSON(err.StatusCode, utils.ErrorStr("Failed to query database. Please try again."))
			return
		}

		if !hasPermission {
			ctx.JSON(403, utils.ErrorStr("You do not have permission to view this transcript"))
			return
		}
	}

	// retrieve ticket messages from bucket
	transcript, err := utils.ArchiverClient.Get(ctx, guildId, ticketId)
	if err != nil {
		if errors.Is(err, archiverclient.ErrNotFound) {
			ctx.JSON(404, utils.ErrorStr("Transcript not found"))
		} else {
			_ = ctx.AbortWithError(500, app.NewError(err, "Failed to process request. Please try again."))
		}

		return
	}

	// Render
	payload := chatreplica.FromTranscript(transcript, ticketId)
	// html, err := chatreplica.Render(payload)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to process request. Please try again."))
		return
	}

	ctx.JSON(200, payload)
}
