package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

const bulkTimeoutSeconds = 60

type bulkSendMessageBody struct {
	TicketIds []int  `json:"ticket_ids"`
	Content   string `json:"content"`
}

type bulkSendMessageResult struct {
	Sent            []int             `json:"sent"`
	Failed          map[string]string `json:"failed"`
	BackgroundCount int               `json:"background_count,omitempty"`
}

func BulkSendMessage(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body bulkSendMessageBody
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

	if len(body.Content) == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Message content cannot be empty"))
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

	settings, err := database.Client.Settings.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch guild settings for guild %d", guildId))
		return
	}

	// Resolve sender identity once for all tickets
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

	content := body.Content
	if len(content) > 2000 {
		content = content[0:1999]
	}

	result := bulkSendMessageResult{
		Sent:   []int{},
		Failed: map[string]string{},
	}

	deadline := time.Now().Add(bulkTimeoutSeconds * time.Second)
	anonymise := settings.AnonymiseDashboardResponses

	sendOne := func(opCtx context.Context, ticketId int) bool {
		ticket, err := database.Client.Tickets.Get(opCtx, ticketId, guildId)
		if err != nil || ticket.UserId == 0 || ticket.GuildId != guildId {
			return false
		}

		processedContent := replacePlaceholders(opCtx, content, &ticket, botContext)
		if errStr := SendMessageToTicket(opCtx, botContext, ticket, processedContent, anonymise, sender); errStr != "" {
			return false
		}

		if ticket.Status != model.TicketStatusPending {
			if err := database.Client.Tickets.SetStatus(opCtx, guildId, ticketId, model.TicketStatusPending); err != nil {
				return false
			}

			if !ticket.IsThread {
				if err := database.Client.CategoryUpdateQueue.Add(opCtx, guildId, ticketId, model.TicketStatusPending); err != nil {
					return false
				}
			}
		}

		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   dbmodel.AuditActionTicketSendMessage,
			ResourceType: dbmodel.AuditResourceTicket,
			ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
			Metadata:     map[string]interface{}{"bulk": true},
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
			result.Failed[strconv.Itoa(ticketId)] = fmt.Sprintf("Failed to send to ticket #%d", ticketId)
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
