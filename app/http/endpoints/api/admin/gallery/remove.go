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

// RemoveHandler handles DELETE /api/admin/gallery/:id
// Removes a gallery listing entirely.
func RemoveHandler(ctx *gin.Context) {
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

	if err := dbclient.Client.GalleryListings.Delete(ctx, listingId); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete gallery listing"))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionGalleryRemove,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		OldData:      listing,
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
