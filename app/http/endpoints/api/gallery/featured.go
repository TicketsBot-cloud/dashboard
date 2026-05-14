package gallery

import (
	"net/http"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func FeaturedHandler(ctx *gin.Context) {
	listings, err := dbclient.Client.GalleryListings.GetFeatured(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch featured listings"))
		return
	}

	if listings == nil {
		ctx.JSON(http.StatusOK, []galleryListingPublicResponse{})
		return
	}

	userIds := make([]uint64, 0, len(listings))
	for _, l := range listings {
		userIds = append(userIds, l.SubmitterUserId)
	}
	users := resolveUsersBatch(ctx, userIds)

	listingIds := make([]int, 0, len(listings))
	for _, l := range listings {
		listingIds = append(listingIds, l.Id)
	}
	allTags, err := dbclient.Client.GalleryListingTags.GetByListings(ctx, listingIds)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch listing tags"))
		return
	}

	var panelListings []galleryListingPublicResponse
	for _, l := range listings {
		if l.ListingType != "" && l.ListingType != database.GalleryListingTypePanel {
			continue
		}

		tags := allTags[l.Id]
		if tags == nil {
			tags = []string{}
		}

		panelListings = append(panelListings, toPublicListingResponse(l, tags, users[l.SubmitterUserId]))
	}

	if panelListings == nil {
		panelListings = []galleryListingPublicResponse{}
	}

	ctx.JSON(http.StatusOK, panelListings)
}
