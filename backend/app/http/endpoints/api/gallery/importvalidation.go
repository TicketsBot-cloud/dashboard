package gallery

import (
	"errors"

	"github.com/TicketsBot-cloud/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

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
