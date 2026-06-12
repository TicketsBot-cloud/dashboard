package gallery

import (
	stdjson "encoding/json"
	"context"
	"errors"
	"time"

	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/TicketsBot-cloud/database"
)

// AllowedCategories defines the permitted categories for gallery submissions.
var AllowedCategories = map[string]bool{
	"support":     true,
	"moderation":  true,
	"application": true,
	"feedback":    true,
	"sales":       true,
	"general":     true,
	"other":       true,
}

// submittedUser holds cached Discord user data embedded in listing responses.
type submittedUser struct {
	Id        uint64 `json:"id,string"`
	Username  string `json:"username"`
	AvatarUrl string `json:"avatar_url,omitempty"`
}

// resolveUser resolves a single user from the Discord cache.
func resolveUser(ctx context.Context, userId uint64) submittedUser {
	user, err := cache.Instance.GetUser(ctx, userId)
	if err == nil {
		return submittedUser{
			Id:        userId,
			Username:  user.Username,
			AvatarUrl: user.AvatarUrl(256),
		}
	} else if errors.Is(err, cache2.ErrNotFound) {
		return submittedUser{
			Id:       userId,
			Username: "Unknown User",
		}
	}
	return submittedUser{Id: userId, Username: "Unknown User"}
}

// resolveUsersBatch batch-resolves user data from the Discord cache.
func resolveUsersBatch(ctx context.Context, userIds []uint64) map[uint64]submittedUser {
	resolved := make(map[uint64]submittedUser, len(userIds))
	for _, id := range userIds {
		resolved[id] = resolveUser(ctx, id)
	}
	return resolved
}

// galleryListingPublicResponse is the public API response that omits sensitive fields
// such as source guild ID and review notes.
type galleryListingPublicResponse struct {
	Id                        int                  `json:"id"`
	ListingType               string               `json:"listing_type"`
	SubmittedUser             submittedUser        `json:"submitted_user"`
	Name                      string               `json:"name"`
	Description               string               `json:"description"`
	Category                  string               `json:"category"`
	ImportCount               int                  `json:"import_count"`
	Featured                  bool                 `json:"featured"`
	SnapshotData              stdjson.RawMessage   `json:"snapshot_data,omitempty"`
	Title                     string               `json:"title"`
	Content                   string               `json:"content"`
	Colour                    int32                `json:"colour"`
	ImageUrl                  *string              `json:"image_url,omitempty"`
	ThumbnailUrl              *string              `json:"thumbnail_url,omitempty"`
	ButtonStyle               *int16               `json:"button_style"`
	ButtonLabel               string               `json:"button_label"`
	EmojiName                 *string              `json:"emoji_name,omitempty"`
	WelcomeMessage            stdjson.RawMessage   `json:"welcome_message,omitempty"`
	Tags                      []string             `json:"tags"`
	CreatedAt                 time.Time            `json:"created_at"`
	UpdatedAt                 time.Time            `json:"updated_at"`
}

// galleryListingResponse is the full API response including sensitive fields,
// used only for guild-scoped and admin endpoints.
type galleryListingResponse struct {
	Id                        int                  `json:"id"`
	ListingType               string               `json:"listing_type"`
	SubmittedUser             submittedUser        `json:"submitted_user"`
	SourceGuildId             uint64               `json:"source_guild_id,string"`
	Name                      string               `json:"name"`
	Description               string               `json:"description"`
	Category                  string               `json:"category"`
	Status                    string               `json:"status"`
	ReviewNote                *string              `json:"review_note,omitempty"`
	ImportCount               int                  `json:"import_count"`
	Featured                  bool                 `json:"featured"`
	SnapshotData              stdjson.RawMessage   `json:"snapshot_data,omitempty"`
	Title                     string               `json:"title"`
	Content                   string               `json:"content"`
	Colour                    int32                `json:"colour"`
	ImageUrl                  *string              `json:"image_url,omitempty"`
	ThumbnailUrl              *string              `json:"thumbnail_url,omitempty"`
	ButtonStyle               *int16               `json:"button_style"`
	ButtonLabel               string               `json:"button_label"`
	EmojiName                 *string              `json:"emoji_name,omitempty"`
	WelcomeMessage            stdjson.RawMessage   `json:"welcome_message,omitempty"`
	Tags                      []string             `json:"tags"`
	CreatedAt                 time.Time            `json:"created_at"`
	UpdatedAt                 time.Time            `json:"updated_at"`
}

// stripWelcomeMessageGuildId removes the guild_id field from a welcome message JSON blob.
func stripWelcomeMessageGuildId(raw []byte) stdjson.RawMessage {
	if len(raw) == 0 {
		return nil
	}

	var m map[string]interface{}
	if err := stdjson.Unmarshal(raw, &m); err != nil {
		return stdjson.RawMessage(raw) // return as-is if not valid JSON
	}

	delete(m, "guild_id")
	delete(m, "id")

	stripped, err := stdjson.Marshal(m)
	if err != nil {
		return stdjson.RawMessage(raw)
	}
	return stdjson.RawMessage(stripped)
}

func toPublicListingResponse(l database.GalleryListing, tags []string, user submittedUser) galleryListingPublicResponse {
	listingType := l.ListingType
	if listingType == "" {
		listingType = database.GalleryListingTypePanel
	}

	return galleryListingPublicResponse{
		Id:                        l.Id,
		ListingType:               listingType,
		SubmittedUser:             user,
		Name:                      l.Name,
		Description:               l.Description,
		Category:                  l.Category,
		ImportCount:               l.ImportCount,
		Featured:                  l.Featured,
		SnapshotData:              stdjson.RawMessage(l.SnapshotData),
		Title:                     l.Title,
		Content:                   l.Content,
		Colour:                    l.Colour,
		ImageUrl:                  l.ImageUrl,
		ThumbnailUrl:              l.ThumbnailUrl,
		ButtonStyle:               l.ButtonStyle,
		ButtonLabel:               l.ButtonLabel,
		EmojiName:                 l.EmojiName,
		WelcomeMessage:            stripWelcomeMessageGuildId(l.WelcomeMessage),
		Tags:                      tags,
		CreatedAt:                 l.CreatedAt,
		UpdatedAt:                 l.UpdatedAt,
	}
}

func toListingResponse(l database.GalleryListing, tags []string, user submittedUser) galleryListingResponse {
	listingType := l.ListingType
	if listingType == "" {
		listingType = database.GalleryListingTypePanel
	}

	return galleryListingResponse{
		Id:                        l.Id,
		ListingType:               listingType,
		SubmittedUser:             user,
		SourceGuildId:             l.SourceGuildId,
		Name:                      l.Name,
		Description:               l.Description,
		Category:                  l.Category,
		Status:                    string(l.Status),
		ReviewNote:                l.ReviewNote,
		ImportCount:               l.ImportCount,
		Featured:                  l.Featured,
		SnapshotData:              stdjson.RawMessage(l.SnapshotData),
		Title:                     l.Title,
		Content:                   l.Content,
		Colour:                    l.Colour,
		ImageUrl:                  l.ImageUrl,
		ThumbnailUrl:              l.ThumbnailUrl,
		ButtonStyle:               l.ButtonStyle,
		ButtonLabel:               l.ButtonLabel,
		EmojiName:                 l.EmojiName,
		WelcomeMessage:            stdjson.RawMessage(l.WelcomeMessage),
		Tags:                      tags,
		CreatedAt:                 l.CreatedAt,
		UpdatedAt:                 l.UpdatedAt,
	}
}
