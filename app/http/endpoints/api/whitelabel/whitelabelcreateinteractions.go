package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/worker/bot/command/manager"
	"github.com/gin-gonic/gin"
)

// TODO: Refactor
func GetWhitelabelCreateInteractions() func(*gin.Context) {
	cm := new(manager.CommandManager)
	cm.RegisterCommands()

	return func(c *gin.Context) {
		userId := c.Keys["userid"].(uint64)

		// Get bot
		bot, err := database.Client.Whitelabel.GetByUserId(c, userId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create whitelabel bot"))
			return
		}

		// Ensure bot exists
		if bot.BotId == 0 {
			c.JSON(404, utils.ErrorStr("No bot found"))
			return
		}

		if err := createInteractions(cm, bot.BotId, bot.Token); err != nil {
			if errors.Is(err, ErrInteractionCreateCooldown) {
				c.JSON(http.StatusTooManyRequests, utils.ErrorStr("Failed to create whitelabel bot. Please try again."))
			} else {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create whitelabel bot"))
			}

			return
		}

		audit.Log(audit.LogEntry{
			UserId:       userId,
			ActionType:   dbmodel.AuditActionWhitelabelCreateInteractions,
			ResourceType: dbmodel.AuditResourceWhitelabel,
			ResourceId:   audit.StringPtr(fmt.Sprintf("%d", bot.BotId)),
		})
		c.JSON(200, utils.SuccessResponse)
	}
}

var ErrInteractionCreateCooldown = errors.New("Interaction creation on cooldown")

func createInteractions(cm *manager.CommandManager, botId uint64, token string) error {
	// Cooldown
	key := fmt.Sprintf("tickets:interaction-create-cooldown:%d", botId)

	// try to set first, prevent race condition
	wasSet, err := redis.Client.SetNX(redis.DefaultContext(), key, 1, time.Minute).Result()
	if err != nil {
		return err
	}

	// on cooldown, tell user how long left
	if !wasSet {
		expiration, err := redis.Client.TTL(redis.DefaultContext(), key).Result()
		if err != nil {
			return err
		}

		return fmt.Errorf("%w, please wait another %d seconds", ErrInteractionCreateCooldown, int64(expiration.Seconds()))
	}

	botContext, err := botcontext.ContextForGuild(0)
	if err != nil {
		return err
	}

	commands, _ := cm.BuildCreatePayload(true, nil)

	// TODO: Use proper context
	_, err = rest.ModifyGlobalCommands(context.Background(), token, botContext.RateLimiter, botId, commands)
	return err
}
