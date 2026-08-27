package api

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/worker/bot/command/manager"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
)

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
