package api

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/archiverclient"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/chatreplica"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
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
		ctx.JSON(500, utils.ErrorStr("Unable to load ticket. Please try again."))
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

	hasContentPermission, contentErr := utils.HasPermissionToViewTicketContent(context.Background(), guildId, userId, ticket)
	if contentErr != nil {
		ctx.JSON(contentErr.StatusCode, utils.ErrorStr("Failed to verify content permissions. Please try again."))
		return
	}

	if !hasContentPermission {
		ctx.JSON(200, chatreplica.Payload{
			Entities: chatreplica.Entities{
				Users:    map[string]chatreplica.User{},
				Channels: map[string]chatreplica.Channel{},
				Roles:    map[string]chatreplica.Role{},
			},
			Messages:          []chatreplica.Message{},
			ChannelName:       fmt.Sprintf("ticket-%d", ticketId),
			ContentRestricted: true,
		})
		return
	}

	// retrieve ticket messages from bucket
	transcript, err := utils.ArchiverClient.Get(ctx, guildId, ticketId)
	if err != nil {
		if errors.Is(err, archiverclient.ErrNotFound) {
			ctx.JSON(404, utils.ErrorStr("Transcript not found"))
		} else {
			ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		}

		return
	}

	payload := chatreplica.FromTranscript(transcript, ticketId)

	ctx.JSON(200, payload)
}
