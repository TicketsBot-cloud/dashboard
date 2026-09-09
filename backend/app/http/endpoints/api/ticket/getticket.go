package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/objects/user"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

var embedMentionRegex = regexp.MustCompile(`<@!?(\d+)>`)

type ticketUser struct {
	Id       uint64 `json:"id,string"`
	Username string `json:"username"`
}

type ticketViewData struct {
	Id       int         `json:"id"`
	PanelId  *int        `json:"panel_id"`
	OpenedAt time.Time   `json:"opened_at"`
	Opener   ticketUser  `json:"opener"`
	Claimer  *ticketUser `json:"claimer"`
}

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

	hasContentPermission, contentErr := utils.HasPermissionToViewTicketContent(c, guildId, userId, ticket)
	if contentErr != nil {
		c.JSON(contentErr.StatusCode, app.NewError(contentErr, fmt.Sprintf("Failed to verify content permissions for user %d on ticket #%d", userId, ticketId)))
		return
	}

	var panelTitle *string
	if ticket.PanelId != nil {
		panel, err := dbclient.Client.Panel.GetById(c, *ticket.PanelId)
		if err == nil {
			panelTitle = &panel.Title
		}
	}

	claimedById, _ := dbclient.Client.TicketClaims.Get(c, guildId, ticketId)

	userIds := []uint64{ticket.UserId}
	if claimedById != 0 {
		userIds = append(userIds, claimedById)
	}
	resolvedUsers, err := cache.Instance.GetUsers(c, userIds)
	if err != nil {
		resolvedUsers = map[uint64]user.User{}
	}

	openerUser := resolvedUsers[ticket.UserId]
	opener := ticketUser{Id: ticket.UserId, Username: openerUser.Username}

	var claimer *ticketUser
	if claimedById != 0 {
		claimerUser := resolvedUsers[claimedById]
		claimer = &ticketUser{Id: claimedById, Username: claimerUser.Username}
	}

	ticketData := ticketViewData{
		Id:       ticket.Id,
		PanelId:  ticket.PanelId,
		OpenedAt: ticket.OpenTime,
		Opener:   opener,
		Claimer:  claimer,
	}

	respond := func(messages []StrippedMessage, contentRestricted, channelMissing bool) {
		if messages == nil {
			messages = []StrippedMessage{}
		}

		c.JSON(200, gin.H{
			"success":            true,
			"ticket":             ticketData,
			"panel_title":        panelTitle,
			"messages":           messages,
			"content_restricted": contentRestricted,
			"channel_missing":    channelMissing,
		})
	}

	if !hasContentPermission {
		respond(nil, true, false)
		return
	}

	// 200 with a flag, not an error: the metadata stays usable so the ticket can still be closed.
	if ticket.ChannelId == nil {
		respond(nil, false, true)
		return
	}

	messages, err := fetchMessages(c.Request.Context(), botContext, ticket)
	if err != nil {
		if isUnknownChannel(err) {
			respond(nil, false, true)
			return
		}

		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, fmt.Sprintf("Failed to fetch messages for ticket #%d from Discord", ticketId)))
		return
	}

	respond(messages, false, false)
}

// 403/50001 is excluded: that channel exists, the bot just cannot read it.
func isUnknownChannel(err error) bool {
	var restErr request.RestError
	if !errors.As(err, &restErr) {
		return false
	}

	return restErr.StatusCode == http.StatusNotFound || restErr.ApiError.Code == 10003
}

type StrippedMessage struct {
	Author      user.User             `json:"author"`
	Content     string                `json:"content"`
	Timestamp   time.Time             `json:"timestamp"`
	Attachments []channel.Attachment  `json:"attachments"`
	Embeds      []embed.Embed         `json:"embeds"`
	Components  []component.Component `json:"components"`
	Mentions    []user.User           `json:"mentions"`
}

func fetchMessages(ctx context.Context, botContext *botcontext.BotContext, ticket database.Ticket) ([]StrippedMessage, error) {
	messages, err := rest.GetChannelMessages(ctx, botContext.Token, botContext.RateLimiter, *ticket.ChannelId, rest.GetChannelMessagesData{Limit: 100})
	if err != nil {
		return nil, err
	}

	// Format messages, exclude unneeded data
	stripped := make([]StrippedMessage, len(messages))
	for i, message := range utils.Reverse(messages) {
		mentions := make([]user.User, len(message.Mentions))
		for j, m := range message.Mentions {
			mentions[j] = m.User
		}
		stripped[i] = StrippedMessage{
			Author:      message.Author,
			Content:     message.Content,
			Timestamp:   message.Timestamp,
			Attachments: message.Attachments,
			Embeds:      message.Embeds,
			Components:  message.Components,
			Mentions:    mentions,
		}
	}

	// Collect user IDs mentioned in embed text that weren't in the content mentions.
	// One pass: build per-message ID lists and the global set simultaneously.
	perMessageEmbedIds := make([][]uint64, len(stripped))
	allEmbedIds := make(map[uint64]bool)
	for i, msg := range stripped {
		ids := collectEmbedMentionIdsForMessage(msg)
		perMessageEmbedIds[i] = ids
		for _, id := range ids {
			allEmbedIds[id] = true
		}
	}

	if len(allEmbedIds) > 0 {
		idSlice := make([]uint64, 0, len(allEmbedIds))
		for id := range allEmbedIds {
			idSlice = append(idSlice, id)
		}
		embedUsers, err := cache.Instance.GetUsers(ctx, idSlice)
		if err == nil {
			for i := range stripped {
				known := make(map[uint64]bool, len(stripped[i].Mentions))
				for _, u := range stripped[i].Mentions {
					known[u.Id] = true
				}
				for _, embedId := range perMessageEmbedIds[i] {
					if !known[embedId] {
						if u, ok := embedUsers[embedId]; ok {
							stripped[i].Mentions = append(stripped[i].Mentions, u)
							known[embedId] = true
						}
					}
				}
			}
		}
	}

	return stripped, nil
}

func collectEmbedMentionIdsForMessage(msg StrippedMessage) []uint64 {
	var ids []uint64
	for _, e := range msg.Embeds {
		for _, sub := range embedMentionRegex.FindAllStringSubmatch(e.Description, -1) {
			if id, err := strconv.ParseUint(sub[1], 10, 64); err == nil {
				ids = append(ids, id)
			}
		}
		for _, field := range e.Fields {
			for _, sub := range embedMentionRegex.FindAllStringSubmatch(field.Value, -1) {
				if id, err := strconv.ParseUint(sub[1], 10, 64); err == nil {
					ids = append(ids, id)
				}
			}
		}
	}
	return ids
}
