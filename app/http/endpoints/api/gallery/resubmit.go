package gallery

import (
	stdjson "encoding/json"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// ResubmitHandler handles PUT /api/:id/gallery/submissions/:listingId
// Re-submits an existing gallery listing by re-snapshotting the source panel
// and resetting the listing status to pending for review.
func ResubmitHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	listingId, err := strconv.Atoi(ctx.Param("listingId"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing ID"))
		return
	}

	// Fetch existing listing and verify ownership
	listing, ok, err := dbclient.Client.GalleryListings.GetById(ctx, listingId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listing"))
		return
	}

	if !ok {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Gallery listing not found"))
		return
	}

	if listing.SourceGuildId != guildId {
		ctx.JSON(http.StatusForbidden, utils.ErrorStr("This listing does not belong to this guild"))
		return
	}

	var body submitBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
		return
	}

	// Validate fields (same as submit)
	if len(body.Name) < 1 || len(body.Name) > 100 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Name must be between 1 and 100 characters"))
		return
	}

	if len(body.Description) < 1 || len(body.Description) > 500 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Description must be between 1 and 500 characters"))
		return
	}

	if !AllowedCategories[body.Category] {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid category"))
		return
	}

	if len(body.Tags) > 3 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("A maximum of 3 tags is allowed"))
		return
	}

	for _, tag := range body.Tags {
		if len(tag) < 1 || len(tag) > 30 {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Each tag must be between 1 and 30 characters"))
			return
		}
	}

	// Re-snapshot the source panel
	panelIdStr := ctx.Query("panelId")
	if panelIdStr == "" {
		// If no panel ID provided, just update the metadata (name, description, category, tags)
		if err := dbclient.Client.GalleryListings.UpdateMetadata(ctx, listingId, body.Name, body.Description, body.Category); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update gallery listing"))
			return
		}
	} else {
		panelId, err := strconv.Atoi(panelIdStr)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid panel ID"))
			return
		}

		panelWithWm, err := dbclient.Client.Panel.GetByIdWithWelcomeMessage(ctx, guildId, panelId)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch panel"))
			return
		}

		if panelWithWm == nil {
			ctx.JSON(http.StatusNotFound, utils.ErrorStr("Panel not found"))
			return
		}

		panel := panelWithWm.Panel

		if panel.GuildId != guildId {
			ctx.JSON(http.StatusForbidden, utils.ErrorStr("Panel does not belong to this guild"))
			return
		}

		// Validate emoji
		if panel.EmojiId != nil {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Panels with custom Discord emojis cannot be submitted to the gallery. Please use a standard Unicode emoji instead."))
			return
		}

		if panel.EmojiName != nil && !isUnicodeEmoji(*panel.EmojiName) {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Panels with custom Discord emojis cannot be submitted to the gallery. Please use a standard Unicode emoji instead."))
			return
		}

		var welcomeMessageJSON []byte
		if panelWithWm.WelcomeMessage != nil {
			raw, err := stdjson.Marshal(panelWithWm.WelcomeMessage)
			if err != nil {
				_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to serialise welcome message"))
				return
			}
			welcomeMessageJSON = raw
		}

		// Update the listing with new panel snapshot + metadata, reset to pending
		updated := database.GalleryListing{
			Id:                        listingId,
			SubmitterUserId:           userId,
			SourceGuildId:             guildId,
			Name:                      body.Name,
			Description:               body.Description,
			Category:                  body.Category,
			Status:                    database.GalleryListingStatusPending,
			Title:                     panel.Title,
			Content:                   panel.Content,
			Colour:                    panel.Colour,
			ImageUrl:                  panel.ImageUrl,
			ThumbnailUrl:              panel.ThumbnailUrl,
			ButtonStyle:               intToInt16Ptr(panel.ButtonStyle),
			ButtonLabel:               panel.ButtonLabel,
			EmojiName:                 panel.EmojiName,
			WelcomeMessage:            welcomeMessageJSON,
		}

		if err := dbclient.Client.GalleryListings.Resubmit(ctx, updated); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update gallery listing"))
			return
		}
	}

	// Update tags
	if err := dbclient.Client.GalleryListingTags.Set(ctx, listingId, body.Tags); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save gallery listing tags"))
		return
	}

	// Reset status to pending for re-review
	if err := dbclient.Client.GalleryListings.UpdateStatus(ctx, listingId, database.GalleryListingStatusPending, userId, nil); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to reset listing status"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionGallerySubmit,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		NewData: map[string]any{
			"name":       body.Name,
			"category":   body.Category,
			"resubmit":   true,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
	})
}
