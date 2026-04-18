package gallery

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const defaultPageSize = 20

// BrowseHandler handles GET /api/gallery
// Returns paginated approved listings with tags.
// Query params: category, tag, search, sort (popular/recent), page (default 1).
func BrowseHandler(ctx *gin.Context) {
	category := ctx.Query("category")
	tag := ctx.Query("tag")
	search := ctx.Query("search")
	sort := ctx.DefaultQuery("sort", "recent")

	// Validate category against the allowlist if provided
	if category != "" && !AllowedCategories[category] {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid category"))
		return
	}

	// Limit search length to prevent excessively large ILIKE queries
	if len(search) > 100 {
		search = search[:100]
	}

	// Escape ILIKE wildcard characters in the search term
	search = strings.ReplaceAll(search, `\`, `\\`)
	search = strings.ReplaceAll(search, `%`, `\%`)
	search = strings.ReplaceAll(search, `_`, `\_`)

	if sort != "popular" && sort != "recent" {
		sort = "recent"
	}

	page, err := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}

	listings, total, err := dbclient.Client.GalleryListings.GetApproved(ctx, category, tag, search, sort, page, defaultPageSize)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listings"))
		return
	}

	if listings == nil {
		ctx.JSON(http.StatusOK, gin.H{
			"listings": make([]galleryListingPublicResponse, 0),
			"total":    total,
		})
		return
	}

	// Fetch tags for all listings in a single batch query
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

	response := make([]galleryListingPublicResponse, len(listings))
	for i, l := range listings {
		tags := tagsMap[l.Id]
		if tags == nil {
			tags = make([]string, 0)
		}
		response[i] = toPublicListingResponse(l, tags, usersMap[l.SubmitterUserId])
	}

	ctx.JSON(http.StatusOK, gin.H{
		"listings": response,
		"total":    total,
	})
}
