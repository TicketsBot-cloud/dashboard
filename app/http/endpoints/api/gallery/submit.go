package gallery

import (
	stdjson "encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"unicode"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/notify"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type submitBody struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags"`
}

// SubmitHandler handles POST /api/:id/gallery/submit/:panelid
// Submits a panel from the guild to the gallery for review.
// Rate limiting should be applied at the route level.
func SubmitHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	panelIdStr := ctx.Param("panelid")
	panelId, err := strconv.Atoi(panelIdStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid panel ID"))
		return
	}

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

	// Fetch the panel from the database, including welcome message embed
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

	// Verify panel belongs to this guild
	if panel.GuildId != guildId {
		ctx.JSON(http.StatusForbidden, utils.ErrorStr("Panel does not belong to this guild"))
		return
	}

	// Validate emoji is unicode only (no custom emoji IDs)
	if panel.EmojiId != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Panels with custom Discord emojis cannot be submitted to the gallery. Please use a standard Unicode emoji instead."))
		return
	}

	// Validate emoji_name is unicode only if set
	if panel.EmojiName != nil {
		if !isUnicodeEmoji(*panel.EmojiName) {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Panels with custom Discord emojis cannot be submitted to the gallery. Please use a standard Unicode emoji instead."))
			return
		}
	}

	// Serialise the welcome message embed if one is configured, stripping guild-specific fields
	var welcomeMessageJSON []byte
	if panelWithWm.WelcomeMessage != nil {
		raw, err := stdjson.Marshal(panelWithWm.WelcomeMessage)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to serialise welcome message"))
			return
		}
		// Strip guild_id and id from the stored JSONB to avoid data leakage
		var m map[string]interface{}
		if err := stdjson.Unmarshal(raw, &m); err == nil {
			delete(m, "guild_id")
			delete(m, "id")
			if stripped, err := stdjson.Marshal(m); err == nil {
				raw = stripped
			}
		}
		welcomeMessageJSON = raw
	}

	// Snapshot the panel design fields into a gallery listing
	listing := database.GalleryListing{
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

	listingId, err := dbclient.Client.GalleryListings.Create(ctx, listing)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create gallery listing"))
		return
	}

	// Set tags
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
			"name":     body.Name,
			"category": body.Category,
			"panel_id": panelId,
		},
	})

	go notify.SendToAdmins(
		ctx,
		notify.CategoryAdminGallery,
		"New Gallery Submission",
		fmt.Sprintf("A new gallery listing \"%s\" has been submitted for review.", body.Name),
		"/admin/gallery",
	)

	ctx.JSON(http.StatusOK, gin.H{
		"success":    true,
		"listing_id": listingId,
	})
}

// isUnicodeEmoji checks if a string contains only Unicode characters (not a custom emoji ID).
func isUnicodeEmoji(s string) bool {
	if len(s) == 0 {
		return false
	}

	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError {
			return false
		}
		// Allow emoji-related Unicode characters (not ASCII letters/digits which would indicate a custom emoji name)
		if r < 128 && (unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_') {
			return false
		}
		i += size
	}

	return true
}

func intToInt16Ptr(v int) *int16 {
	i := int16(v)
	return &i
}

