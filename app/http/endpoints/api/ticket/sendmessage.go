package api

import (
	"context"
	"strconv"

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

type sendMessageBody struct {
	Message struct {
		MessageType string `json:"type"`
		Content     string `json:"content"`
	} `json:"message"`
}

func SendMessage(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	ticketId, err := strconv.Atoi(ctx.Param("ticketId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid ticket ID provided: %s", ctx.Param("ticketId")))
		return
	}

	var body sendMessageBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if len(body.Message.Content) == 0 {
		ctx.JSON(400, utils.ErrorStr("Message content cannot be empty"))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to verify premium status for guild %d", guildId))
		return
	}

	if premiumTier == premium.None {
		ctx.JSON(402, utils.ErrorStr("This feature requires a premium subscription. Guild %d is not premium.", guildId))
		return
	}

	ticket, err := database.Client.Tickets.Get(ctx, ticketId, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to load ticket. Please try again."))
		return
	}

	if ticket.UserId == 0 {
		ctx.JSON(404, utils.ErrorStr("Ticket #%d not found", ticketId))
		return
	}

	if ticket.GuildId != guildId {
		ctx.JSON(403, utils.ErrorStr("Ticket #%d does not belong to guild %d", ticketId, guildId))
		return
	}

	content := body.Message.Content
	if len(content) > 2000 {
		content = content[0:1999]
	}

	settings, err := database.Client.Settings.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch guild settings for guild %d", guildId))
		return
	}

	processedContent := replacePlaceholders(ctx, content, &ticket, botContext)

	var sender SenderIdentity
	if settings.AnonymiseDashboardResponses {
		guild, err := botContext.GetGuild(context.Background(), guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to fetch guild information for guild %d", guildId))
			return
		}
		sender = SenderIdentity{Name: guild.Name, AvatarUrl: guild.IconUrl()}
	} else {
		user, err := botContext.GetUser(context.Background(), userId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to fetch user information for user %d", userId))
			return
		}
		sender = SenderIdentity{Name: user.EffectiveName(), AvatarUrl: user.AvatarUrl(256)}
	}

	if errStr := SendMessageToTicket(ctx, botContext, ticket, processedContent, settings.AnonymiseDashboardResponses, sender); errStr != "" {
		ctx.JSON(500, utils.ErrorStr(errStr))
		return
	}

	if ticket.Status != model.TicketStatusPending {
		if err := database.Client.Tickets.SetStatus(ctx, guildId, ticketId, model.TicketStatusPending); err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to update ticket status."))
			return
		}

		if !ticket.IsThread {
			if err := database.Client.CategoryUpdateQueue.Add(ctx, guildId, ticketId, model.TicketStatusPending); err != nil {
				ctx.JSON(500, utils.ErrorStr("Failed to queue ticket category update."))
				return
			}
		}
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTicketSendMessage,
		ResourceType: dbmodel.AuditResourceTicket,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
	})
	ctx.JSON(200, gin.H{"success": true})
}
