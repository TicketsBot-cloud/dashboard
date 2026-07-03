package api

import (
	"context"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/gdl/rest"
)

// syncWhitelabelGuilds reconciles the whitelabel_guilds table for botId against the
// guilds the bot is actually a member of, fetched from Discord using its token.
// Guilds present on Discord but missing from the DB are added; guilds in the DB the
// bot is no longer in are removed. Deletion only happens after the full guild list has
// been enumerated successfully, so a partial fetch never purges valid rows.
func syncWhitelabelGuilds(ctx context.Context, botId uint64, token string) error {
	discord := make(map[uint64]struct{})

	var after uint64
	for {
		guilds, err := rest.GetCurrentUserGuilds(ctx, token, nil, rest.CurrentUserGuildsData{
			After: after,
			Limit: 200,
		})
		if err != nil {
			return err
		}

		for _, g := range guilds {
			discord[g.Id] = struct{}{}
			after = g.Id
		}

		if len(guilds) < 200 {
			break
		}
	}

	stored, err := dbclient.Client.WhitelabelGuilds.GetGuilds(ctx, botId)
	if err != nil {
		return err
	}

	storedSet := make(map[uint64]struct{}, len(stored))
	for _, id := range stored {
		storedSet[id] = struct{}{}
	}

	// Add guilds the bot is in that we don't have stored
	for id := range discord {
		if _, ok := storedSet[id]; !ok {
			if err := dbclient.Client.WhitelabelGuilds.Add(ctx, botId, id); err != nil {
				return err
			}
		}
	}

	// Remove stored guilds the bot is no longer in
	for _, id := range stored {
		if _, ok := discord[id]; !ok {
			if err := dbclient.Client.WhitelabelGuilds.Delete(ctx, botId, id); err != nil {
				return err
			}
		}
	}

	return nil
}
