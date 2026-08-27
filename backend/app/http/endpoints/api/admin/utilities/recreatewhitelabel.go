package utilities

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/ratelimit"
	"github.com/TicketsBot-cloud/worker/bot/command/manager"
	"github.com/gin-gonic/gin"
	goredis "github.com/go-redis/redis/v8"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
)

const (
	// statusKey holds the JSON-encoded progress of the most recent bulk recreate (TTL bound).
	whitelabelRecreateStatusKey = "tickets:admin:whitelabel-recreate:status"
	// lockKey guards against concurrent bulk runs / button spam.
	whitelabelRecreateLockKey = "tickets:admin:whitelabel-recreate:lock"
	whitelabelRecreateTTL     = time.Hour
	// maxTrackedErrors caps how many per-bot errors we retain to keep the status payload small.
	maxTrackedErrors = 50
)

type recreateBotError struct {
	BotId string `json:"bot_id"`
	Error string `json:"error"`
}

type WhitelabelRecreateStatus struct {
	Status     string             `json:"status"` // "idle" | "running" | "completed"
	Total      int                `json:"total"`
	Processed  int                `json:"processed"`
	Succeeded  int                `json:"succeeded"`
	Failed     int                `json:"failed"`
	StartedAt  string             `json:"started_at,omitempty"`
	FinishedAt string             `json:"finished_at,omitempty"`
	Errors     []recreateBotError `json:"errors"`
}

func writeStatus(status WhitelabelRecreateStatus) {
	raw, err := json.Marshal(status)
	if err != nil {
		log.Logger.Error("Failed to marshal whitelabel recreate status", zap.Error(err))
		return
	}

	if err := redis.Client.Set(redis.DefaultContext(), whitelabelRecreateStatusKey, raw, whitelabelRecreateTTL).Err(); err != nil {
		log.Logger.Error("Failed to persist whitelabel recreate status", zap.Error(err))
	}
}

// RecreateAllWhitelabelCommands starts a background job that re-registers the slash commands for
// every whitelabel bot, tracking progress in Redis so the dashboard can poll it. Owner-only.
func RecreateAllWhitelabelCommands() func(*gin.Context) {
	cm := new(manager.CommandManager)
	cm.RegisterCommands()

	return func(c *gin.Context) {
		// In-progress lock — prevents concurrent runs / spamming the button.
		wasSet, err := redis.Client.SetNX(redis.DefaultContext(), whitelabelRecreateLockKey, 1, whitelabelRecreateTTL).Result()
		if err != nil {
			c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to process request. Please try again."))
			return
		}
		if !wasSet {
			c.JSON(http.StatusConflict, utils.ErrorStr("A whitelabel command recreation is already running"))
			return
		}

		bots, err := dbclient.Client.Whitelabel.GetAll(c)
		if err != nil {
			_ = redis.Client.Del(redis.DefaultContext(), whitelabelRecreateLockKey)
			c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to load whitelabel bots"))
			return
		}

		commands, _ := cm.BuildCreatePayload(true, nil)

		startedAt := time.Now().UTC().Format(time.RFC3339)
		writeStatus(WhitelabelRecreateStatus{
			Status:    "running",
			Total:     len(bots),
			StartedAt: startedAt,
			Errors:    []recreateBotError{},
		})

		go runWhitelabelRecreate(bots, commands, startedAt)

		c.JSON(http.StatusAccepted, gin.H{"started": true, "total": len(bots)})
	}
}

// runWhitelabelRecreate performs the actual re-registration for each bot sequentially, honoring
// Discord's per-bot rate limits via a per-bot rate limiter, and reports progress into Redis.
// It intentionally bypasses the per-bot 1-minute cooldown used by the user-facing resync: this is
// an owner-forced maintenance action, and spam is already guarded by the in-progress lock.
func runWhitelabelRecreate(bots []database.WhitelabelBot, commands []rest.CreateCommandData, startedAt string) {
	status := WhitelabelRecreateStatus{
		Status:    "running",
		Total:     len(bots),
		StartedAt: startedAt,
		Errors:    []recreateBotError{},
	}

	for _, bot := range bots {
		rateLimiter := ratelimit.NewRateLimiter(ratelimit.NewRedisStore(redis.Client.Client, fmt.Sprintf("ratelimiter:%d", bot.BotId)), 1)

		if _, err := rest.ModifyGlobalCommands(context.Background(), bot.Token, rateLimiter, bot.BotId, commands); err != nil {
			status.Failed++
			if len(status.Errors) < maxTrackedErrors {
				status.Errors = append(status.Errors, recreateBotError{
					BotId: fmt.Sprintf("%d", bot.BotId),
					Error: err.Error(),
				})
			}
			log.Logger.Warn("Failed to recreate whitelabel commands", zap.Uint64("bot_id", bot.BotId), zap.Error(err))
		} else {
			status.Succeeded++
		}

		status.Processed++
		writeStatus(status)
	}

	status.Status = "completed"
	status.FinishedAt = time.Now().UTC().Format(time.RFC3339)
	writeStatus(status)

	if err := redis.Client.Del(redis.DefaultContext(), whitelabelRecreateLockKey).Err(); err != nil {
		log.Logger.Error("Failed to release whitelabel recreate lock", zap.Error(err))
	}
}

// WhitelabelRecreateStatusHandler returns the current progress of the bulk recreate job so the
// dashboard can poll it. Returns an idle status when no job has run recently.
func WhitelabelRecreateStatusHandler() func(*gin.Context) {
	return func(c *gin.Context) {
		raw, err := redis.Client.Get(redis.DefaultContext(), whitelabelRecreateStatusKey).Bytes()
		if err != nil {
			if err == goredis.Nil {
				c.JSON(http.StatusOK, WhitelabelRecreateStatus{Status: "idle", Errors: []recreateBotError{}})
				return
			}

			c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to load status"))
			return
		}

		var status WhitelabelRecreateStatus
		if err := json.Unmarshal(raw, &status); err != nil {
			c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to parse status"))
			return
		}

		c.JSON(http.StatusOK, status)
	}
}
