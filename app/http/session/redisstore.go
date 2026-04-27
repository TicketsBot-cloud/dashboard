package session

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	wrapper "github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/go-redis/redis/v8"
)

var ErrNoSession = errors.New("no session data found")

type RedisStore struct {
	client *redis.Client
}

func NewRedisStore() *RedisStore {
	return &RedisStore{
		client: wrapper.Client.Client,
	}
}

var keyPrefix = "panel:session:"

func (s *RedisStore) Get(userId uint64) (SessionData, error) {
	ctx, cancel := wrapper.DefaultContext()
	defer cancel()

	raw, err := s.client.Get(ctx, fmt.Sprintf("%s:%d", keyPrefix, userId)).Result()
	if err != nil {
		if err == redis.Nil {
			err = ErrNoSession
		}

		return SessionData{}, err
	}

	var data SessionData
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return SessionData{}, err
	}

	return data, nil
}

func (s *RedisStore) Set(userId uint64, data SessionData) error {
	encoded, err := json.Marshal(data)
	if err != nil {
		return err
	}

	expiration := time.Until(time.Unix(data.Expiry, 0))
	ctx, cancel := wrapper.DefaultContext()
	defer cancel()

	return s.client.Set(ctx, fmt.Sprintf("%s:%d", keyPrefix, userId), encoded, expiration).Err()
}

func (s *RedisStore) Clear(userId uint64) error {
	ctx, cancel := wrapper.DefaultContext()
	defer cancel()

	return s.client.Del(ctx, fmt.Sprintf("%s:%d", keyPrefix, userId)).Err()
}
