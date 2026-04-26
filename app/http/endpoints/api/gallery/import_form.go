package gallery

import (
	stdjson "encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

type importFormBody struct {
	Title *string `json:"title"`
}

// ImportFormHandler handles POST /api/:id/gallery/import-form/:listingId
// Imports a gallery form listing as a new form in the guild.
func ImportFormHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	listingId, err := strconv.Atoi(ctx.Param("listingId"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing ID"))
		return
	}

	var body importFormBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		// Body is optional; title override is optional
		body = importFormBody{}
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

	if listing.ListingType != database.GalleryListingTypeForm {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("This listing is not a form"))
		return
	}

	// Unmarshal the form snapshot from the listing
	var snapshot database.GalleryFormSnapshot
	if err := stdjson.Unmarshal(listing.SnapshotData, &snapshot); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to parse form snapshot data"))
		return
	}

	// Determine form title: use the override if provided, otherwise the snapshot title
	title := snapshot.Title
	if body.Title != nil && len(strings.TrimSpace(*body.Title)) > 0 {
		title = *body.Title
	}

	// Validate title length (same constraint as form create endpoint)
	if len(strings.TrimSpace(title)) == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Form title cannot be empty"))
		return
	}

	if utf8.RuneCountInString(title) > 45 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Form title must be 45 characters or less (current: %d characters)", utf8.RuneCountInString(title)))
		return
	}

	// Generate a unique custom ID for the new form
	formCustomId, err := utils.RandString(30)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to generate unique form ID"))
		return
	}

	// Create the form record
	formId, err := dbclient.Client.Forms.Create(ctx, guildId, title, formCustomId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create form in database"))
		return
	}

	// Create form inputs and their options within a transaction
	if len(snapshot.Inputs) > 0 {
		tx, err := dbclient.Client.FormInput.Begin(ctx)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to start database transaction"))
			return
		}

		committed := false
		defer func() {
			if !committed {
				_ = tx.Rollback(ctx)
			}
		}()

		if err := createFormInputs(ctx, tx, formId, snapshot.Inputs); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save form inputs to database"))
			return
		}

		if err := tx.Commit(ctx); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to commit form inputs transaction"))
			return
		}

		committed = true
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
			"listing_type": "form",
			"form_id":      formId,
			"listing_id":   listingId,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"form_id": formId,
	})
}

// createFormInputs creates all form inputs and their options within a transaction.
func createFormInputs(ctx *gin.Context, tx pgx.Tx, formId int, inputs []database.GalleryFormInputSnapshot) error {
	for _, input := range inputs {
		inputCustomId, err := utils.RandString(30)
		if err != nil {
			return fmt.Errorf("failed to generate input custom ID: %w", err)
		}

		inputId, err := dbclient.Client.FormInput.CreateTx(
			ctx, tx, formId,
			input.Type,
			inputCustomId,
			input.Position,
			input.Style,
			input.Label,
			input.Description,
			input.Placeholder,
			input.Required,
			input.MinLength,
			input.MaxLength,
		)
		if err != nil {
			return fmt.Errorf("failed to create form input: %w", err)
		}

		for _, opt := range input.Options {
			option := database.FormInputOption{
				FormInputId: inputId,
				Position:    opt.Position,
				Label:       opt.Label,
				Description: opt.Description,
				Value:       opt.Value,
			}

			if _, err := dbclient.Client.FormInputOption.CreateTx(ctx, tx, option); err != nil {
				return fmt.Errorf("failed to create form input option: %w", err)
			}
		}
	}

	return nil
}
