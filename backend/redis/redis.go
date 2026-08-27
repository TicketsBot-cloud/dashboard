package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
)

type RedisClient struct {
	*redis.Client
}

var Client *RedisClient

func NewRedisClient() *RedisClient {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", config.Conf.Redis.Host, config.Conf.Redis.Port),
		Password: config.Conf.Redis.Password,
		PoolSize: config.Conf.Redis.Threads,
	})

	return &RedisClient{
		client,
	}
}

func DefaultContext() context.Context {
	ctx, _ := context.WithTimeout(context.Background(), time.Second*3)
	return ctx
}
