package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type closeReasonUpdatePayload struct {
	GuildId  uint64 `json:"guild_id"`
	TicketId int    `json:"ticket_id"`
}

type updateCloseReasonBody struct {
	Reason string `json:"reason"`
}

func UpdateCloseReason(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	ticketId, err := strconv.Atoi(c.Param("ticketId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid ticket ID provided: %s", c.Param("ticketId")))
		return
	}

	var body updateCloseReasonBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
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

	if ticket.Open {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Cannot update close reason: ticket #%d is still open", ticketId))
		return
	}

	hasPermission, requestErr := utils.HasPermissionToViewTicket(context.Background(), guildId, userId, ticket)
	if requestErr != nil {
		c.JSON(requestErr.StatusCode, app.NewError(requestErr,
			fmt.Sprintf("Failed to verify permissions for user %d on ticket #%d", userId, ticketId)))
		return
	}

	if !hasPermission {
		c.JSON(http.StatusForbidden, utils.ErrorStr("User %d does not have permission to edit ticket #%d", userId, ticketId))
		return
	}

	existing, _, err := database.Client.CloseReason.Get(c, guildId, ticketId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to load close reason. Please try again."))
		return
	}

	reason := body.Reason
	updated := dbmodel.CloseMetadata{
		Reason:   &reason,
		ClosedBy: existing.ClosedBy,
	}

	if err := database.Client.CloseReason.Set(c, guildId, ticketId, updated); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to update close reason. Please try again."))
		return
	}

	// Notify worker to update the archive channel message
	if payload, err := json.Marshal(closeReasonUpdatePayload{GuildId: guildId, TicketId: ticketId}); err == nil {
		redis.Client.Publish(redis.DefaultContext(), "tickets:close_reason_update", payload)
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTicketCloseReasonUpdate,
		ResourceType: dbmodel.AuditResourceTicket,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
		Metadata:     map[string]interface{}{"reason": reason},
	})

	c.JSON(http.StatusOK, utils.SuccessResponse)
}
