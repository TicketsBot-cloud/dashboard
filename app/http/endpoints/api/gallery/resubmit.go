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
	"golang.org/x/sync/errgroup"
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

	// Re-snapshot the source resource based on listing type
	listingType := listing.ListingType
	if listingType == "" {
		listingType = database.GalleryListingTypePanel
	}

	sourceIdStr := ctx.Query("panelId")
	if sourceIdStr == "" {
		sourceIdStr = ctx.Query("tagId")
	}
	if sourceIdStr == "" {
		sourceIdStr = ctx.Query("formId")
	}

	if sourceIdStr == "" {
		if err := dbclient.Client.GalleryListings.UpdateMetadata(ctx, listingId, body.Name, body.Description, body.Category); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update gallery listing"))
			return
		}
	} else {
		var updated database.GalleryListing
		updated.Id = listingId
		updated.Name = body.Name
		updated.Description = body.Description
		updated.Category = body.Category
		updated.Status = database.GalleryListingStatusPending

		switch listingType {
		case database.GalleryListingTypePanel:
			panelId, err := strconv.Atoi(sourceIdStr)
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

			updated.Title = panel.Title
			updated.Content = panel.Content
			updated.Colour = panel.Colour
			updated.ImageUrl = panel.ImageUrl
			updated.ThumbnailUrl = panel.ThumbnailUrl
			updated.ButtonStyle = intToInt16Ptr(panel.ButtonStyle)
			updated.ButtonLabel = panel.ButtonLabel
			updated.EmojiName = panel.EmojiName
			updated.WelcomeMessage = welcomeMessageJSON

		case database.GalleryListingTypeTag:
			tag, ok, err := dbclient.Client.Tag.Get(ctx, guildId, sourceIdStr)
			if err != nil {
				_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch tag"))
				return
			}
			if !ok {
				ctx.JSON(http.StatusNotFound, utils.ErrorStr("Tag not found"))
				return
			}
			if tag.Content == nil && tag.Embed == nil {
				ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Tag has no content to share"))
				return
			}

			snapshot := database.GalleryTagSnapshot{Content: tag.Content}
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
			updated.SnapshotData = snapshotJSON

		case database.GalleryListingTypeForm:
			formId, err := strconv.Atoi(sourceIdStr)
			if err != nil {
				ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid form ID"))
				return
			}

			form, ok, err := dbclient.Client.Forms.Get(ctx, formId)
			if err != nil {
				_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch form"))
				return
			}
			if !ok {
				ctx.JSON(http.StatusNotFound, utils.ErrorStr("Form not found"))
				return
			}
			if form.GuildId != guildId {
				ctx.JSON(http.StatusForbidden, utils.ErrorStr("Form does not belong to this guild"))
				return
			}

			var inputs []database.FormInput
			var optionsByInput map[int][]database.FormInputOption

			g, gCtx := errgroup.WithContext(ctx)
			g.Go(func() error {
				var err error
				inputs, err = dbclient.Client.FormInput.GetInputs(gCtx, formId)
				return err
			})
			g.Go(func() error {
				var err error
				optionsByInput, err = dbclient.Client.FormInputOption.GetOptionsByForm(gCtx, formId)
				return err
			})
			if err := g.Wait(); err != nil {
				_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch form inputs"))
				return
			}

			snapshotInputs := make([]database.GalleryFormInputSnapshot, len(inputs))
			for i, input := range inputs {
				snapshotInputs[i] = database.GalleryFormInputSnapshot{
					Type: input.Type, Position: input.Position, Style: input.Style,
					Label: input.Label, Description: input.Description, Placeholder: input.Placeholder,
					Required: input.Required, MinLength: input.MinLength, MaxLength: input.MaxLength,
				}
				if opts, exists := optionsByInput[input.Id]; exists {
					snapshotOpts := make([]database.GalleryFormInputOptionSnapshot, len(opts))
					for j, opt := range opts {
						snapshotOpts[j] = database.GalleryFormInputOptionSnapshot{
							Position: opt.Position, Label: opt.Label, Description: opt.Description, Value: opt.Value,
						}
					}
					snapshotInputs[i].Options = snapshotOpts
				}
			}

			snapshotJSON, err := stdjson.Marshal(database.GalleryFormSnapshot{Title: form.Title, Inputs: snapshotInputs})
			if err != nil {
				_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to serialise form snapshot"))
				return
			}
			updated.SnapshotData = snapshotJSON

		default:
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Unsupported listing type"))
			return
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
