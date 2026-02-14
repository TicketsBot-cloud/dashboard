package api

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	messagetypes "github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
)

type sendTagBody struct {
	TagId string `json:"tag_id"`
}

func SendTag(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	// Get ticket ID
	ticketId, err := strconv.Atoi(ctx.Param("ticketId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid ticket ID provided: %s", ctx.Param("ticketId")))
		return
	}

	var body sendTagBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	// Verify guild is premium
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to verify premium status for guild %d", guildId))
		return
	}

	if premiumTier == premium.None {
		ctx.JSON(402, utils.ErrorStr("This feature requires a premium subscription. Guild %d is not premium.", guildId))
		return
	}

	// Get ticket
	ticket, err := dbclient.Client.Tickets.Get(ctx, ticketId, guildId)

	// Verify the ticket exists
	if ticket.UserId == 0 {
		ctx.JSON(404, utils.ErrorStr("Ticket #%d not found", ticketId))
		return
	}

	// Verify the user has permission to send to this guild
	if ticket.GuildId != guildId {
		ctx.JSON(403, utils.ErrorStr("Ticket #%d does not belong to guild %d", ticketId, guildId))
		return
	}

	// Get tag
	tag, ok, err := dbclient.Client.Tag.Get(ctx, guildId, body.TagId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch tag '%s' from database for guild %d", body.TagId, guildId))
		return
	}

	if !ok {
		ctx.JSON(404, utils.ErrorStr("Tag '%s' not found in guild %d", body.TagId, guildId))
		return
	}

	// Preferably send via a webhook
	webhook, err := dbclient.Client.Webhooks.Get(ctx, guildId, ticketId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch webhook for ticket #%d in guild %d", ticketId, guildId))
		return
	}

	settings, err := dbclient.Client.Settings.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch guild settings for guild %d", guildId))
		return
	}

	// Process placeholders in tag content
	processedContent := tag.Content
	if processedContent != nil {
		replaced := replacePlaceholders(ctx, *processedContent, &ticket, botContext)
		processedContent = &replaced
	}

	// Process placeholders in embed
	var embeds []*embed.Embed
	if tag.Embed != nil {
		// Make a copy of the embed to avoid modifying the original
		embedCopy := *tag.Embed.CustomEmbed
		replacePlaceholdersInEmbed(ctx, &embedCopy, &ticket, botContext)

		// Process placeholders in embed fields
		fieldsCopy := make([]database.EmbedField, len(tag.Embed.Fields))
		for i, field := range tag.Embed.Fields {
			fieldsCopy[i] = field
			fieldsCopy[i].Name = replacePlaceholders(ctx, field.Name, &ticket, botContext)
			fieldsCopy[i].Value = replacePlaceholders(ctx, field.Value, &ticket, botContext)
		}

		embeds = []*embed.Embed{
			types.NewCustomEmbed(&embedCopy, fieldsCopy).IntoDiscordEmbed(),
		}
	}

	if webhook.Id != 0 {
		var webhookData rest.WebhookBody
		if settings.AnonymiseDashboardResponses {
			guild, err := botContext.GetGuild(context.Background(), guildId)
			if err != nil {
				ctx.JSON(500, utils.ErrorStr("Failed to fetch guild information for guild %d", guildId))
				return
			}

			webhookData = rest.WebhookBody{
				Content:   utils.ValueOrZero(processedContent),
				Embeds:    embeds,
				Username:  guild.Name,
				AvatarUrl: guild.IconUrl(),
				AllowedMentions: messagetypes.AllowedMention{
					Parse: []messagetypes.AllowedMentionType{messagetypes.USERS, messagetypes.ROLES, messagetypes.EVERYONE},
				},
			}
		} else {
			user, err := botContext.GetUser(context.Background(), userId)
			if err != nil {
				ctx.JSON(500, utils.ErrorStr("Failed to fetch user information for user %d", userId))
				return
			}

			webhookData = rest.WebhookBody{
				Content:   utils.ValueOrZero(processedContent),
				Embeds:    embeds,
				Username:  user.EffectiveName(),
				AvatarUrl: user.AvatarUrl(256),
				AllowedMentions: messagetypes.AllowedMention{
					Parse: []messagetypes.AllowedMentionType{messagetypes.USERS, messagetypes.ROLES, messagetypes.EVERYONE},
				},
			}
		}

		// TODO: Ratelimit
		_, err = rest.ExecuteWebhook(ctx, webhook.Token, nil, webhook.Id, true, webhookData)

		if err != nil {
			// We can delete the webhook in this case
			var unwrapped request.RestError
			if errors.As(err, &unwrapped); unwrapped.StatusCode == 403 || unwrapped.StatusCode == 404 {
				go dbclient.Client.Webhooks.Delete(ctx, guildId, ticketId)
			}
		} else {
			ctx.JSON(200, gin.H{
				"success": true,
			})
			return
		}
	}

	message := utils.ValueOrZero(processedContent)
	if !settings.AnonymiseDashboardResponses {
		user, err := botContext.GetUser(context.Background(), userId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to fetch user information for user %d", userId))
			return
		}

		message = fmt.Sprintf("**%s**: %s", user.EffectiveName(), message)
	}

	if len(message) > 2000 {
		message = message[0:1999]
	}

	if ticket.ChannelId == nil {
		ctx.JSON(404, utils.ErrorStr("Ticket #%d has no associated Discord channel", ticketId))
		return
	}

	if _, err = rest.CreateMessage(ctx, botContext.Token, botContext.RateLimiter, *ticket.ChannelId, rest.CreateMessageData{
		Content: message,
		Embeds:  embeds,
		AllowedMentions: messagetypes.AllowedMention{
			Parse: []messagetypes.AllowedMentionType{messagetypes.USERS, messagetypes.ROLES, messagetypes.EVERYONE},
		},
	}); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to send tag '%s' to ticket #%d in channel %d", body.TagId, ticketId, *ticket.ChannelId))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTicketSendTag,
		ResourceType: database.AuditResourceTicket,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
		Metadata:     map[string]interface{}{"tag_id": body.TagId},
	})
	ctx.JSON(200, gin.H{
		"success": true,
	})
}
