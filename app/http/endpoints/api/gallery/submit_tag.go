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

// SubmitTagHandler handles POST /api/:id/gallery/submit-tag/:tagid
// Submits a tag (canned response) from the guild to the gallery for review.
// Rate limiting should be applied at the route level.
func SubmitTagHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	tagId := ctx.Param("tagid")

	var body submitBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
		return
	}

	// Validate name
	if len(body.Name) < 1 || len(body.Name) > 100 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Name must be between 1 and 100 characters"))
		return
	}

	// Validate description
	if len(body.Description) < 1 || len(body.Description) > 500 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Description must be between 1 and 500 characters"))
		return
	}

	// Validate category
	if !AllowedCategories[body.Category] {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid category"))
		return
	}

	// Validate tags
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

	// Fetch the tag from the database
	tag, ok, err := dbclient.Client.Tag.Get(ctx, guildId, tagId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch tag"))
		return
	}

	if !ok {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Tag not found"))
		return
	}

	// Validate tag has content or an embed to share
	if tag.Content == nil && tag.Embed == nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Tag has no content to share"))
		return
	}

	// Build the snapshot, stripping guild-specific fields from the embed
	snapshot := database.GalleryTagSnapshot{
		Content: tag.Content,
	}

	if tag.Embed != nil {
		embed := *tag.Embed
		if embed.CustomEmbed != nil {
			embedCopy := *embed.CustomEmbed
			embedCopy.GuildId = 0
			embedCopy.Id = 0
			embed.CustomEmbed = &embedCopy
		}
		snapshot.Embed = &embed
	}

	snapshotJSON, err := stdjson.Marshal(snapshot)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to serialise tag snapshot"))
		return
	}

	// Create the gallery listing with tag-specific fields
	listing := database.GalleryListing{
		SubmitterUserId: userId,
		SourceGuildId:   guildId,
		ListingType:     database.GalleryListingTypeTag,
		Name:            body.Name,
		Description:     body.Description,
		Category:        body.Category,
		Status:          database.GalleryListingStatusPending,
		SnapshotData:    snapshotJSON,
		// Panel fields left at zero values for non-panel listings
		Title:       "",
		Content:     "",
		Colour:      0,
		ButtonLabel: "",
	}

	listingId, err := dbclient.Client.GalleryListings.Create(ctx, listing)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create gallery listing"))
		return
	}

	// Set metadata tags
	if len(body.Tags) > 0 {
		if err := dbclient.Client.GalleryListingTags.Set(ctx, listingId, body.Tags); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save gallery listing tags"))
			return
		}
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionGallerySubmit,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		NewData: map[string]any{
			"name":         body.Name,
			"category":     body.Category,
			"listing_type": "tag",
			"tag_id":       tagId,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"success":    true,
		"listing_id": listingId,
	})
}
