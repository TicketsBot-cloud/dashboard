package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// supportHoursResponse represents the API response format for support hours
type supportHoursResponse struct {
	DayOfWeek int    `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Enabled   bool   `json:"enabled"`
}

func GetSupportHours(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	panelIdStr := c.Param("panelid")
	panelId, err := strconv.Atoi(panelIdStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr(fmt.Sprintf("Invalid panel ID provided: %s", c.Param("panelId"))))
		return
	}

	// Verify panel exists and belongs to guild
	panel, err := dbclient.Client.Panel.GetById(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if panel.GuildId != guildId {
		c.JSON(http.StatusNotFound, utils.ErrorStr(fmt.Sprintf("Panel not found: %d", panelId)))
		return
	}

	hours, err := dbclient.Client.PanelSupportHours.GetByPanelId(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	// Convert to response format
	var response []supportHoursResponse
	if hours != nil {
		for _, h := range hours {
			response = append(response, supportHoursResponse{
				DayOfWeek: h.DayOfWeek,
				StartTime: h.StartTime.Format("15:04:05"),
				EndTime:   h.EndTime.Format("15:04:05"),
				Enabled:   h.Enabled,
			})
		}
	} else {
		response = []supportHoursResponse{}
	}

	c.JSON(http.StatusOK, response)
}

// supportHoursRequest represents the API request format for support hours
type supportHoursRequest struct {
	DayOfWeek int    `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Enabled   bool   `json:"enabled"`
}

func SetSupportHours(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	panelIdStr := c.Param("panelid")
	panelId, err := strconv.Atoi(panelIdStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr(fmt.Sprintf("Invalid panel ID provided: %s", c.Param("panelId"))))
		return
	}

	// Check premium status for support hours quota
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	// For free users, check if they already have support hours on another panel
	if premiumTier == premium.None {
		// Get all panels with support hours for this guild
		allPanels, err := dbclient.Client.Panel.GetByGuild(c, guildId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}

		panelWithSupportHours := 0
		for _, panel := range allPanels {
			if panel.PanelId == panelId {
				continue // Skip the current panel we're setting hours for
			}

			hours, err := dbclient.Client.PanelSupportHours.GetByPanelId(c, panel.PanelId)
			if err != nil {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
				return
			}

			if len(hours) > 0 {
				panelWithSupportHours++
			}
		}

		if panelWithSupportHours >= 1 {
			c.JSON(http.StatusForbidden, utils.ErrorStr("Free users can only configure support hours on one panel. Upgrade to premium for unlimited support hours."))
			return
		}
	}

	// Verify panel exists and belongs to guild
	panel, err := dbclient.Client.Panel.GetById(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if panel.GuildId != guildId {
		c.JSON(http.StatusNotFound, utils.ErrorStr(fmt.Sprintf("Panel not found: %d", panelId)))
		return
	}

	var hoursRequest []supportHoursRequest
	if err := c.ShouldBindJSON(&hoursRequest); err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body: malformed JSON"))
		return
	}

	// Delete existing hours first
	if err := dbclient.Client.PanelSupportHours.DeleteByPanelId(c, panelId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to parse request data"))
		return
	}

	// Convert request to database format and save
	for _, req := range hoursRequest {
		// Validate day of week
		if req.DayOfWeek < 0 || req.DayOfWeek > 6 {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid day of week"))
			return
		}

		// Parse times - expecting HH:MM:SS format
		startTime, err := time.Parse("15:04:05", req.StartTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid start time format. Please try again."))
			return
		}

		endTime, err := time.Parse("15:04:05", req.EndTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid end time format. Please try again."))
			return
		}

		// Create database record
		supportHours := database.PanelSupportHours{
			PanelId:   panelId,
			DayOfWeek: req.DayOfWeek,
			StartTime: startTime,
			EndTime:   endTime,
			Enabled:   req.Enabled,
		}

		if _, err := dbclient.Client.PanelSupportHours.Upsert(c, supportHours); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}
	}

	c.JSON(http.StatusOK, utils.SuccessResponse)
}

func DeleteSupportHours(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	panelIdStr := c.Param("panelid")
	panelId, err := strconv.Atoi(panelIdStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr(fmt.Sprintf("Invalid panel ID provided: %s", c.Param("panelId"))))
		return
	}

	// Verify panel exists and belongs to guild
	panel, err := dbclient.Client.Panel.GetById(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if panel.GuildId != guildId {
		c.JSON(http.StatusNotFound, utils.ErrorStr(fmt.Sprintf("Panel not found: %d", panelId)))
		return
	}

	if err := dbclient.Client.PanelSupportHours.DeleteByPanelId(c, panelId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	c.JSON(http.StatusOK, utils.SuccessResponse)
}

func IsPanelActive(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	panelIdStr := c.Param("panelid")
	panelId, err := strconv.Atoi(panelIdStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr(fmt.Sprintf("Invalid panel ID provided: %s", c.Param("panelId"))))
		return
	}

	// Verify panel exists and belongs to guild
	panel, err := dbclient.Client.Panel.GetById(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if panel.GuildId != guildId {
		c.JSON(http.StatusNotFound, utils.ErrorStr(fmt.Sprintf("Panel not found: %d", panelId)))
		return
	}

	// Check if panel is currently active based on support hours
	isActive, err := dbclient.Client.PanelSupportHours.IsActiveNow(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"active": isActive})
}
