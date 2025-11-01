package api

import (
	"sort"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/gin-gonic/gin"
)

func ChannelsHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	var channels []channel.Channel
	if ctx.Query("refresh") == "true" {
		hasToken, err := redis.Client.TakeChannelRefreshToken(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to take channel refresh token for guild %d. Please try again."))
			return
		}

		if hasToken {
			channels, err = rest.GetGuildChannels(ctx, botContext.Token, botContext.RateLimiter, guildId)
			if err != nil {
				ctx.JSON(500, utils.ErrorStr("Unable to load channels from Discord. Please try again."))
				return
			}

			if err := cache.Instance.StoreChannels(ctx, channels); err != nil {
				ctx.JSON(500, utils.ErrorStr("Failed to store channels in cache for guild %d. Please try again."))
				return
			}
		} else {
			channels, err = cache.Instance.GetGuildChannels(ctx, guildId)
			if err != nil {
				ctx.JSON(500, utils.ErrorStr("Unable to load channels. Please try again."))
				return
			}
		}
	} else {
		var err error
		channels, err = botContext.GetGuildChannels(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Unable to load channels. Please try again."))
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
