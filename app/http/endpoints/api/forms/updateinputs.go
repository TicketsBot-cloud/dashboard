package forms

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

type (
	updateInputsBody struct {
		Create []inputCreateBody `json:"create" validate:"omitempty,dive"`
		Update []inputUpdateBody `json:"update" validate:"omitempty,dive"`
		Delete []int             `json:"delete" validate:"omitempty"`
	}

	inputCreateBody struct {
		Label       string                   `json:"label" validate:"required,min=1,max=45"`
		Description *string                  `json:"description,omitempty" validate:"omitempty,max=100"`
		Placeholder *string                  `json:"placeholder,omitempty" validate:"omitempty,min=1,max=100"`
		Type        int                      `json:"type" validate:"required,min=3,max=8"`
		Position    int                      `json:"position" validate:"required,min=1,max=5"`
		Style       component.TextStyleTypes `json:"style" validate:"omitempty,required,min=1,max=2"`
		Required    bool                     `json:"required"`
		MinLength   uint16                   `json:"min_length" validate:"min=0,max=1024"` // validator interprets 0 as not set
		MaxLength   uint16                   `json:"max_length" validate:"min=0,max=1024"`
		Options     []inputOption            `json:"options,omitempty" validate:"omitempty,dive,required,min=1,max=25"`
	}

	inputOption struct {
		Label       string  `json:"label" validate:"required,min=1,max=100"`
		Description *string `json:"description,omitempty" validate:"omitempty,max=100"`
		Value       string  `json:"value" validate:"required,min=1,max=100"`
	}

	inputUpdateBody struct {
		Id              int `json:"id" validate:"required"`
		inputCreateBody `validate:"required,dive"`
	}
)

var validate = validator.New()

func UpdateInputs(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	formId, err := strconv.Atoi(c.Param("form_id"))
	if err != nil {
		c.JSON(400, utils.ErrorStr("Invalid form ID provided: %s", c.Param("form_id")))
		return
	}

	var data updateInputsBody
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if err := validate.Struct(data); err != nil {
		var validationErrors validator.ValidationErrors
		if !errors.As(err, &validationErrors) {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Form input validation failed unexpectedly"))
			return
		}

		formatted := "Your input contained the following errors:\n" + utils.FormatValidationErrors(validationErrors)
		c.JSON(400, utils.ErrorStr(formatted))
		return
	}

	fieldCount := len(data.Create) + len(data.Update)
	if fieldCount <= 0 || fieldCount > 5 {
		c.JSON(400, utils.ErrorStr("Forms must have between 1 and 5 inputs (current: %d inputs)", fieldCount))
		return
	}

	// Verify form exists and is from the right guild
	form, ok, err := dbclient.Client.Forms.Get(c, formId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch form from database"))
		return
	}

	if !ok {
		c.JSON(404, utils.ErrorStr("Form #%d not found", formId))
		return
	}

	if form.GuildId != guildId {
		c.JSON(403, utils.ErrorStr("Form #%d does not belong to guild %d", formId, guildId))
		return
	}

	existingInputs, err := dbclient.Client.FormInput.GetInputs(c, formId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch form inputs from database"))
		return
	}

	// Verify that the UPDATE inputs exist
	for _, input := range data.Update {
		if !utils.ExistsMap(existingInputs, input.Id, idMapper) {
			c.JSON(400, utils.ErrorStr("Input #%d (to be updated) not found in form #%d", input.Id, formId))
			return
		}
	}

	// Verify that the DELETE inputs exist
	for _, id := range data.Delete {
		if !utils.ExistsMap(existingInputs, id, idMapper) {
			c.JSON(400, utils.ErrorStr("Input #%d (to be deleted) not found in form #%d", id, formId))
			return
		}
	}

	// Ensure no overlap between DELETE and UPDATE
	for _, id := range data.Delete {
		if utils.ExistsMap(data.Update, id, idMapperBody) {
			c.JSON(400, utils.ErrorStr("Input #%d cannot be both deleted and updated", id))
			return
		}
	}

	// Verify that we are updating ALL inputs, excluding the ones to be deleted
	var remainingExisting []int
	for _, input := range existingInputs {
		if !utils.Exists(data.Delete, input.Id) {
			remainingExisting = append(remainingExisting, input.Id)
		}
	}

	// Now verify that the contents match exactly
	if len(remainingExisting) != len(data.Update) {
		c.JSON(400, utils.ErrorStr("All %d existing inputs must be included in the update array (found %d)", len(remainingExisting), len(data.Update)))
		return
	}

	for _, input := range data.Update {
		if !utils.Exists(remainingExisting, input.Id) {
			c.JSON(400, utils.ErrorStr("Input #%d must be included in the update array", input.Id))
			return
		}
	}

	// Verify that the positions are unique, and are in ascending order
	if !arePositionsCorrect(data) {
		c.JSON(400, utils.ErrorStr("Input positions must be unique and in ascending order (1, 2, 3, etc.)"))
		return
	}

	// Validate string select inputs have at least one option and unique option values
	for _, input := range data.Create {
		if input.Type == 3 {
			if len(input.Options) == 0 {
				c.JSON(400, utils.ErrorStr("String select inputs must have at least one option"))
				return
			}
			if err := validateUniqueOptionValues(input.Options); err != nil {
				c.JSON(400, utils.ErrorStr("%v", err))
				return
			}
		}
	}

	for _, input := range data.Update {
		if input.Type == 3 {
			if len(input.Options) == 0 {
				c.JSON(400, utils.ErrorStr("String select inputs must have at least one option"))
				return
			}
			if err := validateUniqueOptionValues(input.Options); err != nil {
				c.JSON(400, utils.ErrorStr("%v", err))
				return
			}
		}
	}

	if err := saveInputs(c, formId, data, existingInputs); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save form inputs to database"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionFormInputsUpdate,
		ResourceType: database.AuditResourceFormInput,
		ResourceId:   audit.StringPtr(strconv.Itoa(formId)),
		OldData:      existingInputs,
		NewData:      data,
	})
	c.Status(204)
}

func idMapper(input database.FormInput) int {
	return input.Id
}

func idMapperBody(input inputUpdateBody) int {
	return input.Id
}

func arePositionsCorrect(body updateInputsBody) bool {
	var positions []int
	for _, input := range body.Create {
		positions = append(positions, input.Position)
	}

	for _, input := range body.Update {
		positions = append(positions, input.Position)
	}

	sort.Slice(positions, func(i, j int) bool {
		return positions[i] < positions[j]
	})

	for i, position := range positions {
		if i+1 != position {
			return false
		}
	}

	return true
}

func validateUniqueOptionValues(options []inputOption) error {
	if len(options) == 0 {
		return nil
	}

	valueSet := make(map[string]bool)
	duplicates := make(map[string]bool)

	for _, opt := range options {
		if opt.Value == "" {
			continue
		}
		if valueSet[opt.Value] {
			duplicates[opt.Value] = true
		} else {
			valueSet[opt.Value] = true
		}
	}

	if len(duplicates) > 0 {
		duplicateList := make([]string, 0, len(duplicates))
		for value := range duplicates {
			duplicateList = append(duplicateList, value)
		}

		sort.Strings(duplicateList)

		return fmt.Errorf("Duplicate option values detected: %s. Each option must have a unique value", strings.Join(duplicateList, ", "))
	}

	return nil
}

func saveInputs(ctx context.Context, formId int, data updateInputsBody, existingInputs []database.FormInput) error {
	// We can now update in the database
	tx, err := dbclient.Client.BeginTx(ctx)
	if err != nil {
		return err
	}

	defer tx.Rollback(context.Background())

	for _, id := range data.Delete {
		if err := dbclient.Client.FormInput.DeleteTx(ctx, tx, id, formId); err != nil {
			return err
		}
	}

	for _, input := range data.Update {
		existing := utils.FindMap(existingInputs, input.Id, idMapper)
		if existing == nil {
			return fmt.Errorf("input %d does not exist", input.Id)
		}

		// Set default values for min_length and max_length
		minLength := input.MinLength
		maxLength := input.MaxLength

		// Handle select types (3, 5-8)
		if input.Type == 3 || (input.Type >= 5 && input.Type <= 8) {
			// Enforce min_length constraints (0-25)
			if minLength < 0 {
				minLength = 0
			} else if minLength > 25 {
				minLength = 25
			}

			// Handle max_length based on type
			if input.Type == 3 {
				// String Select: use options length as max, can be lower but not higher
				optionsLength := uint16(len(input.Options))
				if optionsLength > 0 {
					if maxLength == 0 || maxLength > optionsLength {
						maxLength = optionsLength
					}
				} else {
					// No options yet, cap at 25
					if maxLength == 0 || maxLength > 25 {
						maxLength = 25
					}
				}
			} else {
				// Other select types (5-8): enforce 1-25 range
				if maxLength == 0 || maxLength > 25 {
					maxLength = 25
				}
			}

			// Ensure max is at least 1
			if maxLength < 1 {
				maxLength = 1
			}

			// Ensure min doesn't exceed max
			if minLength > maxLength {
				minLength = maxLength
			}
		}

		wrapped := database.FormInput{
			Id:          input.Id,
			FormId:      formId,
			Type:        input.Type,
			Position:    input.Position,
			CustomId:    existing.CustomId,
			Style:       uint8(input.Style),
			Label:       input.Label,
			Description: input.Description,
			Placeholder: input.Placeholder,
			Required:    input.Required,
			MinLength:   &minLength,
			MaxLength:   &maxLength,
		}

		if err := dbclient.Client.FormInput.UpdateTx(ctx, tx, wrapped); err != nil {
			return err
		}

		if wrapped.Type == 3 { // String Select
			// Delete existing options
			options, err := dbclient.Client.FormInputOption.GetOptions(ctx, wrapped.Id)
			if err != nil {
				return err
			}

			for _, option := range options {
				if err := dbclient.Client.FormInputOption.DeleteTx(ctx, tx, option.Id); err != nil {
					return err
				}
			}

			// Add new options
			for i, opt := range input.Options {
				option := database.FormInputOption{
					FormInputId: wrapped.Id,
					Position:    i + 1,
					Label:       opt.Label,
					Description: opt.Description,
					Value:       opt.Value,
				}

				if _, err := dbclient.Client.FormInputOption.CreateTx(ctx, tx, option); err != nil {
					return err
				}
			}
		}
	}

	for _, input := range data.Create {
		customId, err := utils.RandString(30)
		if err != nil {
			return err
		}

		// Set default values for min_length and max_length
		minLength := input.MinLength
		maxLength := input.MaxLength

		// Handle select types (3, 5-8)
		if input.Type == 3 || (input.Type >= 5 && input.Type <= 8) {
			// Enforce min_length constraints (0-25)
			if minLength < 0 {
				minLength = 0
			} else if minLength > 25 {
				minLength = 25
			}

			// Handle max_length based on type
			if input.Type == 3 {
				// String Select: use options length as max, can be lower but not higher
				optionsLength := uint16(len(input.Options))
				if optionsLength > 0 {
					if maxLength == 0 || maxLength > optionsLength {
						maxLength = optionsLength
					}
				} else {
					// No options yet, cap at 25
					if maxLength == 0 || maxLength > 25 {
						maxLength = 25
					}
				}
			} else {
				// Other select types (5-8): enforce 1-25 range
				if maxLength == 0 || maxLength > 25 {
					maxLength = 25
				}
			}

			// Ensure max is at least 1
			if maxLength < 1 {
				maxLength = 1
			}

			// Ensure min doesn't exceed max
			if minLength > maxLength {
				minLength = maxLength
			}
		}

		formInputId, err := dbclient.Client.FormInput.CreateTx(ctx,
			tx,
			formId,
			input.Type,
			customId,
			input.Position,
			uint8(input.Style),
			input.Label,
			input.Description,
			input.Placeholder,
			input.Required,
			&minLength,
			&maxLength,
		)

		if err != nil {
			return err
		}

		if input.Type == 3 { // String Select
			for i, opt := range input.Options {
				option := database.FormInputOption{
					FormInputId: formInputId,
					Position:    i + 1,
					Label:       opt.Label,
					Description: opt.Description,
					Value:       opt.Value,
				}

				if _, err := dbclient.Client.FormInputOption.CreateTx(ctx, tx, option); err != nil {
					return err
				}
			}
		}
	}

	return tx.Commit(context.Background())
}
