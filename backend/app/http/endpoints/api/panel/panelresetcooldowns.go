package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func ResetPanelCooldowns(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_PANELS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Panel management is temporarily unavailable. Please try again shortly."))
		return
	}

	panelId, err := strconv.Atoi(c.Param("panelid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid panel ID"))
		return
	}

	// Verify panel exists and belongs to guild
	panel, err := dbclient.Client.Panel.GetById(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if panel.PanelId == 0 || panel.GuildId != guildId {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Panel not found: %d", panelId))
		return
	}

	// Scan for all cooldown keys matching this guild+panel
	pattern := fmt.Sprintf("tickets:panelcooldown:%d:%d:*", guildId, panelId)
	var keys []string
	var cursor uint64
	for {
		batch, nextCursor, err := redis.Client.Scan(c, cursor, pattern, 100).Result()
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}
		keys = append(keys, batch...)
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	// Delete found keys
	if len(keys) > 0 {
		if _, err := redis.Client.Del(c, keys...).Result(); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionPanelResetCooldowns,
		ResourceType: database.AuditResourcePanel,
		ResourceId:   audit.StringPtr(strconv.Itoa(panelId)),
		Metadata:     map[string]int{"keys_deleted": len(keys)},
	})

	c.JSON(http.StatusOK, utils.SuccessResponse)
}
