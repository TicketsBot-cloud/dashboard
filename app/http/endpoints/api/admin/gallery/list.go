package gallery

import (
	"errors"
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/gin-gonic/gin"
)

type adminUserData struct {
	Id        uint64 `json:"id,string"`
	Username  string `json:"username"`
	AvatarUrl string `json:"avatar_url,omitempty"`
}

var allowedStatuses = map[string]database.GalleryListingStatus{
	"pending":  database.GalleryListingStatusPending,
	"approved": database.GalleryListingStatusApproved,
	"rejected": database.GalleryListingStatusRejected,
}

// ListHandler handles GET /api/admin/gallery
// Returns all listings, optionally filtered by status (pending/approved/rejected).
func ListHandler(ctx *gin.Context) {
	statusParam := ctx.Query("status")

	var listings []database.GalleryListing
	var err error

	if statusParam != "" {
		validStatus, ok := allowedStatuses[statusParam]
		if !ok {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid status filter. Must be one of: pending, approved, rejected"))
			return
		}
		listings, err = dbclient.Client.GalleryListings.GetByStatus(ctx, validStatus)
	} else {
		// Fetch all by getting each status — or we can add a GetAll method.
		// For now, get pending first as that's the most common admin use case.
		pending, pendingErr := dbclient.Client.GalleryListings.GetByStatus(ctx, database.GalleryListingStatusPending)
		if pendingErr != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(pendingErr, "Failed to fetch gallery listings"))
			return
		}

		approved, approvedErr := dbclient.Client.GalleryListings.GetByStatus(ctx, database.GalleryListingStatusApproved)
		if approvedErr != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(approvedErr, "Failed to fetch gallery listings"))
			return
		}

		rejected, rejectedErr := dbclient.Client.GalleryListings.GetByStatus(ctx, database.GalleryListingStatusRejected)
		if rejectedErr != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(rejectedErr, "Failed to fetch gallery listings"))
			return
		}

		listings = append(listings, pending...)
		listings = append(listings, approved...)
		listings = append(listings, rejected...)
	}

	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listings"))
		return
	}

	if listings == nil {
		listings = make([]database.GalleryListing, 0)
	}

	// Filter by listing type if provided
	listingType := ctx.Query("type")
	if listingType != "" {
		if listingType != "panel" && listingType != "tag" && listingType != "form" {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing type filter. Must be one of: panel, tag, form"))
			return
		}
		filtered := make([]database.GalleryListing, 0, len(listings))
		for _, l := range listings {
			lt := l.ListingType
			if lt == "" {
				lt = database.GalleryListingTypePanel
			}
			if lt == listingType {
				filtered = append(filtered, l)
			}
		}
		listings = filtered
	}

	// Resolve submitter user data from cache
	userIdSet := make(map[uint64]struct{})
	for _, l := range listings {
		userIdSet[l.SubmitterUserId] = struct{}{}
	}

	resolvedUsers := make(map[uint64]adminUserData)
	for id := range userIdSet {
		u, err := cache.Instance.GetUser(ctx, id)
		if err == nil {
			resolvedUsers[id] = adminUserData{
				Id:        id,
				Username:  u.Username,
				AvatarUrl: u.AvatarUrl(256),
			}
		} else if errors.Is(err, cache2.ErrNotFound) {
			resolvedUsers[id] = adminUserData{Id: id, Username: "Unknown User"}
		}
	}

	type listingWithUser struct {
		database.GalleryListing
		SubmittedUser adminUserData `json:"submitted_user"`
	}

	response := make([]listingWithUser, len(listings))
	for i, l := range listings {
		response[i] = listingWithUser{
			GalleryListing: l,
			SubmittedUser:  resolvedUsers[l.SubmitterUserId],
		}
	}

	ctx.JSON(http.StatusOK, response)
}
