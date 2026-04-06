package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

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

type bulkSendTagBody struct {
	TicketIds []int  `json:"ticket_ids"`
	TagId     string `json:"tag_id"`
}

type bulkSendTagResult struct {
	Sent            []int             `json:"sent"`
	Failed          map[string]string `json:"failed"`
	BackgroundCount int               `json:"background_count,omitempty"`
}

func BulkSendTag(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body bulkSendTagBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if len(body.TicketIds) == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("No ticket IDs provided"))
		return
	}

	if len(body.TicketIds) > 100 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Cannot send to more than 100 tickets at once"))
		return
	}

	if body.TagId == "" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("No tag ID provided"))
		return
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to verify premium status for guild %d", guildId))
		return
	}

	if premiumTier == premium.None {
		ctx.JSON(http.StatusPaymentRequired, utils.ErrorStr("This feature requires a premium subscription."))
		return
	}

	// Fetch tag once
	tag, ok, err := dbclient.Client.Tag.Get(ctx, guildId, body.TagId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch tag '%s'", body.TagId))
		return
	}
	if !ok {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Tag '%s' not found", body.TagId))
		return
	}

	settings, err := dbclient.Client.Settings.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch guild settings for guild %d", guildId))
		return
	}

	// Resolve sender identity once
	var sender SenderIdentity
	if settings.AnonymiseDashboardResponses {
		guild, err := botContext.GetGuild(context.Background(), guildId)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch guild information for guild %d", guildId))
			return
		}
		sender = SenderIdentity{Name: guild.Name, AvatarUrl: guild.IconUrl()}
	} else {
		user, err := botContext.GetUser(context.Background(), userId)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch user information for user %d", userId))
			return
		}
		sender = SenderIdentity{Name: user.EffectiveName(), AvatarUrl: user.AvatarUrl(256)}
	}

	result := bulkSendTagResult{
		Sent:   []int{},
		Failed: map[string]string{},
	}

	deadline := time.Now().Add(bulkTimeoutSeconds * time.Second)
	anonymise := settings.AnonymiseDashboardResponses
	tagId := body.TagId

	sendOne := func(opCtx context.Context, ticketId int) bool {
		ticket, err := dbclient.Client.Tickets.Get(opCtx, ticketId, guildId)
		if err != nil || ticket.UserId == 0 || ticket.GuildId != guildId {
			return false
		}

		processedContent := tag.Content
		if processedContent != nil {
			replaced := replacePlaceholders(opCtx, *processedContent, &ticket, botContext)
			processedContent = &replaced
		}

		var embeds []*embed.Embed
		if tag.Embed != nil {
			embedCopy := *tag.Embed.CustomEmbed
			replacePlaceholdersInEmbed(opCtx, &embedCopy, &ticket, botContext)

			fieldsCopy := make([]database.EmbedField, len(tag.Embed.Fields))
			for j, field := range tag.Embed.Fields {
				fieldsCopy[j] = field
				fieldsCopy[j].Name = replacePlaceholders(opCtx, field.Name, &ticket, botContext)
				fieldsCopy[j].Value = replacePlaceholders(opCtx, field.Value, &ticket, botContext)
			}

			embeds = []*embed.Embed{
				types.NewCustomEmbed(&embedCopy, fieldsCopy).IntoDiscordEmbed(),
			}
		}

		sent := false

		webhook, err := dbclient.Client.Webhooks.Get(opCtx, guildId, ticketId)
		if err == nil && webhook.Id != 0 {
			webhookData := rest.WebhookBody{
				Content:   utils.ValueOrZero(processedContent),
				Embeds:    embeds,
				Username:  sender.Name,
				AvatarUrl: sender.AvatarUrl,
				AllowedMentions: messagetypes.AllowedMention{
					Parse: []messagetypes.AllowedMentionType{messagetypes.USERS, messagetypes.ROLES, messagetypes.EVERYONE},
				},
			}

			_, webhookErr := rest.ExecuteWebhook(opCtx, webhook.Token, nil, webhook.Id, true, webhookData)
			if webhookErr != nil {
				var unwrapped request.RestError
				if errors.As(webhookErr, &unwrapped); unwrapped.StatusCode == 403 || unwrapped.StatusCode == 404 {
					go dbclient.Client.Webhooks.Delete(opCtx, guildId, ticketId)
				}
			} else {
				sent = true
			}
		}

		if !sent {
			if ticket.ChannelId == nil {
				return false
			}

			message := utils.ValueOrZero(processedContent)
			if !anonymise {
				message = fmt.Sprintf("**%s**: %s", sender.Name, message)
				if len(message) > 2000 {
					message = message[0:1999]
				}
			}

			if _, err = rest.CreateMessage(opCtx, botContext.Token, botContext.RateLimiter, *ticket.ChannelId, rest.CreateMessageData{
				Content: message,
				Embeds:  embeds,
				AllowedMentions: messagetypes.AllowedMention{
					Parse: []messagetypes.AllowedMentionType{messagetypes.USERS, messagetypes.ROLES, messagetypes.EVERYONE},
				},
			}); err != nil {
				return false
			}
		}

		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   database.AuditActionTicketSendTag,
			ResourceType: database.AuditResourceTicket,
			ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
			Metadata:     map[string]interface{}{"tag_id": tagId, "bulk": true},
		})
		return true
	}

	var backgroundIds []int

	for i, ticketId := range body.TicketIds {
		if time.Now().After(deadline) {
			backgroundIds = body.TicketIds[i:]
			break
		}

		if sendOne(ctx, ticketId) {
			result.Sent = append(result.Sent, ticketId)
		} else {
			result.Failed[strconv.Itoa(ticketId)] = fmt.Sprintf("Failed to send tag to ticket #%d", ticketId)
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

	ctx.JSON(http.StatusOK, result)
}
