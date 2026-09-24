package cache

import (
	"context"
	"encoding/json"

	gdlcache "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/jackc/pgtype"
	"github.com/jackc/pgx/v4/pgxpool"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
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

func (c *Cache) GetGuilds(ctx context.Context, ids []uint64) (map[uint64]guild.Guild, error) {
	guilds := make(map[uint64]guild.Guild)
	if len(ids) == 0 {
		return guilds, nil
	}

	idArray := &pgtype.Int8Array{}
	if err := idArray.Set(ids); err != nil {
		return nil, err
	}

	rows, err := c.Query(ctx, `SELECT "guild_id", "data" FROM guilds WHERE "guild_id" = ANY($1);`, idArray)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id uint64
		var raw string
		if err := rows.Scan(&id, &raw); err != nil {
			return nil, err
		}

		var cached guild.CachedGuild
		if err := json.Unmarshal([]byte(raw), &cached); err != nil {
			return nil, err
		}

		guilds[id] = cached.ToGuild(id)
	}

	return guilds, rows.Err()
}
