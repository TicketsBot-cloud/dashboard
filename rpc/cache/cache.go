package cache

import (
	"context"

	"github.com/TicketsBot-cloud/dashboard/config"
	gdlcache "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/jackc/pgx/v4/pgxpool"
)

type Cache struct {
	*gdlcache.PgCache
}

var Instance *Cache

func NewCache() *Cache {
	pool, err := pgxpool.Connect(context.Background(), config.Conf.Cache.Uri)
	if err != nil {
		panic(err)
	}

	cache := gdlcache.NewPgCache(pool, gdlcache.CacheOptions{
		Guilds:   true,
		Users:    true,
		Members:  true,
		Channels: true,
		Roles:    false,
	})

	return &Cache{
		PgCache: &cache,
	}
}
