package redis

import (
	"context"
	"fmt"
	"time"
)

const ChannelRefreshCooldown = 60 * time.Second

func channelRefreshCooldownKey(guildId uint64) string {
	return fmt.Sprintf("tickets:channelrefershcooldown:%d", guildId)
}

func (c *RedisClient) TakeChannelRefreshToken(ctx context.Context, guildId uint64) (bool, error) {
	res, err := c.SetNX(ctx, channelRefreshCooldownKey(guildId), "1", ChannelRefreshCooldown).Result()
	if err != nil {
		return false, err
	}

	return res, nil
}

// ChannelRefreshCooldownRemaining returns zero if the guild is not on cooldown.
func (c *RedisClient) ChannelRefreshCooldownRemaining(ctx context.Context, guildId uint64) (time.Duration, error) {
	ttl, err := c.TTL(ctx, channelRefreshCooldownKey(guildId)).Result()
	if err != nil {
		return 0, err
	}

	// go-redis reports a missing key or one without an expiry as a negative duration
	if ttl < 0 {
		return 0, nil
	}

	return ttl, nil
}
