package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/common/premium"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	goredis "github.com/go-redis/redis/v8"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/internal/tagalias"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
)

const (
	// Backstop if the job dies; normally the lock is deleted when it finishes
	aliasResyncLockTTL   = 15 * time.Minute
	aliasResyncStatusTTL = time.Hour
	aliasResyncMaxErrors = 50

	discordMaxGuildCommands = 30032
	discordMaxDailyCommands = 30034
	discordUnknownCommand   = 10063

	discordCooldownFallback = 5 * time.Minute

	// action_type is an unconstrained INT2, so this inserts fine until go.mod picks up
	// AuditActionTagAliasResync.
	auditActionTagAliasResync = dbmodel.AuditActionType(52)
)

func aliasResyncStatusKey(guildId uint64) string {
	return fmt.Sprintf("tickets:tags:alias-resync:%d:status", guildId)
}

func aliasResyncLockKey(guildId uint64) string {
	return fmt.Sprintf("tickets:tags:alias-resync:%d:lock", guildId)
}

func aliasResyncCooldownKey(guildId uint64) string {
	return fmt.Sprintf("tickets:tags:alias-resync:%d:cooldown", guildId)
}

// retry_after comes back in the body, not a header.
func retryAfter(raw []byte) time.Duration {
	var body struct {
		RetryAfter float64 `json:"retry_after"`
	}

	if err := json.Unmarshal(raw, &body); err != nil || body.RetryAfter <= 0 {
		return 0
	}

	return time.Duration(body.RetryAfter * float64(time.Second))
}

func aliasResyncCooldown(guildId uint64) time.Duration {
	ttl, err := redis.Client.TTL(redis.DefaultContext(), aliasResyncCooldownKey(guildId)).Result()
	if err != nil || ttl <= 0 {
		return 0
	}

	return ttl
}

type aliasResyncError struct {
	TagId string `json:"tag_id"`
	Error string `json:"error"`
}

type AliasResyncStatus struct {
	Status        string             `json:"status"` // "idle" | "running" | "completed"
	Total         int                `json:"total"`
	Processed     int                `json:"processed"`
	Recreated     int                `json:"recreated"`
	Removed       int                `json:"removed"`
	Rebound       int                `json:"rebound"`
	InSync        int                `json:"in_sync"`
	Skipped       int                `json:"skipped"`
	Failed        int                `json:"failed"`
	CooldownUntil string             `json:"cooldown_until,omitempty"`
	StartedAt     string             `json:"started_at,omitempty"`
	FinishedAt    string             `json:"finished_at,omitempty"`
	Warnings      []string           `json:"warnings"`
	Errors        []aliasResyncError `json:"errors"`
}

func writeAliasResyncStatus(guildId uint64, status AliasResyncStatus) {
	raw, err := json.Marshal(status)
	if err != nil {
		log.Logger.Error("Failed to marshal alias resync status", zap.Error(err))
		return
	}

	if err := redis.Client.Set(redis.DefaultContext(), aliasResyncStatusKey(guildId), raw, aliasResyncStatusTTL).Err(); err != nil {
		log.Logger.Error("Failed to persist alias resync status", zap.Uint64("guild_id", guildId), zap.Error(err))
	}
}

func releaseAliasResyncLock(guildId uint64) {
	if err := redis.Client.Del(redis.DefaultContext(), aliasResyncLockKey(guildId)).Err(); err != nil {
		log.Logger.Error("Failed to release alias resync lock", zap.Uint64("guild_id", guildId), zap.Error(err))
	}
}

func discordError(err error) (request.RestError, bool) {
	var restError request.RestError
	if errors.As(err, &restError) {
		return restError, true
	}

	return request.RestError{}, false
}

// ResyncTagAliases re-registers missing alias commands, repairs drifted IDs and removes aliases
// with no owning tag. Runs in the background, with progress in Redis.
func ResyncTagAliases(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(ctx, "202608_FEATURE_TAGS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		ctx.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Tag management is temporarily unavailable. Please try again shortly."))
		return
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	// Same check as creating an alias
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to verify premium status. Please try again."))
		return
	}

	if premiumTier < premium.Premium {
		ctx.JSON(http.StatusPaymentRequired, utils.ErrorStr("Premium is required to use custom commands"))
		return
	}

	if cooldown := aliasResyncCooldown(guildId); cooldown > 0 {
		ctx.JSON(http.StatusTooManyRequests, gin.H{
			"success":     false,
			"error":       "Discord is rate limiting this server's commands. Try again shortly.",
			"retry_after": int(cooldown.Seconds()),
		})
		return
	}

	wasSet, err := redis.Client.SetNX(redis.DefaultContext(), aliasResyncLockKey(guildId), 1, aliasResyncLockTTL).Result()
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request. Please try again."))
		return
	}

	if !wasSet {
		ctx.JSON(http.StatusConflict, utils.ErrorStr("An alias resync is already running for this server."))
		return
	}

	tags, err := dbclient.Client.Tag.GetByGuild(ctx, guildId)
	if err != nil {
		releaseAliasResyncLock(guildId)
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load this server's tags"))
		return
	}

	existing, err := rest.GetGuildCommands(ctx, botContext.Token, botContext.RateLimiter, botContext.BotId, guildId)
	if err != nil {
		releaseAliasResyncLock(guildId)

		if restError, ok := discordError(err); ok && (restError.StatusCode == http.StatusForbidden || restError.StatusCode == http.StatusNotFound) {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("The bot is not in this server, or is missing access to its commands."))
			return
		}

		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to read this server's existing slash commands"))
		return
	}

	plan := tagalias.BuildPlan(tags, existing)

	warnings := tagalias.SkipWarnings(plan)

	// Tag IDs differing only in case collapse into one entry
	if count, err := dbclient.Client.Tag.GetTagCount(ctx, guildId); err == nil && count > len(tags) {
		warnings = append(warnings, "This server has tags whose IDs differ only by capitalisation. Their aliases cannot be told apart and may not resync correctly.")
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   auditActionTagAliasResync,
		ResourceType: dbmodel.AuditResourceTag,
		Metadata: gin.H{
			"recreate": len(plan.Create),
			"rebind":   len(plan.Rebind),
			"remove":   len(plan.Remove),
			"skipped":  len(plan.Skipped),
			"in_sync":  plan.InSync,
		},
	})

	status := AliasResyncStatus{
		Status:    "running",
		Total:     plan.Total(),
		StartedAt: time.Now().UTC().Format(time.RFC3339),
		Warnings:  warnings,
		Errors:    []aliasResyncError{},
	}
	writeAliasResyncStatus(guildId, status)

	go runAliasResync(guildId, botContext, plan, status)

	ctx.JSON(http.StatusAccepted, gin.H{"started": true, "total": plan.Total()})
}

// Not the gin context: it is recycled once the response is written.
func runAliasResync(guildId uint64, botContext *botcontext.BotContext, plan tagalias.Plan, status AliasResyncStatus) {
	ctx := context.Background()

	defer func() {
		status.Status = "completed"
		status.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		writeAliasResyncStatus(guildId, status)
		releaseAliasResyncLock(guildId)
	}()

	status.Skipped = len(plan.Skipped)
	status.InSync = plan.InSync

	fail := func(tagId string, err error) {
		status.Failed++
		if len(status.Errors) < aliasResyncMaxErrors {
			status.Errors = append(status.Errors, aliasResyncError{TagId: tagId, Error: err.Error()})
		}

		log.Logger.Warn("Failed to reconcile tag command alias",
			zap.Uint64("guild_id", guildId), zap.String("tag_id", tagId), zap.Error(err))
	}

	// Stop the run: the rest would fail the same way
	halt := func(err error) bool {
		restError, ok := discordError(err)
		if !ok {
			return false
		}

		if restError.ApiError.Code == discordMaxGuildCommands {
			status.Warnings = append(status.Warnings,
				"This server is at Discord's limit of 100 commands, so some aliases could not be registered.")
			return true
		}

		if restError.StatusCode != http.StatusTooManyRequests {
			return false
		}

		cooldown := retryAfter(restError.Raw)
		if cooldown <= 0 {
			cooldown = discordCooldownFallback
		}

		if err := redis.Client.Set(redis.DefaultContext(), aliasResyncCooldownKey(guildId), 1, cooldown).Err(); err != nil {
			log.Logger.Error("Failed to persist alias resync cooldown", zap.Uint64("guild_id", guildId), zap.Error(err))
		}

		reason := "Discord rate limited this server"
		if restError.ApiError.Code == discordMaxDailyCommands {
			reason = "This server has used up Discord's daily allowance for creating commands"
		}

		status.CooldownUntil = time.Now().UTC().Add(cooldown).Format(time.RFC3339)
		status.Warnings = append(status.Warnings, fmt.Sprintf(
			"%s. The remaining aliases were left alone — try again in %s.",
			reason, cooldown.Round(time.Second)))
		return true
	}

	// Cheapest first: no API call needed
	for _, rebind := range plan.Rebind {
		commandId := rebind.CommandId
		if _, err := tagalias.SetCommandId(ctx, guildId, rebind.TagId, &commandId); err != nil {
			fail(rebind.TagId, err)
			continue
		}

		status.Rebound++
	}
	writeAliasResyncStatus(guildId, status)

	// Removals first, to free names and command budget
	for _, removal := range plan.Remove {
		err := botContext.DeleteGuildCommand(ctx, guildId, removal.Id)
		restError, isRest := discordError(err)
		if err != nil && !(isRest && restError.ApiError.Code == discordUnknownCommand) {
			fail(removal.Name, err)
		} else {
			status.Removed++
		}

		status.Processed++
		if halt(err) {
			return
		}

		writeAliasResyncStatus(guildId, status)
	}

	for _, tagId := range plan.Create {
		cmd, err := botContext.CreateGuildCommand(ctx, guildId, tagalias.Command(tagId))
		if err != nil {
			fail(tagId, err)
			status.Processed++
			if halt(err) {
				return
			}

			writeAliasResyncStatus(guildId, status)
			continue
		}

		rows, err := tagalias.SetCommandId(ctx, guildId, tagId, &cmd.Id)
		if err != nil {
			fail(tagId, err)
		} else if rows == 0 {
			// Tag was deleted mid-run
			if err := botContext.DeleteGuildCommand(ctx, guildId, cmd.Id); err != nil {
				fail(tagId, err)
			}
		} else {
			status.Recreated++
		}

		status.Processed++
		writeAliasResyncStatus(guildId, status)
	}
}

func TagAliasResyncStatusHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	raw, err := redis.Client.Get(redis.DefaultContext(), aliasResyncStatusKey(guildId)).Bytes()
	if err != nil {
		if errors.Is(err, goredis.Nil) {
			ctx.JSON(http.StatusOK, withCooldown(guildId, AliasResyncStatus{
				Status: "idle", Warnings: []string{}, Errors: []aliasResyncError{},
			}))
			return
		}

		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load status"))
		return
	}

	var status AliasResyncStatus
	if err := json.Unmarshal(raw, &status); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to parse status"))
		return
	}

	ctx.JSON(http.StatusOK, withCooldown(guildId, status))
}

// The stored status is a snapshot; the cooldown has to be read live.
func withCooldown(guildId uint64, status AliasResyncStatus) AliasResyncStatus {
	if cooldown := aliasResyncCooldown(guildId); cooldown > 0 {
		status.CooldownUntil = time.Now().UTC().Add(cooldown).Format(time.RFC3339)
	} else {
		status.CooldownUntil = ""
	}

	return status
}
