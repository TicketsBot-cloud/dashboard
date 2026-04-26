package gallery

import (
	stdjson "encoding/json"
	"net/http"
	"regexp"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

var tagIdRegex = regexp.MustCompile(`^[a-zA-Z0-9\-_]{1,16}$`)

type importTagBody struct {
	TagId string `json:"tag_id"`
}

// ImportTagHandler handles POST /api/:id/gallery/import-tag/:listingId
// Imports a gallery tag listing as a new tag in the guild.
func ImportTagHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	listingId, err := strconv.Atoi(ctx.Param("listingId"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing ID"))
		return
	}

	var body importTagBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if !tagIdRegex.MatchString(body.TagId) {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Tag IDs must be alphanumeric (including hyphens and underscores), and be between 1 and 16 characters long"))
		return
	}

	// Fetch the gallery listing
	listing, ok, err := dbclient.Client.GalleryListings.GetById(ctx, listingId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listing"))
		return
	}

	if !ok || listing.Status != database.GalleryListingStatusApproved {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Gallery listing not found or not approved"))
		return
	}

	if listing.ListingType != database.GalleryListingTypeTag {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("This listing is not a tag"))
		return
	}

	// Unmarshal the tag snapshot from the listing
	var snapshot database.GalleryTagSnapshot
	if err := stdjson.Unmarshal(listing.SnapshotData, &snapshot); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to parse tag snapshot data"))
		return
	}

	// Check the guild has not reached the tag limit
	count, err := dbclient.Client.Tag.GetTagCount(ctx, guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch tag count"))
		return
	}

	if count >= 200 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Tag limit (200) reached"))
		return
	}

	// Ensure a tag with this ID does not already exist in the guild
	exists, err := dbclient.Client.Tag.Exists(ctx, guildId, body.TagId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to check tag existence"))
		return
	}

	if exists {
		ctx.JSON(http.StatusConflict, utils.ErrorStr("A tag with this ID already exists in your server"))
		return
	}

	// Build the tag struct from the snapshot
	tag := database.Tag{
		Id:      body.TagId,
		GuildId: guildId,
		Content: snapshot.Content,
	}

	// Attach embed data if present, setting the guild ID
	if snapshot.Embed != nil && snapshot.Embed.CustomEmbed != nil {
		snapshot.Embed.CustomEmbed.GuildId = guildId
		tag.Embed = snapshot.Embed
	}

	// Save the tag
	if err := dbclient.Client.Tag.Set(ctx, tag); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save tag to database"))
		return
	}

	// Increment the import count on the gallery listing (non-fatal)
	if err := dbclient.Client.GalleryListings.IncrementImportCount(ctx, listingId); err != nil {
		_ = app.NewError(err, "Failed to increment gallery listing import count")
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionGalleryImport,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		NewData: map[string]any{
			"listing_type": "tag",
			"tag_id":       body.TagId,
			"listing_id":   listingId,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"tag_id":  body.TagId,
	})
}
