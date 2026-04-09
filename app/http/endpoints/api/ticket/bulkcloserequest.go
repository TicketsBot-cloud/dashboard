package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	messagetypes "github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/gin-gonic/gin"
)

type bulkCloseRequestBody struct {
	TicketIds  []int   `json:"ticket_ids"`
	Reason     *string `json:"reason"`
	CloseDelay *int    `json:"close_delay"`
}

type bulkCloseRequestResult struct {
	Sent            []int             `json:"sent"`
	Failed          map[string]string `json:"failed"`
	BackgroundCount int               `json:"background_count,omitempty"`
}

func BulkCloseRequest(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	var body bulkCloseRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if len(body.TicketIds) == 0 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("No ticket IDs provided"))
		return
	}

	if len(body.TicketIds) > 100 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Cannot send close requests to more than 100 tickets at once"))
		return
	}

	if body.Reason != nil && len(*body.Reason) > 255 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Reason must be 255 characters or fewer"))
		return
	}

	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	var closeAt *time.Time
	if body.CloseDelay != nil && *body.CloseDelay > 0 {
		t := time.Now().Add(time.Hour * time.Duration(*body.CloseDelay))
		closeAt = &t
	}

	result := bulkCloseRequestResult{
		Sent:   []int{},
		Failed: map[string]string{},
	}

	deadline := time.Now().Add(bulkTimeoutSeconds * time.Second)

	locale := utils.ResolveGuildLocale(context.Background(), guildId)
	msgEmbed, components := buildCloseRequestMessage(locale, userId, body.Reason)

	sendOne := func(opCtx context.Context, ticketId int) bool {
		ticket, err := database.Client.Tickets.Get(opCtx, ticketId, guildId)
		if err != nil || ticket.UserId == 0 {
			return false
		}

		hasPermission, requestErr := utils.HasPermissionToViewTicket(opCtx, guildId, userId, ticket)
		if requestErr != nil || !hasPermission {
			return false
		}

		closeReq := dbmodel.CloseRequest{
			GuildId:  guildId,
			TicketId: ticketId,
			UserId:   userId,
			CloseAt:  closeAt,
			Reason:   body.Reason,
		}

		if err := database.Client.CloseRequest.Set(opCtx, closeReq); err != nil {
			_ = app.NewError(err, fmt.Sprintf("Failed to save close request for ticket #%d", ticketId))
			return false
		}

		if err := database.Client.Tickets.SetStatus(opCtx, guildId, ticketId, model.TicketStatusPending); err != nil {
			_ = app.NewError(err, fmt.Sprintf("Failed to update status for ticket #%d", ticketId))
			return false
		}

		if ticket.ChannelId != nil {
			_, _ = rest.CreateMessage(opCtx, botCtx.Token, botCtx.RateLimiter, *ticket.ChannelId, rest.CreateMessageData{
				Content: fmt.Sprintf("<@%d>", ticket.UserId),
				Embeds:  []*embed.Embed{msgEmbed},
				AllowedMentions: messagetypes.AllowedMention{
					Users: []uint64{ticket.UserId},
				},
				Components: components,
			})
		}

		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   dbmodel.AuditActionTicketCloseRequest,
			ResourceType: dbmodel.AuditResourceTicket,
			ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
			Metadata:     map[string]interface{}{"reason": body.Reason, "bulk": true},
		})
		return true
	}

	var backgroundIds []int

	for i, ticketId := range body.TicketIds {
		if time.Now().After(deadline) {
			backgroundIds = body.TicketIds[i:]
			break
		}

		if sendOne(c, ticketId) {
			result.Sent = append(result.Sent, ticketId)
		} else {
			result.Failed[strconv.Itoa(ticketId)] = fmt.Sprintf("Failed to send close request for ticket #%d", ticketId)
		}

		if i < len(body.TicketIds)-1 && !time.Now().After(deadline) {
			time.Sleep(3 * time.Second)
		}
	}

	if len(backgroundIds) > 0 {
		result.BackgroundCount = len(backgroundIds)
		go func() {
			for i, ticketId := range backgroundIds {
				sendOne(context.Background(), ticketId)
				if i < len(backgroundIds)-1 {
					time.Sleep(3 * time.Second)
				}
			}
		}()
	}

	c.JSON(http.StatusOK, result)
}
