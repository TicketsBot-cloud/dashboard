package api

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func ResendPanel(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(ctx, "202608_FEATURE_PANELS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		ctx.JSON(503, utils.ErrorStr("Panel management is temporarily unavailable. Please try again shortly."))
		return
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	panelId, err := strconv.Atoi(ctx.Param("panelid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to send message. Please try again."))
		return
	}

	// get existing
	panel, err := dbclient.Client.Panel.GetById(ctx, panelId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to load panel. Please try again."))
		return
	}

	if panel.PanelId == 0 {
		ctx.JSON(404, utils.ErrorStr(fmt.Sprintf("Panel not found: %d", panelId)))
		return
	}

	// check guild ID matches
	if panel.GuildId != guildId {
		ctx.JSON(403, utils.ErrorStr("Guild ID doesn't match"))
		return
	}

	if panel.ForceDisabled {
		ctx.JSON(400, utils.ErrorStr("This panel is disabled and cannot be modified: please reactivate premium to re-enable it"))
		return
	}

	// delete old message
	// TODO: Use proper context
	if err := rest.DeleteMessage(context.Background(), botContext.Token, botContext.RateLimiter, panel.ChannelId, panel.MessageId); err != nil {
		var unwrapped request.RestError
		if errors.As(err, &unwrapped) && !unwrapped.IsClientError() {
			ctx.JSON(500, utils.ErrorStr("Failed to send message. Please try again."))
			return
		}
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to verify premium status. Please try again."))
		return
	}

	messageData := panelIntoMessageData(panel, premiumTier > premium.None)
	msgId, err := messageData.send(botContext)
	if err != nil {
		var unwrapped request.RestError
		if errors.As(err, &unwrapped) && unwrapped.StatusCode == 403 {
			ctx.JSON(403, utils.ErrorStr("I do not have permission to send messages in the provided channel"))
		} else {
			ctx.JSON(500, utils.ErrorStr("Failed to send message. Please try again."))
		}

		return
	}

	if err = dbclient.Client.Panel.UpdateMessageId(ctx, panel.PanelId, msgId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to send message. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionPanelResend,
		ResourceType: database.AuditResourcePanel,
		ResourceId:   audit.StringPtr(strconv.Itoa(panelId)),
	})
	ctx.JSON(200, utils.SuccessResponse)
}
