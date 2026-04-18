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

type rejectBody struct {
	Reason string `json:"reason"`
}

// RejectHandler handles POST /api/admin/gallery/:id/reject
// Rejects a pending gallery listing with a reason.
func RejectHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	listingId, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing ID"))
		return
	}

	var body rejectBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
		return
	}

	if len(body.Reason) == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("A rejection reason is required"))
		return
	}

	if len(body.Reason) > 1000 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Rejection reason must be 1000 characters or fewer"))
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
		ctx.JSON(http.StatusConflict, utils.ErrorStr("Only pending listings can be rejected"))
		return
	}

	if err := dbclient.Client.GalleryListings.UpdateStatus(ctx, listingId, database.GalleryListingStatusRejected, userId, &body.Reason); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to reject gallery listing"))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionGalleryReject,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		OldData: map[string]any{
			"status": string(listing.Status),
		},
		NewData: map[string]any{
			"status": string(database.GalleryListingStatusRejected),
			"reason": body.Reason,
		},
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
