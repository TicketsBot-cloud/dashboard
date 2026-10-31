package gallery

import (
	"errors"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

// validateImportTargets returns a user-facing error message, or "" if both targets are valid.
func validateImportTargets(channels []channel.Channel, channelId, categoryId *uint64) string {
	find := func(id uint64) (channel.Channel, bool) {
		for _, ch := range channels {
			if ch.Id == id {
				return ch, true
			}
		}
		return channel.Channel{}, false
	}

	if channelId != nil {
		ch, ok := find(*channelId)
		if !ok {
			return "Panel channel not found"
		}
		if ch.IsObfuscated() {
			return "Panel channel is not visible to the bot - grant it the View Channel permission"
		}
		if ch.Type != channel.ChannelTypeGuildText && ch.Type != channel.ChannelTypeGuildNews {
			return "Panel channel must be a text or announcement channel"
		}
	}

	if categoryId != nil {
		ch, ok := find(*categoryId)
		if !ok || ch.Type != channel.ChannelTypeGuildCategory {
			return "Invalid ticket category"
		}
		if ch.IsObfuscated() {
			return "Ticket category is not visible to the bot - grant it the View Channel permission"
		}
	}

	return ""
}

// Snapshots may predate URL validation, and the importer cannot edit someone else's listing.
func validateListingUrls(e *database.CustomEmbed, panelUrls ...*string) error {
	for _, url := range panelUrls {
		if url == nil || *url == "" || types.IsValidEmbedUrl(*url) {
			continue
		}

		return errors.New("This listing contains an image URL that is not a valid http:// or https:// URL, so it cannot be imported")
	}

	if e == nil {
		return nil
	}

	if err := types.NewCustomEmbed(e, nil).ValidateUrls(); err != nil {
		return errors.New("This listing cannot be imported: " + err.Error())
	}

	return nil
}
