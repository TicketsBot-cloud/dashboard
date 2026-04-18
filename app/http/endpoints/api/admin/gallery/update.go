package gallery

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	api_gallery "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/gallery"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type updateBody struct {
	Category *string `json:"category"`
	Featured *bool   `json:"featured"`
}

// UpdateHandler handles PUT /api/admin/gallery/:id
// Updates mutable fields on a gallery listing (category, featured).
func UpdateHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	listingId, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing ID"))
		return
	}

	var body updateBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
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

	// Validate category against the allowlist if provided
	if body.Category != nil && !api_gallery.AllowedCategories[*body.Category] {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid category"))
		return
	}

	if err := dbclient.Client.GalleryListings.Update(ctx, listingId, body.Category, body.Featured); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update gallery listing"))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionGalleryApprove, // Re-use approve action for admin updates
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		OldData: map[string]any{
			"category": listing.Category,
			"featured": listing.Featured,
		},
		NewData: map[string]any{
			"category": body.Category,
			"featured": body.Featured,
		},
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
