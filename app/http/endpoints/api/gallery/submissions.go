package gallery

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

// SubmissionsHandler handles GET /api/:id/gallery/submissions
// Returns all gallery submissions from this guild.
func SubmissionsHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	listings, err := dbclient.Client.GalleryListings.GetByGuild(ctx, guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery submissions"))
		return
	}

	if len(listings) == 0 {
		ctx.JSON(http.StatusOK, make([]galleryListingResponse, 0))
		return
	}

	// Fetch tags for all listings
	listingIds := make([]int, len(listings))
	for i, l := range listings {
		listingIds[i] = l.Id
	}

	var tagsMap map[int][]string

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		tagsMap, err = dbclient.Client.GalleryListingTags.GetByListings(gCtx, listingIds)
		return err
	})

	if err := g.Wait(); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listing tags"))
		return
	}

	// Batch-resolve submitter user data from cache
	userIdSet := make(map[uint64]struct{})
	for _, l := range listings {
		userIdSet[l.SubmitterUserId] = struct{}{}
	}
	userIds := make([]uint64, 0, len(userIdSet))
	for id := range userIdSet {
		userIds = append(userIds, id)
	}

	usersMap := resolveUsersBatch(ctx, userIds)

	response := make([]galleryListingResponse, len(listings))
	for i, l := range listings {
		tags := tagsMap[l.Id]
		if tags == nil {
			tags = make([]string, 0)
		}
		response[i] = toListingResponse(l, tags, usersMap[l.SubmitterUserId])
	}

	ctx.JSON(http.StatusOK, response)
}
