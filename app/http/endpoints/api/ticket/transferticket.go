package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/claimrelay"
	"github.com/TicketsBot-cloud/common/permission"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type transferBody struct {
	UserId uint64 `json:"user_id,string"`
}

func TransferTicket(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	ticketId, err := strconv.Atoi(c.Param("ticketId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid ticket ID provided: %s", c.Param("ticketId")))
		return
	}

	var body transferBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if body.UserId == 0 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("You must specify a staff member to transfer the ticket to"))
		return
	}

	ticket, err := database.Client.Tickets.Get(c, ticketId, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to load ticket. Please try again."))
		return
	}

	if ticket.UserId == 0 {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Ticket #%d not found", ticketId))
		return
	}

	if ticket.IsThread {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Thread-mode tickets cannot be transferred"))
		return
	}

	hasPermission, requestErr := utils.HasPermissionToViewTicket(context.Background(), guildId, userId, ticket)
	if requestErr != nil {
		c.JSON(requestErr.StatusCode, app.NewError(requestErr,
			fmt.Sprintf("Failed to verify permissions for user %d to transfer ticket #%d", userId, ticketId)))
		return
	}

	if !hasPermission {
		c.JSON(http.StatusForbidden, utils.ErrorStr("User %d does not have permission to transfer ticket #%d", userId, ticketId))
		return
	}

	// The target must be a staff member (Support+)
	targetLevel, err := utils.GetPermissionLevel(context.Background(), guildId, body.UserId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify the target user's permission level"))
		return
	}

	if targetLevel < permission.Support {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("You can only transfer a ticket to a staff member"))
		return
	}

	// Reassign the claim to the target (transfer overwrites any existing claim)
	priorClaimer, _ := database.Client.TicketClaims.Get(c, guildId, ticketId)

	if err := database.Client.TicketClaims.Set(c, guildId, ticket.Id, body.UserId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to transfer ticket. Please try again."))
		return
	}

	if err := claimrelay.Publish(redis.Client.Client, claimrelay.TicketClaim{
		GuildId:  guildId,
		TicketId: ticket.Id,
		UserId:   body.UserId,
		Claim:    true,
	}); err != nil {
		// Restore the previous claim state if we couldn't hand off the Discord-side work
		if priorClaimer == 0 {
			_ = database.Client.TicketClaims.Delete(context.Background(), guildId, ticket.Id)
		} else {
			_ = database.Client.TicketClaims.Set(context.Background(), guildId, ticket.Id, priorClaimer)
		}
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to publish ticket transfer event to Redis"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTicketTransfer,
		ResourceType: dbmodel.AuditResourceTicket,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
		Metadata:     map[string]interface{}{"target_user_id": strconv.FormatUint(body.UserId, 10)},
	})

	c.JSON(200, utils.SuccessResponse)
}
