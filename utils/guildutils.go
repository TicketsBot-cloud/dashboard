package utils

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/TicketsBot-cloud/common/collections"
	"github.com/TicketsBot-cloud/common/permission"
	"github.com/TicketsBot-cloud/common/premium"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/database"
	gdlcache "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/TicketsBot-cloud/worker/i18n"
	"github.com/go-redis/redis/v8"
	"github.com/jackc/pgtype"
	errgroup "golang.org/x/sync/errgroup"
)

type GuildDto struct {
	Id               uint64                      `json:"id,string"`
	Name             string                      `json:"name"`
	Icon             string                      `json:"icon"`
	PermissionLevel  permission.PermissionLevel  `json:"permission_level"`
	PermissionSource permission.PermissionSource `json:"permission_source"`
	Premium          bool                        `json:"premium"`
}

func LoadGuilds(ctx context.Context, accessToken string, userId uint64) ([]GuildDto, error) {
	authHeader := fmt.Sprintf("Bearer %s", accessToken)

	data := rest.CurrentUserGuildsData{
		Limit: 200,
	}

	request.Client.Timeout = 10 * time.Second
	guilds, err := rest.GetCurrentUserGuilds(ctx, authHeader, nil, data)
	if err != nil {
		return nil, err
	}

	if err := storeGuildsInDb(ctx, userId, guilds); err != nil {
		return nil, err
	}

	userGuilds, err := getGuildIntersection(ctx, guilds)
	if err != nil {
		return nil, err
	}

	group, ctx := errgroup.WithContext(ctx)

	var mu sync.Mutex
	dtos := make([]GuildDto, 0, len(userGuilds))
	for _, guild := range userGuilds {
		guild := guild

		group.Go(func() error {
			permLevel, permSource, err := GetPermissionLevelWithSource(ctx, guild.Id, userId)
			if err != nil {
				return err
			}

			isPremium, err := getGuildPremium(ctx, guild, userId)
			if err != nil {
				return err
			}

			mu.Lock()
			dtos = append(dtos, GuildDto{
				Id:               guild.Id,
				Name:             guild.Name,
				Icon:             guild.Icon,
				PermissionLevel:  permLevel,
				PermissionSource: permSource,
				Premium:          isPremium,
			})
			mu.Unlock()

			return nil
		})
	}

	if err := group.Wait(); err != nil {
		return nil, err
	}

	// Sort the guilds by name, but put the guilds with permission_level=0 last
	slices.SortFunc(dtos, func(a, b GuildDto) int {
		if a.PermissionLevel == 0 && b.PermissionLevel > 0 {
			return 1
		} else if a.PermissionLevel > 0 && b.PermissionLevel == 0 {
			return -1
		}

		return cmp.Compare(a.Name, b.Name)
	})

	return dtos, nil
}

// TODO: Remove this function!
func storeGuildsInDb(ctx context.Context, userId uint64, guilds []guild.Guild) error {
	var wrappedGuilds []database.UserGuild

	// endpoint's partial guild doesn't includes ownerid
	// we only user cached guilds on the index page, so it doesn't matter if we don't have have the real owner id
	// if the user isn't the owner, as we pull from the cache on other endpoints
	for _, guild := range guilds {
		wrappedGuilds = append(wrappedGuilds, database.UserGuild{
			GuildId:         guild.Id,
			Name:            guild.Name,
			Owner:           guild.Owner,
			UserPermissions: guild.Permissions,
			Icon:            guild.Icon,
		})
	}

	return dbclient.Client.UserGuilds.Set(ctx, userId, wrappedGuilds)
}

func getGuildIntersection(ctx context.Context, userGuilds []guild.Guild) ([]guild.Guild, error) {
	guildIds := make([]uint64, len(userGuilds))
	for i, guild := range userGuilds {
		guildIds[i] = guild.Id
	}

	// Restrict the set of guilds to guilds that the bot is also in
	botGuilds, err := getExistingGuilds(ctx, guildIds)
	if err != nil {
		return nil, err
	}

	botGuildIds := collections.NewSet[uint64]()
	for _, guildId := range botGuilds {
		botGuildIds.Add(guildId)
	}

	// Get the intersection of the two sets
	intersection := make([]guild.Guild, 0, len(botGuilds))
	for _, guild := range userGuilds {
		if botGuildIds.Contains(guild.Id) {
			intersection = append(intersection, guild)
		}
	}

	return intersection, nil
}

func getExistingGuilds(ctx context.Context, userGuilds []uint64) ([]uint64, error) {
	query := `SELECT "guild_id" from guilds WHERE "guild_id" = ANY($1);`

	userGuildsArray := &pgtype.Int8Array{}
	if err := userGuildsArray.Set(userGuilds); err != nil {
		return nil, err
	}

	rows, err := cache.Instance.Query(ctx, query, userGuildsArray)
	if err != nil {
		return nil, err
	}

	defer rows.Close()

	var existingGuilds []uint64
	for rows.Next() {
		var guildId uint64
		if err := rows.Scan(&guildId); err != nil {
			return nil, err
		}

		existingGuilds = append(existingGuilds, guildId)
	}

	return existingGuilds, nil
}

// getGuildPremium checks whether a guild has an active premium entitlement.
// It checks the Redis cache first; if no cached value exists it falls back to
// a direct DB lookup using ListGuildSubscriptions.
func getGuildPremium(ctx context.Context, g guild.Guild, userId uint64) (bool, error) {
	cached, err := rpc.PremiumClient.GetCachedTier(ctx, g.Id)
	if err != nil && err != redis.Nil {
		return false, err
	}
	if err == nil {
		return premium.PremiumTier(cached.Tier) >= premium.Premium, nil
	}

	// No Redis cache - fall back to DB. We need the guild owner ID so that
	// user-level global subscriptions (e.g. Patreon) are included. For guilds
	// the current user owns we have it directly; for others we try the bot cache.
	ownerId := uint64(0)
	if g.Owner {
		ownerId = userId
	} else {
		cached, err := cache.Instance.GetGuild(ctx, g.Id)
		if err != nil && !errors.Is(err, gdlcache.ErrNotFound) {
			return false, err
		}
		if err == nil {
			ownerId = cached.OwnerId
		}
	}

	subscriptions, err := dbclient.Client.Entitlements.ListGuildSubscriptions(ctx, g.Id, ownerId, premium.GracePeriod)
	if err != nil {
		return false, err
	}

	for _, sub := range subscriptions {
		if premium.TierFromEntitlement(sub.Tier) >= premium.Premium {
			return true, nil
		}
	}

	return false, nil
}

// ResolveGuildLocale resolves the i18n locale for a guild
// 1. Explicit language set via the dashboard (ActiveLanguage DB table)
// 2. Guild's Discord preferred_locale (from the bot cache)
// 3. English fallback
func ResolveGuildLocale(ctx context.Context, guildId uint64) *i18n.Locale {
	if langCode, err := dbclient.Client.ActiveLanguage.Get(ctx, guildId); err == nil && langCode != "" {
		if locale, ok := i18n.MappedByIsoShortCode[langCode]; ok {
			return locale
		}
	}

	if g, err := cache.Instance.GetGuild(ctx, guildId); err == nil && g.PreferredLocale != "" {
		if locale, ok := i18n.DiscordLocales[g.PreferredLocale]; ok {
			return locale
		}
	}

	return i18n.LocaleEnglish
}
