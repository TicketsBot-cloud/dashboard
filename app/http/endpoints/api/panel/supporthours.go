package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// supportHoursResponse represents the API response format for support hours
type supportHoursResponse struct {
	Timezone            string                   `json:"timezone"`
	Hours               []supportHoursHourConfig `json:"hours"`
	OutOfHoursBehaviour string                   `json:"out_of_hours_behaviour"`
	OutOfHoursTitle     string                   `json:"out_of_hours_title"`
	OutOfHoursMessage   string                   `json:"out_of_hours_message"`
	OutOfHoursColour    int                      `json:"out_of_hours_colour"`
}

// supportHoursAuditData is used for audit log old/new data to include both hours and settings
type supportHoursAuditData struct {
	Hours    []database.PanelSupportHours       `json:"hours"`
	Settings database.PanelSupportHoursSettings `json:"settings"`
}

// supportHoursHourConfig represents individual hour configuration
type supportHoursHourConfig struct {
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

	// Fetch support hours settings
	settings, settingsExist, err := dbclient.Client.PanelSupportHoursSettings.Get(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	// Convert to response format
	var timezone string = "Europe/London"
	var hourConfigs []supportHoursHourConfig

	if hours != nil && len(hours) > 0 {
		timezone = hours[0].Timezone
		for _, h := range hours {
			hourConfigs = append(hourConfigs, supportHoursHourConfig{
				DayOfWeek: h.DayOfWeek,
				StartTime: h.StartTime.Format("15:04:05"),
				EndTime:   h.EndTime.Format("15:04:05"),
				Enabled:   h.Enabled,
			})
		}
	} else {
		hourConfigs = []supportHoursHourConfig{}
	}

	outOfHoursBehaviour := string(database.OutOfHoursBehaviourBlockCreation)
	var outOfHoursTitle string
	var outOfHoursMessage string
	outOfHoursColour := 0xFC3F35
	if settingsExist {
		outOfHoursBehaviour = string(settings.OutOfHoursBehaviour)
		outOfHoursTitle = settings.OutOfHoursTitle
		outOfHoursMessage = settings.OutOfHoursMessage
		if settings.OutOfHoursColour != 0 {
			outOfHoursColour = settings.OutOfHoursColour
		}
	}

	response := supportHoursResponse{
		Timezone:            timezone,
		Hours:               hourConfigs,
		OutOfHoursBehaviour: outOfHoursBehaviour,
		OutOfHoursTitle:     outOfHoursTitle,
		OutOfHoursMessage:   outOfHoursMessage,
		OutOfHoursColour:    outOfHoursColour,
	}

	c.JSON(http.StatusOK, response)
}

// supportHoursPayload represents individual hour configuration in requests
type supportHoursPayload struct {
	DayOfWeek int    `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Enabled   bool   `json:"enabled"`
}

// supportHoursRequestBody represents the API request format for support hours
type supportHoursRequestBody struct {
	Timezone            string                `json:"timezone" binding:"required"`
	Hours               []supportHoursPayload `json:"hours" binding:"required"`
	OutOfHoursBehaviour string                `json:"out_of_hours_behaviour"`
	OutOfHoursTitle     string                `json:"out_of_hours_title"`
	OutOfHoursMessage   string                `json:"out_of_hours_message"`
	OutOfHoursColour    int                   `json:"out_of_hours_colour"`
}

func SetSupportHours(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

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

	var requestBody supportHoursRequestBody
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body: timezone and hours are required"))
		return
	}

	// Validate timezone
	if !database.IsValidTimezone(requestBody.Timezone) {
		c.JSON(http.StatusBadRequest, utils.ErrorStr(fmt.Sprintf("Invalid timezone: %s", requestBody.Timezone)))
		return
	}

	// Fetch existing data for audit log
	oldHours, err := dbclient.Client.PanelSupportHours.GetByPanelId(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	oldSettings, _, err := dbclient.Client.PanelSupportHoursSettings.Get(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	// Delete existing hours first
	if err := dbclient.Client.PanelSupportHours.DeleteByPanelId(c, panelId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to parse request data"))
		return
	}

	// Convert request to database format and save
	for _, req := range requestBody.Hours {
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
			Timezone:  requestBody.Timezone,
		}

		if _, err := dbclient.Client.PanelSupportHours.Upsert(c, supportHours); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}
	}

	// Validate and save support hours settings
	behaviour := requestBody.OutOfHoursBehaviour
	if behaviour == "" {
		behaviour = string(database.OutOfHoursBehaviourBlockCreation)
	}
	if behaviour != string(database.OutOfHoursBehaviourBlockCreation) && behaviour != string(database.OutOfHoursBehaviourAllowWithWarning) {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid out_of_hours_behaviour: must be 'block_creation' or 'allow_with_warning'"))
		return
	}

	outOfHoursMessage := requestBody.OutOfHoursMessage
	if len(outOfHoursMessage) > 500 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Out of hours message must be 500 characters or less"))
		return
	}

	outOfHoursTitle := requestBody.OutOfHoursTitle
	if len(outOfHoursTitle) > 100 {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Out of hours title must be 100 characters or less"))
		return
	}

	if err := dbclient.Client.PanelSupportHoursSettings.Set(c, database.PanelSupportHoursSettings{
		PanelId:             panelId,
		OutOfHoursBehaviour: database.OutOfHoursBehaviour(behaviour),
		OutOfHoursTitle:     outOfHoursTitle,
		OutOfHoursMessage:   outOfHoursMessage,
		OutOfHoursColour:    requestBody.OutOfHoursColour,
	}); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	// Check if anything actually changed before logging
	hasChanges := false

	// Check settings changes
	if string(oldSettings.OutOfHoursBehaviour) != behaviour ||
		oldSettings.OutOfHoursTitle != outOfHoursTitle ||
		oldSettings.OutOfHoursMessage != outOfHoursMessage ||
		oldSettings.OutOfHoursColour != requestBody.OutOfHoursColour {
		hasChanges = true
	}

	// Check hours changes
	if !hasChanges {
		if len(oldHours) != len(requestBody.Hours) {
			hasChanges = true
		} else if len(oldHours) > 0 && oldHours[0].Timezone != requestBody.Timezone {
			hasChanges = true
		} else {
			for i, oldHour := range oldHours {
				newHour := requestBody.Hours[i]
				if oldHour.DayOfWeek != newHour.DayOfWeek ||
					oldHour.StartTime.Format("15:04:05") != newHour.StartTime ||
					oldHour.EndTime.Format("15:04:05") != newHour.EndTime ||
					oldHour.Enabled != newHour.Enabled {
					hasChanges = true
					break
				}
			}
		}
	}

	if hasChanges {
		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   database.AuditActionSupportHoursSet,
			ResourceType: database.AuditResourceSupportHours,
			ResourceId:   audit.StringPtr(strconv.Itoa(panelId)),
			OldData: supportHoursAuditData{
				Hours:    oldHours,
				Settings: oldSettings,
			},
			NewData: requestBody,
		})
	}
	c.JSON(http.StatusOK, utils.SuccessResponse)
}

func DeleteSupportHours(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

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

	// Fetch existing data for audit log
	oldHoursDelete, err := dbclient.Client.PanelSupportHours.GetByPanelId(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	oldSettingsDelete, _, err := dbclient.Client.PanelSupportHoursSettings.Get(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if err := dbclient.Client.PanelSupportHours.DeleteByPanelId(c, panelId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	// Also delete associated settings
	if err := dbclient.Client.PanelSupportHoursSettings.Delete(c, panelId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if len(oldHoursDelete) > 0 {
		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   database.AuditActionSupportHoursDelete,
			ResourceType: database.AuditResourceSupportHours,
			ResourceId:   audit.StringPtr(strconv.Itoa(panelId)),
			OldData: supportHoursAuditData{
				Hours:    oldHoursDelete,
				Settings: oldSettingsDelete,
			},
		})
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
