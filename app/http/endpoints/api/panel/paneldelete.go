package api

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
)

func DeletePanel(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	panelId, err := strconv.Atoi(c.Param("panelid"))
	if err != nil {
		c.JSON(400, utils.ErrorStr("Missing panel ID"))
		return
	}

	panel, err := database.Client.Panel.GetById(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
		return
	}

	if panel.PanelId == 0 {
		c.JSON(404, utils.ErrorStr(fmt.Sprintf("Panel not found: %d", panelId)))
		return
	}

	// verify panel belongs to guild
	if panel.GuildId != guildId {
		c.JSON(403, utils.ErrorStr("Guild ID doesn't match"))
		return
	}

	// Get any multi panels this panel is part of to use later
	multiPanels, err := database.Client.MultiPanelTargets.GetMultiPanels(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
		return
	}

	// Delete welcome message embed
	if panel.WelcomeMessageEmbed != nil {
		if err := database.Client.Embeds.Delete(c, *panel.WelcomeMessageEmbed); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
			return
		}
	}

	if err := database.Client.Panel.Delete(c, panelId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
		return
	}

	// TODO: Set timeout on context
	if err := rest.DeleteMessage(c, botContext.Token, botContext.RateLimiter, panel.ChannelId, panel.MessageId); err != nil {
		var unwrapped request.RestError
		if !errors.As(err, &unwrapped) || unwrapped.StatusCode != 404 {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
			return
		}
	}

	// Get premium tier
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
		return
	}

	// Update all multi panels messages to remove the button
	for i, multiPanel := range multiPanels {
		// Only update 5 multi-panels maximum: Prevent DoS
		if i >= 5 {
			break
		}

		panels, err := database.Client.MultiPanelTargets.GetPanels(c, multiPanel.Id)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
			return
		}

		messageData := multiPanelIntoMessageData(multiPanel, premiumTier > premium.None)
		messageId, err := messageData.send(botContext, panels)
		if err != nil {
			var unwrapped request.RestError
			if !errors.As(err, &unwrapped) || !unwrapped.IsClientError() {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
				return
			}
			// TODO: nil message ID?
		} else {
			if err := database.Client.MultiPanels.UpdateMessageId(c, multiPanel.Id, messageId); err != nil {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete panel"))
				return
			}

			// Delete old panel
			// TODO: Use proper context
			_ = rest.DeleteMessage(c, botContext.Token, botContext.RateLimiter, multiPanel.ChannelId, multiPanel.MessageId)
		}
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionPanelDelete,
		ResourceType: dbmodel.AuditResourcePanel,
		ResourceId:   audit.StringPtr(strconv.Itoa(panelId)),
		OldData:      panel,
	})

	c.JSON(200, utils.SuccessResponse)
}
