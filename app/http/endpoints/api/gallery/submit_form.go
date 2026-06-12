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

// SubmitFormHandler handles POST /api/:id/gallery/submit-form/:formid
// Submits a form (ticket intake form) from the guild to the gallery for review.
// Rate limiting should be applied at the route level.
func SubmitFormHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	formIdStr := ctx.Param("formid")
	formId, err := strconv.Atoi(formIdStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid form ID"))
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

	// Fetch the form from the database
	form, ok, err := dbclient.Client.Forms.Get(ctx, formId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch form"))
		return
	}

	if !ok {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Form not found"))
		return
	}

	// Verify form belongs to this guild
	if form.GuildId != guildId {
		ctx.JSON(http.StatusForbidden, utils.ErrorStr("Form does not belong to this guild"))
		return
	}

	// Fetch inputs and options in parallel
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

	// Validate form has at least one input
	if len(inputs) == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Form has no inputs to share"))
		return
	}

	// Build the snapshot, stripping database IDs from inputs and options
	snapshotInputs := make([]database.GalleryFormInputSnapshot, len(inputs))
	for i, input := range inputs {
		snapshotInputs[i] = database.GalleryFormInputSnapshot{
			Type:        input.Type,
			Position:    input.Position,
			Style:       input.Style,
			Label:       input.Label,
			Description: input.Description,
			Placeholder: input.Placeholder,
			Required:    input.Required,
			MinLength:   input.MinLength,
			MaxLength:   input.MaxLength,
		}

		// Attach options for this input, if any
		if opts, exists := optionsByInput[input.Id]; exists {
			snapshotOpts := make([]database.GalleryFormInputOptionSnapshot, len(opts))
			for j, opt := range opts {
				snapshotOpts[j] = database.GalleryFormInputOptionSnapshot{
					Position:    opt.Position,
					Label:       opt.Label,
					Description: opt.Description,
					Value:       opt.Value,
				}
			}
			snapshotInputs[i].Options = snapshotOpts
		}
	}

	snapshot := database.GalleryFormSnapshot{
		Title:  form.Title,
		Inputs: snapshotInputs,
	}

	snapshotJSON, err := stdjson.Marshal(snapshot)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to serialise form snapshot"))
		return
	}

	// Create the gallery listing with form-specific fields
	listing := database.GalleryListing{
		SubmitterUserId: userId,
		SourceGuildId:   guildId,
		ListingType:     database.GalleryListingTypeForm,
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
			"listing_type": "form",
			"form_id":      formId,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"success":    true,
		"listing_id": listingId,
	})
}
