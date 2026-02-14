package api

import (
	"context"
	"errors"
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
)

func MultiPanelResend(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	// parse panel ID
	panelId, err := strconv.Atoi(ctx.Param("panelid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to send message. Please try again."))
		return
	}

	// retrieve panel from DB
	multiPanel, ok, err := dbclient.Client.MultiPanels.Get(ctx, panelId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to send message. Please try again."))
		return
	}

	// check panel exists
	if !ok {
		ctx.JSON(404, utils.ErrorStr("No panel with the provided ID found"))
		return
	}

	// check panel is in the same guild
	if guildId != multiPanel.GuildId {
		ctx.JSON(403, utils.ErrorStr("Guild ID doesn't match"))
		return
	}

	// get bot context
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	// delete old message
	// TODO: Use proper context
	if err := rest.DeleteMessage(context.Background(), botContext.Token, botContext.RateLimiter, multiPanel.ChannelId, multiPanel.MessageId); err != nil {
		var unwrapped request.RestError
		if errors.As(err, &unwrapped) && !unwrapped.IsClientError() {
			ctx.JSON(500, utils.ErrorStr("Failed to send message. Please try again."))
			return
		}
	}

	// get premium status
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to verify premium status. Please try again."))
		return
	}

	panels, err := dbclient.Client.MultiPanelTargets.GetPanels(ctx, multiPanel.Id)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to send message. Please try again."))
		return
	}

	// send new message
	messageData := multiPanelIntoMessageData(multiPanel, premiumTier > premium.None)
	messageId, err := messageData.send(botContext, panels)
	if err != nil {
		var unwrapped request.RestError
		if errors.As(err, &unwrapped) && unwrapped.StatusCode == 403 {
			ctx.JSON(500, utils.ErrorStr("I do not have permission to send messages in the provided channel"))
		} else {
			ctx.JSON(500, utils.ErrorStr("Failed to send message. Please try again."))
		}

		return
	}

	if err = dbclient.Client.MultiPanels.UpdateMessageId(ctx, multiPanel.Id, messageId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to send message. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionMultiPanelResend,
		ResourceType: database.AuditResourceMultiPanel,
		ResourceId:   audit.StringPtr(strconv.Itoa(panelId)),
	})
	ctx.JSON(200, gin.H{
		"success": true,
	})
}
