package automations

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

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

// Plan caps. Free is intentionally conservative so paid tiers have clear value.
const (
	freeAutomationLimit       = 3
	premiumAutomationLimit    = 50
	whitelabelAutomationLimit = 100

	freeMaxSteps       = 10
	premiumMaxSteps    = 100
	whitelabelMaxSteps = 200
)

// limitsForTier returns (max automations per guild, max action steps per automation).
func limitsForTier(tier premium.PremiumTier) (int, int) {
	switch {
	case tier >= premium.Whitelabel:
		return whitelabelAutomationLimit, whitelabelMaxSteps
	case tier > premium.None:
		return premiumAutomationLimit, premiumMaxSteps
	default:
		return freeAutomationLimit, freeMaxSteps
	}
}

// --- payload types ---

type upsertBody struct {
	Name        string                    `json:"name" binding:"required"`
	Description *string                   `json:"description,omitempty"`
	DraftGraph  database.AutomationGraph  `json:"draft_graph" binding:"required"`
}

// --- helpers ---

// loadTierAndGuildId resolves the request's guild id, bot context and premium tier
// in one go. Used by every mutation handler.
func loadTierAndGuildId(c *gin.Context) (uint64, premium.PremiumTier, bool) {
	guildId := c.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return 0, 0, false
	}

	tier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify premium status"))
		return 0, 0, false
	}

	return guildId, tier, true
}

// resolveAutomation fetches the automation and enforces guild ownership.
func resolveAutomation(c *gin.Context, guildId uint64) (database.Automation, bool) {
	idStr := c.Param("automationId")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(400, utils.ErrorStr("Invalid automation ID: %s", idStr))
		return database.Automation{}, false
	}

	auto, ok, err := dbclient.Client.Automations.Get(c, id)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load automation"))
		return database.Automation{}, false
	}
	if !ok {
		c.JSON(404, utils.ErrorStr("Automation #%d not found", id))
		return database.Automation{}, false
	}
	if auto.GuildId != guildId {
		c.JSON(404, utils.ErrorStr("Automation #%d not found", id))
		return database.Automation{}, false
	}

	return auto, true
}

// --- handlers ---

// Execution caps per 30-day rolling window, by tier.
const (
	freeMonthlyExecLimit       = 500
	premiumMonthlyExecLimit    = 50_000
	whitelabelMonthlyExecLimit = 250_000
)

func monthlyExecLimitForTier(tier premium.PremiumTier) int {
	switch {
	case tier >= premium.Whitelabel:
		return whitelabelMonthlyExecLimit
	case tier > premium.None:
		return premiumMonthlyExecLimit
	default:
		return freeMonthlyExecLimit
	}
}

type listResponse struct {
	Automations []database.AutomationSummary `json:"automations"`
	Usage       usageInfo                    `json:"usage"`
}

type usageInfo struct {
	ExecutionsThisMonth int `json:"executions_this_month"`
	MonthlyLimit        int `json:"monthly_limit"`
}

func ListAutomations(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	summaries, err := dbclient.Client.Automations.GetByGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load automations"))
		return
	}

	// Fetch execution count for the current rolling 30-day window + premium tier
	// so the frontend can show usage warnings.
	since := time.Now().AddDate(0, 0, -30)
	execCount, _ := dbclient.Client.AutomationRuns.CountByGuildSince(c, guildId, since)

	tier := premium.None
	botCtx, err := botcontext.ContextForGuild(guildId)
	if err == nil {
		t, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, false, botCtx.Token, botCtx.RateLimiter)
		if err == nil {
			tier = t
		}
	}

	c.JSON(200, listResponse{
		Automations: summaries,
		Usage: usageInfo{
			ExecutionsThisMonth: execCount,
			MonthlyLimit:        monthlyExecLimitForTier(tier),
		},
	})
}

func GetAutomation(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}
	c.JSON(200, auto)
}

func CreateAutomation(c *gin.Context) {
	guildId, tier, ok := loadTierAndGuildId(c)
	if !ok {
		return
	}
	userId := c.Keys["userid"].(uint64)

	var body upsertBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}
	if err := validateUpsertBody(&body); err != "" {
		c.JSON(400, utils.ErrorStr("%s", err))
		return
	}

	maxAutomations, maxSteps := limitsForTier(tier)

	if msg := ValidateGraph(body.DraftGraph, maxSteps, tier); msg != "" {
		c.JSON(400, utils.ErrorStr("%s", msg))
		return
	}

	// Count-and-insert is serialised per-guild via pg_advisory_xact_lock inside
	// CreateWithLimit so concurrent POSTs can't all pass the cap check and overshoot.
	id, err := dbclient.Client.Automations.CreateWithLimit(c, guildId, maxAutomations, body.Name, body.Description, body.DraftGraph, userId)
	if err != nil {
		if errors.Is(err, database.ErrAutomationQuotaExceeded) {
			c.JSON(402, utils.ErrorStr("Automation quota reached (max %d). Upgrade to premium for more.", maxAutomations))
			return
		}
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create automation"))
		return
	}

	// Auto-generate a webhook secret if the trigger is a webhook type.
	trigger := findTriggerNode(body.DraftGraph)
	if trigger != nil && trigger.Kind == "webhook" {
		secret, err := GenerateWebhookSecret()
		if err == nil {
			_ = dbclient.Client.Automations.SetWebhookSecret(c, id, &secret)
		}
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionAutomationCreate,
		ResourceType: database.AuditResourceAutomation,
		ResourceId:   audit.StringPtr(strconv.FormatInt(id, 10)),
		NewData:      body,
	})

	c.JSON(200, gin.H{"id": strconv.FormatInt(id, 10)})
}

func UpdateAutomation(c *gin.Context) {
	guildId, tier, ok := loadTierAndGuildId(c)
	if !ok {
		return
	}
	userId := c.Keys["userid"].(uint64)

	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}

	var body upsertBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}
	if err := validateUpsertBody(&body); err != "" {
		c.JSON(400, utils.ErrorStr("%s", err))
		return
	}

	_, maxSteps := limitsForTier(tier)
	if msg := ValidateGraph(body.DraftGraph, maxSteps, tier); msg != "" {
		c.JSON(400, utils.ErrorStr("%s", msg))
		return
	}

	if err := dbclient.Client.Automations.UpdateDraft(c, auto.Id, body.Name, body.Description, body.DraftGraph); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save automation draft"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionAutomationUpdate,
		ResourceType: database.AuditResourceAutomation,
		ResourceId:   audit.StringPtr(strconv.FormatInt(auto.Id, 10)),
		OldData:      auto,
		NewData:      body,
	})
	c.JSON(200, utils.SuccessResponse)
}

func DeleteAutomation(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}

	if err := dbclient.Client.Automations.Delete(c, auto.Id); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete automation"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionAutomationDelete,
		ResourceType: database.AuditResourceAutomation,
		ResourceId:   audit.StringPtr(strconv.FormatInt(auto.Id, 10)),
		OldData:      auto,
	})
	c.JSON(200, utils.SuccessResponse)
}

// PublishAutomation promotes the draft to published and bumps the version.
// Re-validates against the current tier's limits so dropping to free tier after
// publishing a premium-only node blocks promotion.
func PublishAutomation(c *gin.Context) {
	guildId, tier, ok := loadTierAndGuildId(c)
	if !ok {
		return
	}
	userId := c.Keys["userid"].(uint64)

	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}

	_, maxSteps := limitsForTier(tier)
	// Snapshot the draft before handing to the validator — we write these exact
	// bytes below via PublishGraph, so a concurrent PATCH between validation and
	// the write cannot promote an unvalidated graph.
	graphToPublish := auto.DraftGraph
	if msg := ValidateGraph(graphToPublish, maxSteps, tier); msg != "" {
		c.JSON(400, utils.ErrorStr("Cannot publish: %s", msg))
		return
	}

	if err := dbclient.Client.Automations.PublishGraph(c, auto.Id, graphToPublish); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to publish automation"))
		return
	}

	// Keep the cron scheduler in sync with the just-published graph. Best-effort —
	// a sync failure shouldn't fail the user's publish.
	if fresh, found, err := dbclient.Client.Automations.Get(c, auto.Id); err == nil && found {
		_ = syncCronSchedule(c, fresh)
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionAutomationPublish,
		ResourceType: database.AuditResourceAutomation,
		ResourceId:   audit.StringPtr(strconv.FormatInt(auto.Id, 10)),
		OldData:      auto.PublishedGraph, // nil on first publish; fine
		NewData:      graphToPublish,
		Metadata:     map[string]any{"new_version": auto.PublishedVersion + 1},
	})
	c.JSON(200, utils.SuccessResponse)
}

func RevertAutomation(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}
	if auto.PublishedGraph == nil {
		c.JSON(400, utils.ErrorStr("Cannot revert: automation has never been published"))
		return
	}

	if err := dbclient.Client.Automations.Revert(c, auto.Id); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to revert automation draft"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionAutomationRevert,
		ResourceType: database.AuditResourceAutomation,
		ResourceId:   audit.StringPtr(strconv.FormatInt(auto.Id, 10)),
	})
	c.JSON(200, utils.SuccessResponse)
}

func EnableAutomation(c *gin.Context)  { toggleEnabled(c, true) }
func DisableAutomation(c *gin.Context) { toggleEnabled(c, false) }

func toggleEnabled(c *gin.Context, enabled bool) {
	guildId, tier, ok := loadTierAndGuildId(c)
	if !ok {
		return
	}
	userId := c.Keys["userid"].(uint64)

	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}

	if enabled && auto.PublishedGraph == nil {
		c.JSON(400, utils.ErrorStr("Cannot enable: publish the automation first"))
		return
	}

	if enabled {
		_, maxSteps := limitsForTier(tier)
		if msg := ValidateGraph(*auto.PublishedGraph, maxSteps, tier); msg != "" {
			c.JSON(400, utils.ErrorStr("Cannot enable: %s", msg))
			return
		}
	}

	if err := dbclient.Client.Automations.SetEnabled(c, auto.Id, enabled); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to toggle automation"))
		return
	}

	// Cron schedule must reflect enabled state — disable should stop the scheduler
	// firing, enable should register it. Refetch so we see the new enabled flag.
	if fresh, found, err := dbclient.Client.Automations.Get(c, auto.Id); err == nil && found {
		_ = syncCronSchedule(c, fresh)
	}

	action := database.AuditActionAutomationEnable
	if !enabled {
		action = database.AuditActionAutomationDisable
	}
	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   action,
		ResourceType: database.AuditResourceAutomation,
		ResourceId:   audit.StringPtr(strconv.FormatInt(auto.Id, 10)),
	})
	c.JSON(200, utils.SuccessResponse)
}

// validateUpsertBody checks fields that don't require knowledge of tier/quota.
func validateUpsertBody(b *upsertBody) string {
	trimmed := strings.TrimSpace(b.Name)
	if trimmed == "" {
		return "Automation name cannot be empty"
	}
	if utf8.RuneCountInString(trimmed) > 100 {
		return fmt.Sprintf("Automation name must be 100 characters or fewer (got %d)", utf8.RuneCountInString(trimmed))
	}
	b.Name = trimmed

	if b.Description != nil {
		d := strings.TrimSpace(*b.Description)
		if utf8.RuneCountInString(d) > 500 {
			return fmt.Sprintf("Automation description must be 500 characters or fewer (got %d)", utf8.RuneCountInString(d))
		}
		if d == "" {
			b.Description = nil
		} else {
			b.Description = &d
		}
	}
	return ""
}
