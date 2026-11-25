package botcontext

import (
	"context"
	"errors"
	"fmt"

	"github.com/TicketsBot-cloud/common/restcache"
	"github.com/TicketsBot-cloud/gdl/rest/ratelimit"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/whitelabeltokens"
)

func ContextForGuild(guildId uint64) (*BotContext, error) {
	whitelabelBotId, isWhitelabel, err := dbclient.Client.WhitelabelGuilds.GetBotByGuild(context.Background(), guildId)
	if err != nil {
		return nil, err
	}

	if isWhitelabel {
		res, err := dbclient.Client.Whitelabel.GetByBotId(context.Background(), whitelabelBotId)
		if err != nil {
			return nil, err
		}

		if res.BotId == 0 {
			return nil, errors.New("whitelabel bot not found")
		}

		// A decryption failure must surface as an error. Falling back to the
		// public token would make the dashboard act as the wrong bot.
		token, err := whitelabeltokens.Token(res)
		if err != nil {
			return nil, fmt.Errorf("reading whitelabel token: %w", err)
		}

		rateLimiter := ratelimit.NewRateLimiter(ratelimit.NewRedisStore(redis.Client.Client, fmt.Sprintf("ratelimiter:%d", whitelabelBotId)), 1)

		return &BotContext{
			BotId:       res.BotId,
			Token:       token,
			RateLimiter: rateLimiter,
			RestCache:   restcache.NewRedisRestCache(redis.Client.Client, token, rateLimiter),
		}, nil
	} else {
		return PublicContext(), nil
	}
}

func PublicContext() *BotContext {
	rateLimiter := ratelimit.NewRateLimiter(ratelimit.NewRedisStore(redis.Client.Client, "ratelimiter:public"), 1)

	return &BotContext{
		BotId:       config.Conf.Bot.Id,
		Token:       config.Conf.Bot.Token,
		RateLimiter: rateLimiter,
		RestCache:   restcache.NewRedisRestCache(redis.Client.Client, config.Conf.Bot.Token, rateLimiter),
	}
}
