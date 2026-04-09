package api

import (
	"context"
	"errors"
	"fmt"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/database"
	dbmodel "github.com/TicketsBot-cloud/database"
	messagetypes "github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
)

// SenderIdentity holds the resolved display name and avatar URL for the sender.
// When anonymising, populate Name/AvatarUrl from the guild instead of the user.
type SenderIdentity struct {
	Name      string
	AvatarUrl string
}

// SendMessageToTicket sends processedContent to a single ticket via webhook (preferred)
// or falls back to a plain channel message. Returns an error string on failure, or
// an empty string on success.
func SendMessageToTicket(
	ctx context.Context,
	botCtx *botcontext.BotContext,
	ticket dbmodel.Ticket,
	processedContent string,
	anonymise bool,
	sender SenderIdentity,
) string {
	guildId := ticket.GuildId
	ticketId := ticket.Id

	// Try webhook first
	webhook, err := database.Client.Webhooks.Get(ctx, guildId, ticketId)
	if err == nil && webhook.Id != 0 {
		webhookData := rest.WebhookBody{
			Content:   processedContent,
			Username:  sender.Name,
			AvatarUrl: sender.AvatarUrl,
			AllowedMentions: messagetypes.AllowedMention{
				Parse: []messagetypes.AllowedMentionType{messagetypes.USERS, messagetypes.ROLES, messagetypes.EVERYONE},
			},
		}

		_, webhookErr := rest.ExecuteWebhook(ctx, webhook.Token, nil, webhook.Id, true, webhookData)
		if webhookErr != nil {
			var unwrapped request.RestError
			if errors.As(webhookErr, &unwrapped); unwrapped.StatusCode == 403 || unwrapped.StatusCode == 404 {
				go database.Client.Webhooks.Delete(ctx, guildId, ticketId)
			}
			// Fall through to channel message below
		} else {
			return ""
		}
	}

	// Fall back to channel message
	if ticket.ChannelId == nil {
		return fmt.Sprintf("Ticket #%d has no associated Discord channel", ticketId)
	}

	message := processedContent
	if !anonymise {
		message = fmt.Sprintf("**%s**: %s", sender.Name, message)
		if len(message) > 2000 {
			message = message[0:1999]
		}
	}

	if _, err = rest.CreateMessage(ctx, botCtx.Token, botCtx.RateLimiter, *ticket.ChannelId, rest.CreateMessageData{
		Content: message,
		AllowedMentions: messagetypes.AllowedMention{
			Parse: []messagetypes.AllowedMentionType{messagetypes.USERS, messagetypes.ROLES, messagetypes.EVERYONE},
		},
	}); err != nil {
		return fmt.Sprintf("Failed to send message to ticket #%d", ticketId)
	}

	return ""
}
