package livechat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/golang-jwt/jwt"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/session"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/internal/api"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func (c *Client) HandleEvent(event Event) error {
	switch event.Type {
	case EventTypeAuth:
		var data AuthData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			c.Write(NewErrorMessage("Malformed event payload"))
			_ = c.Ws.Close()
			c.Flush()
			return err
		}

		if err := c.handleAuthEvent(data); err != nil {
			return err
		}
	}

	return nil
}

func (c *Client) handleAuthEvent(data AuthData) error {
	if c.authenticated.Load() {
		return api.NewErrorWithMessage(http.StatusBadRequest, errors.New("Already authenticated"), "Already authenticated")
	}

	token, err := jwt.Parse(data.Token, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		return []byte(config.Conf.Server.Secret), nil
	})
	if err != nil {
		return api.NewErrorWithMessage(http.StatusUnauthorized, err, "Invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return api.NewErrorWithMessage(http.StatusUnauthorized, err, "Invalid token data")
	}

	userIdStr, ok := claims["userid"].(string)
	if !ok {
		return api.NewErrorWithMessage(http.StatusUnauthorized, err, "Invalid token data")
	}

	userId, err := strconv.ParseUint(userIdStr, 10, 64)
	if err != nil {
		return api.NewErrorWithMessage(http.StatusUnauthorized, err, "Invalid token data")
	}

	store, err := session.Store.Get(userId)
	if err != nil || store.Expiry <= time.Now().Unix() {
		return api.NewErrorWithMessage(http.StatusUnauthorized, errors.New("session expired"), "Session has expired")
	}

	// Get the ticket
	ticket, err := dbclient.Client.Tickets.Get(context.Background(), c.TicketId, c.GuildId)
	if err != nil {
		return api.NewErrorWithMessage(http.StatusInternalServerError, err, "Unable to load ticket. Please try again.")
	}

	if ticket.Id == 0 || ticket.GuildId == 0 || ticket.GuildId != c.GuildId {
		return api.NewErrorWithMessage(http.StatusNotFound, err, "Ticket not found")
	}

	// Verify the user has permissions to be here
	hasPermission, requestErr := utils.HasPermissionToViewTicket(context.Background(), c.GuildId, userId, ticket)
	if requestErr != nil {
		return api.NewErrorWithMessage(http.StatusInternalServerError, err, "Error retrieving permission data")
	}

	if !hasPermission {
		return api.NewErrorWithMessage(http.StatusForbidden, errors.New("access denied"), "You do not have permission to view this ticket")
	}

	hasContentPermission, contentErr := utils.HasPermissionToViewTicketContent(context.Background(), c.GuildId, userId, ticket)
	if contentErr != nil {
		return contentErr
	}

	if !hasContentPermission {
		return api.NewErrorWithMessage(http.StatusForbidden, errors.New("content restricted"), "You do not have permission to view this ticket's content")
	}

	// Check premium
	botContext, err := botcontext.ContextForGuild(c.GuildId)
	if err != nil {
		return api.NewErrorWithMessage(http.StatusInternalServerError, err, "Unable to connect to Discord. Please try again later.")
	}

	// Verify the guild is premium
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(context.Background(), c.GuildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		return api.NewErrorWithMessage(http.StatusInternalServerError, err, "Error retrieving premium tier")
	}

	if premiumTier == premium.None {
		return api.NewErrorWithMessage(http.StatusPaymentRequired, err, "Live-chat requires premium to use")
	}

	c.authenticated.Store(true)

	c.Write(Event{
		Type: EventTypeAuthenticated,
	})

	return nil
}
