package gallery

import (
	stdjson "encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/database"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

type adminUserData struct {
	Id        uint64 `json:"id,string"`
	Username  string `json:"username"`
	AvatarUrl string `json:"avatar_url,omitempty"`
}

// Embedding database.GalleryListing instead would marshal its []byte columns as base64.
type adminListingResponse struct {
	Id             int                `json:"id"`
	ListingType    string             `json:"listing_type"`
	SubmittedUser  adminUserData      `json:"submitted_user"`
	SourceGuildId  uint64             `json:"source_guild_id,string"`
	Name           string             `json:"name"`
	Description    string             `json:"description"`
	Category       string             `json:"category"`
	Status         string             `json:"status"`
	ReviewNote     *string            `json:"review_note"`
	ReviewedBy     *uint64            `json:"reviewed_by,string"`
	ReviewedAt     *time.Time         `json:"reviewed_at"`
	ImportCount    int                `json:"import_count"`
	Featured       bool               `json:"featured"`
	SnapshotData   stdjson.RawMessage `json:"snapshot_data,omitempty"`
	Title          string             `json:"title"`
	Content        string             `json:"content"`
	Colour         int32              `json:"colour"`
	ImageUrl       *string            `json:"image_url"`
	ThumbnailUrl   *string            `json:"thumbnail_url"`
	ButtonStyle    *int16             `json:"button_style"`
	ButtonLabel    string             `json:"button_label"`
	EmojiName      *string            `json:"emoji_name"`
	WelcomeMessage stdjson.RawMessage `json:"welcome_message,omitempty"`
	Tags           []string           `json:"tags"`
	CreatedAt      time.Time          `json:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at"`
}

func toAdminListingResponse(l database.GalleryListing, tags []string, user adminUserData) adminListingResponse {
	listingType := l.ListingType
	if listingType == "" {
		listingType = database.GalleryListingTypePanel
	}

	return adminListingResponse{
		Id:             l.Id,
		ListingType:    listingType,
		SubmittedUser:  user,
		SourceGuildId:  l.SourceGuildId,
		Name:           l.Name,
		Description:    l.Description,
		Category:       l.Category,
		Status:         string(l.Status),
		ReviewNote:     l.ReviewNote,
		ReviewedBy:     l.ReviewedBy,
		ReviewedAt:     l.ReviewedAt,
		ImportCount:    l.ImportCount,
		Featured:       l.Featured,
		SnapshotData:   stdjson.RawMessage(l.SnapshotData),
		Title:          l.Title,
		Content:        l.Content,
		Colour:         l.Colour,
		ImageUrl:       l.ImageUrl,
		ThumbnailUrl:   l.ThumbnailUrl,
		ButtonStyle:    l.ButtonStyle,
		ButtonLabel:    l.ButtonLabel,
		EmojiName:      l.EmojiName,
		WelcomeMessage: stdjson.RawMessage(l.WelcomeMessage),
		Tags:           tags,
		CreatedAt:      l.CreatedAt,
		UpdatedAt:      l.UpdatedAt,
	}
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
		// Fetch all by getting each status - or we can add a GetAll method.
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

	listingIds := make([]int, len(listings))
	for i, l := range listings {
		listingIds[i] = l.Id
	}

	tagsMap, err := dbclient.Client.GalleryListingTags.GetByListings(ctx, listingIds)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listing tags"))
		return
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

	response := make([]adminListingResponse, len(listings))
	for i, l := range listings {
		tags := tagsMap[l.Id]
		if tags == nil {
			tags = make([]string, 0)
		}
		response[i] = toAdminListingResponse(l, tags, resolvedUsers[l.SubmitterUserId])
	}

	ctx.JSON(http.StatusOK, response)
}
