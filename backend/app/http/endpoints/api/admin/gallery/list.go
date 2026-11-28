package gallery

import (
	stdjson "encoding/json"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	api_gallery "github.com/ticketsbot-cloud/dashboard/backend/app/http/endpoints/api/gallery"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/internal/admin"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
)

type adminUserData struct {
	Id        uint64 `json:"id,string"`
	Username  string `json:"username"`
	AvatarUrl string `json:"avatar_url,omitempty"`
}

// Embedding database.GalleryListing instead would marshal its []byte columns as base64.
type adminListingResponse struct {
	Id                int                `json:"id"`
	ListingType       string             `json:"listing_type"`
	SubmittedUser     adminUserData      `json:"submitted_user"`
	SourceGuildId     uint64             `json:"source_guild_id,string"`
	SourceGuildName   string             `json:"source_guild_name,omitempty"`
	SourceGuildIcon   string             `json:"source_guild_icon,omitempty"`
	Name              string             `json:"name"`
	Description       string             `json:"description"`
	Category          string             `json:"category"`
	Status            string             `json:"status"`
	ReviewNote        *string            `json:"review_note"`
	ReviewedBy        *adminUserData     `json:"reviewed_by"`
	ReviewedAt        *time.Time         `json:"reviewed_at"`
	ImportCount       int                `json:"import_count"`
	Featured          bool               `json:"featured"`
	SnapshotData      stdjson.RawMessage `json:"snapshot_data,omitempty"`
	Title             string             `json:"title"`
	Content           string             `json:"content"`
	Colour            *int32             `json:"colour"`
	ImageUrl          *string            `json:"image_url"`
	ThumbnailUrl      *string            `json:"thumbnail_url"`
	ButtonStyle       *int16             `json:"button_style"`
	ButtonLabel       string             `json:"button_label"`
	EmojiName         *string            `json:"emoji_name"`
	WelcomeMessage    stdjson.RawMessage `json:"welcome_message,omitempty"`
	Tags              []string           `json:"tags"`
	CreatedAt         time.Time          `json:"created_at"`
	ServerBlacklisted bool               `json:"server_blacklisted,omitempty"`
	// Admin tier and up only, since only they can read the gallery blacklist
	SubmitterGalleryBlacklisted   bool `json:"submitter_gallery_blacklisted,omitempty"`
	SourceGuildGalleryBlacklisted bool `json:"source_guild_gallery_blacklisted,omitempty"`
}

func toAdminListingResponse(l database.GalleryListing, tags []string, users map[uint64]adminUserData) adminListingResponse {
	listingType := l.ListingType
	if listingType == "" {
		listingType = database.GalleryListingTypePanel
	}

	var reviewer *adminUserData
	if l.ReviewedBy != nil {
		u := users[*l.ReviewedBy]
		reviewer = &u
	}

	return adminListingResponse{
		Id:             l.Id,
		ListingType:    listingType,
		SubmittedUser:  users[l.SubmitterUserId],
		SourceGuildId:  l.SourceGuildId,
		Name:           l.Name,
		Description:    l.Description,
		Category:       l.Category,
		Status:         string(l.Status),
		ReviewNote:     l.ReviewNote,
		ReviewedBy:     reviewer,
		ReviewedAt:     l.ReviewedAt,
		ImportCount:    l.ImportCount,
		Featured:       l.Featured,
		SnapshotData:   api_gallery.SnapshotResponse(l),
		Title:          l.Title,
		Content:        l.Content,
		Colour:         l.Colour,
		ImageUrl:       l.ImageUrl,
		ThumbnailUrl:   l.ThumbnailUrl,
		ButtonStyle:    l.ButtonStyle,
		ButtonLabel:    l.ButtonLabel,
		EmojiName:      l.EmojiName,
		WelcomeMessage: api_gallery.WelcomeMessageResponse(l.WelcomeMessage),
		Tags:           tags,
		CreatedAt:      l.CreatedAt,
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

	// Blacklist badges are advisory, so a failed lookup must not take down the review queue
	serverBlacklist, err := dbclient.Client.ServerBlacklist.ListAll(ctx)
	if err != nil {
		log.Logger.Warn("Failed to fetch server blacklist for gallery review", zap.Error(err))
	}

	blacklistedGuilds := make(map[uint64]bool, len(serverBlacklist))
	for _, guildId := range serverBlacklist {
		blacklistedGuilds[guildId] = true
	}

	galleryBlacklistedUsers := make(map[uint64]bool)
	galleryBlacklistedGuilds := make(map[uint64]bool)
	if admin.TierSatisfies(admin.AdminTier(ctx.Keys["admin_tier"].(string)), admin.AdminTierAdmin) {
		entries, err := dbclient.Client.SubmissionBlacklist.List(ctx, database.SubmissionFeatureGallery)
		if err != nil {
			log.Logger.Warn("Failed to fetch gallery blacklist for gallery review", zap.Error(err))
		}

		for _, entry := range entries {
			switch entry.TargetType {
			case database.SubmissionTargetUser:
				galleryBlacklistedUsers[entry.TargetId] = true
			case database.SubmissionTargetGuild:
				galleryBlacklistedGuilds[entry.TargetId] = true
			}
		}
	}

	userIds := make([]uint64, 0, len(listings))
	guildIds := make([]uint64, 0, len(listings))
	for _, l := range listings {
		userIds = append(userIds, l.SubmitterUserId)
		if l.ReviewedBy != nil {
			userIds = append(userIds, *l.ReviewedBy)
		}
		guildIds = append(guildIds, l.SourceGuildId)
	}

	// Names are cosmetic: a cache failure falls back to "Unknown User" and the bare guild ID
	cachedUsers, err := cache.Instance.GetUsers(ctx, userIds)
	if err != nil {
		log.Logger.Warn("Failed to resolve gallery submitters and reviewers", zap.Error(err))
	}

	guilds, err := cache.Instance.GetGuilds(ctx, guildIds)
	if err != nil {
		log.Logger.Warn("Failed to resolve gallery source servers", zap.Error(err))
	}

	users := make(map[uint64]adminUserData, len(userIds))
	for _, id := range userIds {
		if u, ok := cachedUsers[id]; ok {
			users[id] = adminUserData{Id: id, Username: u.Username, AvatarUrl: u.AvatarUrl(256)}
		} else {
			users[id] = adminUserData{Id: id, Username: "Unknown User"}
		}
	}

	response := make([]adminListingResponse, len(listings))
	for i, l := range listings {
		tags := tagsMap[l.Id]
		if tags == nil {
			tags = make([]string, 0)
		}

		response[i] = toAdminListingResponse(l, tags, users)
		if g, ok := guilds[l.SourceGuildId]; ok {
			response[i].SourceGuildName = g.Name
			response[i].SourceGuildIcon = g.Icon
		}
		response[i].ServerBlacklisted = blacklistedGuilds[l.SourceGuildId]
		response[i].SubmitterGalleryBlacklisted = galleryBlacklistedUsers[l.SubmitterUserId]
		response[i].SourceGuildGalleryBlacklisted = galleryBlacklistedGuilds[l.SourceGuildId]
	}

	ctx.JSON(http.StatusOK, response)
}
