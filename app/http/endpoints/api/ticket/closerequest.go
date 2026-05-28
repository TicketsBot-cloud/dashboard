package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
	"github.com/TicketsBot-cloud/gdl/objects/guild/emoji"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/worker/i18n"
	"github.com/gin-gonic/gin"
)

type closeRequestBody struct {
	Reason     *string `json:"reason"`
	CloseDelay *int    `json:"close_delay"`
}

func CloseRequest(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	ticketId, err := strconv.Atoi(c.Param("ticketId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid ticket ID provided: %s", c.Param("ticketId")))
		return
	}

	var body closeRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if body.Reason != nil && len(*body.Reason) > 255 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Reason must be 255 characters or fewer"))
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

	hasPermission, requestErr := utils.HasPermissionToViewTicket(context.Background(), guildId, userId, ticket)
	if requestErr != nil {
		c.JSON(requestErr.StatusCode, app.NewError(requestErr,
			fmt.Sprintf("Failed to verify permissions for user %d on ticket #%d", userId, ticketId)))
		return
	}

	if !hasPermission {
		c.JSON(http.StatusForbidden, utils.ErrorStr("User %d does not have permission to send a close request for ticket #%d", userId, ticketId))
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

	closeReq := dbmodel.CloseRequest{
		GuildId:  guildId,
		TicketId: ticketId,
		UserId:   userId,
		CloseAt:  closeAt,
		Reason:   body.Reason,
	}

	if err := database.Client.CloseRequest.Set(c, closeReq); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save close request"))
		return
	}

	if err := database.Client.Tickets.SetStatus(c, guildId, ticketId, model.TicketStatusPending); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update ticket status"))
		return
	}

	if !ticket.IsThread {
		if err := database.Client.CategoryUpdateQueue.Add(c, guildId, ticketId, model.TicketStatusPending); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to queue category update"))
			return
		}
	}

	if ticket.ChannelId != nil {
		locale := utils.ResolveGuildLocale(context.Background(), guildId)
		msgEmbed, components := buildCloseRequestMessage(locale, userId, body.Reason)
		_, _ = rest.CreateMessage(context.Background(), botCtx.Token, botCtx.RateLimiter, *ticket.ChannelId, rest.CreateMessageData{
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
		Metadata:     map[string]interface{}{"reason": body.Reason},
	})

	c.JSON(http.StatusOK, utils.SuccessResponse)
}

func buildCloseRequestMessage(locale *i18n.Locale, requesterId uint64, reason *string) (*embed.Embed, []component.Component) {
	var description string
	if reason == nil || strings.TrimSpace(*reason) == "" {
		description = i18n.GetMessage(locale, i18n.MessageCloseRequestNoReason, requesterId)
	} else {
		description = i18n.GetMessage(locale, i18n.MessageCloseRequestWithReason, requesterId, strings.ReplaceAll(*reason, "`", "\\`"))
	}

	msgEmbed := &embed.Embed{
		Title:       i18n.GetMessage(locale, i18n.TitleCloseRequest),
		Description: description,
		Color:       0x2ECC71,
	}

	components := []component.Component{
		component.BuildActionRow(
			component.BuildButton(component.Button{
				Label:    i18n.GetMessage(locale, i18n.MessageCloseRequestAccept),
				CustomId: "close_request_accept",
				Style:    component.ButtonStyleSuccess,
				Emoji:    &emoji.Emoji{Name: "☑️"},
			}),
			component.BuildButton(component.Button{
				Label:    i18n.GetMessage(locale, i18n.MessageCloseRequestDeny),
				CustomId: "close_request_deny",
				Style:    component.ButtonStyleSecondary,
				Emoji:    &emoji.Emoji{Name: "❌"},
			}),
		),
	}

	return msgEmbed, components
}
