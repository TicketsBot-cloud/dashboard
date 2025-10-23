package api

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/objects/user"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/gin-gonic/gin"
)

var MentionRegex, _ = regexp.Compile("<@(\\d+)>")

func GetTicket(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	ticketId, err := strconv.Atoi(c.Param("ticketId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid ticket ID provided: %s", c.Param("ticketId")))
		return
	}

	// Get the ticket struct
	ticket, err := dbclient.Client.Tickets.Get(c, ticketId, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to load ticket. Please try again."))
		return
	}

	if ticket.GuildId != guildId {
		c.JSON(http.StatusForbidden, utils.ErrorStr("Ticket #%d does not belong to guild %d", ticketId, guildId))
		return
	}

	if !ticket.Open {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Ticket #%d has been closed and is no longer accessible", ticketId))
		return
	}

	hasPermission, requestErr := utils.HasPermissionToViewTicket(c, guildId, userId, ticket)
	if requestErr != nil {
		c.JSON(requestErr.StatusCode, app.NewError(requestErr, fmt.Sprintf("Failed to verify permissions for user %d to view ticket #%d", userId, ticketId)))
		return
	}

	if !hasPermission {
		c.JSON(http.StatusForbidden, utils.ErrorStr("User %d does not have permission to view ticket #%d", userId, ticketId))
		return
	}

	if ticket.ChannelId == nil {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Ticket #%d has no associated Discord channel", ticketId))
		return
	}

	messages, err := fetchMessages(botContext, ticket)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, fmt.Sprintf("Failed to fetch messages for ticket #%d from Discord", ticketId)))
		return
	}

	c.JSON(200, gin.H{
		"success":  true,
		"ticket":   ticket,
		"messages": messages,
	})
}

type StrippedMessage struct {
	Author      user.User             `json:"author"`
	Content     string                `json:"content"`
	Timestamp   time.Time             `json:"timestamp"`
	Attachments []channel.Attachment  `json:"attachments"`
	Embeds      []embed.Embed         `json:"embeds"`
	Components  []component.Component `json:"components"`
}

func fetchMessages(botContext *botcontext.BotContext, ticket database.Ticket) ([]StrippedMessage, error) {
	// Get messages
	messages, err := rest.GetChannelMessages(context.Background(), botContext.Token, botContext.RateLimiter, *ticket.ChannelId, rest.GetChannelMessagesData{Limit: 100})
	if err != nil {
		return nil, err
	}

	// Format messages, exclude unneeded data
	stripped := make([]StrippedMessage, len(messages))
	for i, message := range utils.Reverse(messages) {
		stripped[i] = StrippedMessage{
			Author:      message.Author,
			Content:     message.Content,
			Timestamp:   message.Timestamp,
			Attachments: message.Attachments,
			Embeds:      message.Embeds,
			Components:  message.Components,
		}
	}

	return stripped, nil
}
