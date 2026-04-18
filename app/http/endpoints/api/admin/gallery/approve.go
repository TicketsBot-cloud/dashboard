package gallery

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// ApproveHandler handles POST /api/admin/gallery/:id/approve
// Approves a pending gallery listing.
func ApproveHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

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

	if !ok {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Gallery listing not found"))
		return
	}

	if listing.Status != database.GalleryListingStatusPending {
		ctx.JSON(http.StatusConflict, utils.ErrorStr("Only pending listings can be approved"))
		return
	}

	if err := dbclient.Client.GalleryListings.UpdateStatus(ctx, listingId, database.GalleryListingStatusApproved, userId, nil); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to approve gallery listing"))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionGalleryApprove,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		OldData: map[string]any{
			"status": string(listing.Status),
		},
		NewData: map[string]any{
			"status": string(database.GalleryListingStatusApproved),
		},
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
