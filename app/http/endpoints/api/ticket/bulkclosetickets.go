package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/common/closerelay"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type bulkCloseBody struct {
	TicketIds []int  `json:"ticket_ids"`
	Reason    string `json:"reason"`
}

type bulkCloseResult struct {
	Closed          []int             `json:"closed"`
	Failed          map[string]string `json:"failed"`
	BackgroundCount int               `json:"background_count,omitempty"`
}

func BulkCloseTickets(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	var body bulkCloseBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if len(body.TicketIds) == 0 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("No ticket IDs provided"))
		return
	}

	if len(body.TicketIds) > 100 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Cannot close more than 100 tickets at once"))
		return
	}

	result := bulkCloseResult{
		Closed: []int{},
		Failed: map[string]string{},
	}

	deadline := time.Now().Add(bulkTimeoutSeconds * time.Second)

	closeOne := func(opCtx context.Context, ticketId int) bool {
		ticket, err := database.Client.Tickets.Get(opCtx, ticketId, guildId)
		if err != nil || ticket.UserId == 0 {
			return false
		}

		hasPermission, requestErr := utils.HasPermissionToViewTicket(opCtx, guildId, userId, ticket)
		if requestErr != nil || !hasPermission {
			return false
		}

		data := closerelay.TicketClose{
			GuildId:  guildId,
			TicketId: ticket.Id,
			UserId:   userId,
			Reason:   body.Reason,
		}

		if err := closerelay.Publish(redis.Client.Client, data); err != nil {
			_ = app.NewError(err, fmt.Sprintf("Failed to publish close event for ticket #%d", ticketId))
			return false
		}

		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   dbmodel.AuditActionTicketClose,
			ResourceType: dbmodel.AuditResourceTicket,
			ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
			Metadata:     map[string]interface{}{"reason": data.Reason, "bulk": true},
		})
		return true
	}

	var backgroundIds []int

	for i, ticketId := range body.TicketIds {
		if time.Now().After(deadline) {
			backgroundIds = body.TicketIds[i:]
			break
		}

		if closeOne(c, ticketId) {
			result.Closed = append(result.Closed, ticketId)
		} else {
			result.Failed[strconv.Itoa(ticketId)] = fmt.Sprintf("Failed to close ticket #%d", ticketId)
		}

		if i < len(body.TicketIds)-1 && !time.Now().After(deadline) {
			time.Sleep(3 * time.Second)
		}
	}

	if len(backgroundIds) > 0 {
		result.BackgroundCount = len(backgroundIds)
		go func() {
			for i, ticketId := range backgroundIds {
				closeOne(context.Background(), ticketId)
				if i < len(backgroundIds)-1 {
					time.Sleep(3 * time.Second)
				}
			}
		}()
	}

	c.JSON(http.StatusOK, result)
}
