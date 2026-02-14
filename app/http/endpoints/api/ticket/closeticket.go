package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/closerelay"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type closeBody struct {
	Reason string `json:"reason"`
}

func CloseTicket(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	ticketId, err := strconv.Atoi(c.Param("ticketId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid ticket ID provided: %s", c.Param("ticketId")))
		return
	}

	var body closeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	// Get the ticket struct
	ticket, err := database.Client.Tickets.Get(c, ticketId, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to load ticket. Please try again."))
		return
	}

	// Verify the ticket exists
	if ticket.UserId == 0 {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Ticket #%d not found", ticketId))
		return
	}

	hasPermission, requestErr := utils.HasPermissionToViewTicket(context.Background(), guildId, userId, ticket)
	if requestErr != nil {
		c.JSON(requestErr.StatusCode, app.NewError(requestErr,
			fmt.Sprintf("Failed to verify permissions for user %d to close ticket #%d", userId, ticketId)))
		return
	}

	if !hasPermission {
		c.JSON(http.StatusForbidden, utils.ErrorStr("User %d does not have permission to close ticket #%d", userId, ticketId))
		return
	}

	data := closerelay.TicketClose{
		GuildId:  guildId,
		TicketId: ticket.Id,
		UserId:   userId,
		Reason:   body.Reason,
	}

	if err := closerelay.Publish(redis.Client.Client, data); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to publish ticket close event to Redis"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTicketClose,
		ResourceType: dbmodel.AuditResourceTicket,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
		Metadata:     map[string]interface{}{"reason": data.Reason},
	})
	c.JSON(200, utils.SuccessResponse)
}
