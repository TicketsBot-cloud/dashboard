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

func ClaimTicket(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	ticketId, err := strconv.Atoi(c.Param("ticketId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid ticket ID provided: %s", c.Param("ticketId")))
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
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Thread-mode tickets cannot be claimed"))
		return
	}

	hasPermission, requestErr := utils.HasPermissionToViewTicket(context.Background(), guildId, userId, ticket)
	if requestErr != nil {
		c.JSON(requestErr.StatusCode, app.NewError(requestErr,
			fmt.Sprintf("Failed to verify permissions for user %d to claim ticket #%d", userId, ticketId)))
		return
	}

	if !hasPermission {
		c.JSON(http.StatusForbidden, utils.ErrorStr("User %d does not have permission to claim ticket #%d", userId, ticketId))
		return
	}

	// Claim only if the ticket is currently unclaimed, otherwise block it
	claimed, _, err := database.Client.TicketClaims.TryClaim(c, guildId, ticket.Id, userId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to claim ticket. Please try again."))
		return
	}

	if !claimed {
		c.JSON(http.StatusConflict, utils.ErrorStr("Ticket #%d has already been claimed", ticketId))
		return
	}

	if err := claimrelay.Publish(redis.Client.Client, claimrelay.TicketClaim{
		GuildId:  guildId,
		TicketId: ticket.Id,
		UserId:   userId,
		Claim:    true,
	}); err != nil {
		// Roll back the claim if we couldn't hand off the Discord-side work
		_ = database.Client.TicketClaims.Delete(context.Background(), guildId, ticket.Id)
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to publish ticket claim event to Redis"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTicketClaim,
		ResourceType: dbmodel.AuditResourceTicket,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
	})

	c.JSON(200, utils.SuccessResponse)
}

func UnclaimTicket(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	ticketId, err := strconv.Atoi(c.Param("ticketId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid ticket ID provided: %s", c.Param("ticketId")))
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
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Thread-mode tickets cannot be unclaimed"))
		return
	}

	hasPermission, requestErr := utils.HasPermissionToViewTicket(context.Background(), guildId, userId, ticket)
	if requestErr != nil {
		c.JSON(requestErr.StatusCode, app.NewError(requestErr,
			fmt.Sprintf("Failed to verify permissions for user %d to unclaim ticket #%d", userId, ticketId)))
		return
	}

	if !hasPermission {
		c.JSON(http.StatusForbidden, utils.ErrorStr("User %d does not have permission to unclaim ticket #%d", userId, ticketId))
		return
	}

	// Only the claimer or an admin may unclaim
	claimedBy, err := database.Client.TicketClaims.Get(c, guildId, ticketId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to load ticket claim. Please try again."))
		return
	}

	if claimedBy == 0 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Ticket #%d is not claimed", ticketId))
		return
	}

	if claimedBy != userId {
		permLevel, err := utils.GetPermissionLevel(context.Background(), guildId, userId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify permission level"))
			return
		}

		if permLevel < permission.Admin {
			c.JSON(http.StatusForbidden, utils.ErrorStr("Only the claimer or an admin can unclaim this ticket"))
			return
		}
	}

	if err := claimrelay.Publish(redis.Client.Client, claimrelay.TicketClaim{
		GuildId:  guildId,
		TicketId: ticket.Id,
		UserId:   userId,
		Claim:    false,
	}); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to publish ticket unclaim event to Redis"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTicketUnclaim,
		ResourceType: dbmodel.AuditResourceTicket,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
	})

	c.JSON(200, utils.SuccessResponse)
}
