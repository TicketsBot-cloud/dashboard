package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
)

func MultiPanelDelete(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	multiPanelId, err := strconv.Atoi(c.Param("panelid"))
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete multi-panel"))
		return
	}

	// get bot context
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	panel, ok, err := dbclient.Client.MultiPanels.Get(c, multiPanelId)
	if !ok {
		c.JSON(404, utils.ErrorStr("No panel with matching ID found"))
		return
	}

	if panel.GuildId != guildId {
		c.JSON(403, utils.ErrorStr("Guild ID doesn't match"))
		return
	}

	// TODO: Use proper context
	if err := rest.DeleteMessage(c, botContext.Token, botContext.RateLimiter, panel.ChannelId, panel.MessageId); err != nil {
		var unwrapped request.RestError
		if errors.As(err, &unwrapped) {
			// Swallow 403 / 404
			if unwrapped.StatusCode != http.StatusForbidden && unwrapped.StatusCode != http.StatusNotFound {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete multi-panel"))
				return
			}
		} else {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete multi-panel"))
			return
		}
	}

	success, err := dbclient.Client.MultiPanels.Delete(c, guildId, multiPanelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete multi-panel"))
		return
	}

	if !success {
		c.JSON(404, utils.ErrorStr("No panel with matching ID found"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionMultiPanelDelete,
		ResourceType: dbmodel.AuditResourceMultiPanel,
		ResourceId:   audit.StringPtr(strconv.Itoa(multiPanelId)),
		OldData:      panel,
	})
	c.JSON(200, utils.SuccessResponse)
}
