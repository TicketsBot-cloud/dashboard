package gallery

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// GetHandler handles GET /api/gallery/:id
// Returns a single approved listing with its tags.
func GetHandler(ctx *gin.Context) {
	listingId, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing ID"))
		return
	}

	listing, ok, err := dbclient.Client.GalleryListings.GetById(ctx, listingId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listing"))
		return
	}

	if !ok || listing.Status != database.GalleryListingStatusApproved {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Gallery listing not found"))
		return
	}

	tags, err := dbclient.Client.GalleryListingTags.GetByListing(ctx, listingId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listing tags"))
		return
	}

	if tags == nil {
		tags = make([]string, 0)
	}

	user := resolveUser(ctx, listing.SubmitterUserId)

	ctx.JSON(http.StatusOK, toPublicListingResponse(listing, tags, user))
}
