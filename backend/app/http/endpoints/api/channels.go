package api

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"sort"

	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
)

func ChannelsHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	refresh := ctx.Query("refresh") == "true"

	var channels []channel.Channel
	if !refresh {
		channels, err = botContext.GetGuildChannels(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Unable to load channels. Please try again."))
			return
		}
	}

	// GetGuildChannels trusts an empty cache whenever the guild row exists, which is also what a
	// partially repopulated cache looks like, so an empty result goes through the refresh path.
	if refresh || len(channels) == 0 {
		fetched, ok, err := refreshChannels(ctx, botContext, guildId)
		switch {
		case err != nil && refresh:
			ctx.JSON(500, utils.ErrorStr("Unable to load channels from Discord. Please try again."))
			return
		case err != nil:
			log.Logger.Warn("Failed to refresh empty channel cache", zap.Error(err), zap.Uint64("guild_id", guildId))
		case ok:
			channels = fetched
		case refresh:
			remaining, err := redis.Client.ChannelRefreshCooldownRemaining(ctx, guildId)
			if err != nil {
				remaining = redis.ChannelRefreshCooldown
			}

			body := utils.ErrorStr("Channels were refreshed recently. Please try again shortly.")
			body["retry_after"] = max(1, int(math.Ceil(remaining.Seconds())))
			ctx.JSON(http.StatusTooManyRequests, body)
			return
		}
	}

	filtered := make([]channel.Channel, 0, len(channels))
	for _, ch := range channels {
		// Filter out threads
		if ch.Type == channel.ChannelTypeGuildNewsThread ||
			ch.Type == channel.ChannelTypeGuildPrivateThread ||
			ch.Type == channel.ChannelTypeGuildPublicThread {
			continue
		}

		filtered = append(filtered, ch)
	}

	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].Position < filtered[j].Position
	})

	ctx.JSON(200, filtered)
}

// refreshChannels fetches the guild's channels from Discord and writes them to the cache. The
// bool is false when the guild is on refresh cooldown and nothing was fetched.
func refreshChannels(ctx context.Context, botContext *botcontext.BotContext, guildId uint64) ([]channel.Channel, bool, error) {
	hasToken, err := redis.Client.TakeChannelRefreshToken(ctx, guildId)
	if err != nil {
		return nil, false, fmt.Errorf("take channel refresh token: %w", err)
	}

	if !hasToken {
		return nil, false, nil
	}

	channels, err := rest.GetGuildChannels(ctx, botContext.Token, botContext.RateLimiter, guildId)
	if err != nil {
		return nil, false, fmt.Errorf("fetch guild channels: %w", err)
	}

	if err := cache.Instance.StoreChannels(ctx, channels); err != nil {
		return nil, false, fmt.Errorf("store guild channels: %w", err)
	}

	return channels, true, nil
}
