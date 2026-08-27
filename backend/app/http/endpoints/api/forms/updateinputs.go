package forms

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v4"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
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
		Type        int                      `json:"type" validate:"required,oneof=3 4 5 6 7 8 21 22"`
		Position    int                      `json:"position" validate:"required,min=1,max=5"`
		Style       component.TextStyleTypes `json:"style" validate:"omitempty,required,min=1,max=2"`
		Required    bool                     `json:"required"`
		MinLength   uint16                   `json:"min_length" validate:"min=0,max=4000"`
		MaxLength   uint16                   `json:"max_length" validate:"min=0,max=4000"`
		Options     []inputOption            `json:"options,omitempty" validate:"omitempty,dive,required,min=1,max=25"`
		ApiConfig   *inputApiConfigBody      `json:"api_config,omitempty" validate:"omitempty,dive"`
	}

	inputOption struct {
		Label       string  `json:"label" validate:"required,min=1,max=100"`
		Description *string `json:"description,omitempty" validate:"omitempty,max=100"`
		Value       string  `json:"value" validate:"required,min=1,max=100"`
	}

	inputApiConfigBody struct {
		EndpointUrl          string               `json:"endpoint_url" validate:"required,min=1,max=500"`
		Method               string               `json:"method" validate:"required,oneof=GET POST"`
		CacheDurationSeconds *int                 `json:"cache_duration_seconds,omitempty" validate:"omitempty,min=0"`
		NoOptionsMessage     *string              `json:"no_options_message,omitempty" validate:"omitempty,max=100"`
		BodyTemplate         *string              `json:"body_template,omitempty" validate:"omitempty,max=8192"`
		Headers              []inputApiHeaderBody `json:"headers,omitempty" validate:"omitempty,max=20,dive"`
	}

	inputApiHeaderBody struct {
		HeaderName  string `json:"header_name" validate:"required,min=1,max=255"`
		HeaderValue string `json:"header_value" validate:"required,min=1,max=8192"`
		IsSecret    bool   `json:"is_secret"`
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

	if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_FORMS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Form management is temporarily unavailable. Please try again shortly."))
		return
	}

	formId, err := strconv.Atoi(c.Param("form-id"))
	if err != nil {
		c.JSON(400, utils.ErrorStr("Invalid form ID provided: %s", c.Param("form-id")))
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
		c.JSON(400, utils.ErrorStr("%s", formatted))
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

	// Validate inputs that require options (String Select, RadioGroup, CheckboxGroup)
	optionTypes := map[int]string{
		3:  "String select",
		21: "Radio group",
		22: "Checkbox group",
	}

	for _, input := range data.Create {
		if err := validateInput(input, optionTypes); err != nil {
			c.JSON(400, utils.ErrorStr("%v", err))
			return
		}
	}

	for _, input := range data.Update {
		if err := validateInput(input.inputCreateBody, optionTypes); err != nil {
			c.JSON(400, utils.ErrorStr("%v", err))
			return
		}
	}

	if err := saveInputs(c, formId, data, existingInputs); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save form inputs to database"))
		return
	}

	redactSecretHeaderValues(&data)

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

func validateApiBodyTemplate(config *inputApiConfigBody) error {
	if config.BodyTemplate == nil || strings.TrimSpace(*config.BodyTemplate) == "" {
		return nil
	}

	if config.Method == http.MethodGet {
		return fmt.Errorf("A request body cannot be sent with the GET method")
	}

	stripped := utils.PlaceholderRegex.ReplaceAllString(*config.BodyTemplate, "null")
	if !json.Valid([]byte(stripped)) {
		return fmt.Errorf("The API request body must be valid JSON")
	}

	return nil
}

func validateInput(input inputCreateBody, optionTypes map[int]string) error {
	if input.Type == 4 && input.MaxLength < 1 {
		return fmt.Errorf("Text input max length must be at least 1")
	}

	typeName, requiresOptions := optionTypes[input.Type]
	if !requiresOptions {
		return nil
	}

	// For String Select (type 3), allow API config as alternative to options
	if input.Type == 3 && input.ApiConfig != nil {
		if len(input.Options) > 0 {
			return fmt.Errorf("String select inputs cannot have both options and an API configuration")
		}
		if err := utils.ValidateWebhookUrl(input.ApiConfig.EndpointUrl); err != nil {
			return fmt.Errorf("API endpoint URL: %v", err)
		}
		if err := validateApiBodyTemplate(input.ApiConfig); err != nil {
			return err
		}
		return nil
	}

	switch input.Type {
	case 21:
		if len(input.Options) < 2 {
			return fmt.Errorf("Radio group inputs must have at least 2 options")
		}
		if len(input.Options) > 10 {
			return fmt.Errorf("Radio group inputs must have at most 10 options")
		}
	case 22:
		if len(input.Options) == 0 {
			return fmt.Errorf("%s inputs must have at least one option", typeName)
		}
		if len(input.Options) > 10 {
			return fmt.Errorf("Checkbox group inputs must have at most 10 options")
		}
	default:
		if len(input.Options) == 0 {
			return fmt.Errorf("%s inputs must have at least one option", typeName)
		}
	}

	return validateUniqueOptionValues(input.Options)
}

func normalizeLengths(input inputCreateBody) (*uint16, *uint16) {
	if input.Type == 21 {
		return nil, nil
	}

	minLength := input.MinLength
	maxLength := input.MaxLength

	if input.Type == 3 || (input.Type >= 5 && input.Type <= 8) || input.Type == 22 {
		if minLength > 25 {
			minLength = 25
		}

		if input.Type == 3 || input.Type == 22 {
			optionsLength := uint16(len(input.Options))
			if optionsLength > 0 {
				if maxLength == 0 || maxLength > optionsLength {
					maxLength = optionsLength
				}
			} else {
				if maxLength == 0 || maxLength > 25 {
					maxLength = 25
				}
			}
		} else {
			if maxLength == 0 || maxLength > 25 {
				maxLength = 25
			}
		}

		if maxLength < 1 {
			maxLength = 1
		}

		if minLength > maxLength {
			minLength = maxLength
		}
	}

	return &minLength, &maxLength
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

		minLengthPtr, maxLengthPtr := normalizeLengths(input.inputCreateBody)

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
			MinLength:   minLengthPtr,
			MaxLength:   maxLengthPtr,
		}

		if err := dbclient.Client.FormInput.UpdateTx(ctx, tx, wrapped); err != nil {
			return err
		}

		if wrapped.Type == 3 || wrapped.Type == 21 || wrapped.Type == 22 { // String Select, RadioGroup, CheckboxGroup
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

		if err := saveApiConfig(ctx, tx, wrapped.Id, input.inputCreateBody); err != nil {
			return err
		}
	}

	for _, input := range data.Create {
		customId, err := utils.RandString(30)
		if err != nil {
			return err
		}

		minLengthPtr, maxLengthPtr := normalizeLengths(input)

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
			minLengthPtr,
			maxLengthPtr,
		)

		if err != nil {
			return err
		}

		if input.Type == 3 || input.Type == 21 || input.Type == 22 { // String Select, RadioGroup, CheckboxGroup
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

		if err := saveApiConfig(ctx, tx, formInputId, input); err != nil {
			return err
		}
	}

	return tx.Commit(context.Background())
}

func saveApiConfig(ctx context.Context, tx pgx.Tx, formInputId int, input inputCreateBody) error {
	if input.Type != 3 {
		return nil
	}

	existingConfig, hasExisting, err := dbclient.Client.FormInputApiConfig.GetTx(ctx, tx, formInputId)
	if err != nil {
		return err
	}

	if input.ApiConfig == nil {
		if hasExisting {
			if err := dbclient.Client.FormInputApiConfig.DeleteTx(ctx, tx, existingConfig.Id); err != nil {
				return err
			}
		}
		return nil
	}

	bodyTemplate := input.ApiConfig.BodyTemplate
	if bodyTemplate != nil && strings.TrimSpace(*bodyTemplate) == "" {
		bodyTemplate = nil
	}

	var existingSecrets map[string]string
	if hasExisting {
		existingSecrets, err = existingSecretHeaders(ctx, existingConfig.Id)
		if err != nil {
			return err
		}
	}

	var configId int
	if hasExisting {
		if err := dbclient.Client.FormInputApiConfig.UpdateTx(ctx, tx, existingConfig.Id, input.ApiConfig.EndpointUrl, input.ApiConfig.Method, input.ApiConfig.CacheDurationSeconds, input.ApiConfig.NoOptionsMessage, bodyTemplate); err != nil {
			return err
		}
		configId = existingConfig.Id
	} else {
		configId, err = dbclient.Client.FormInputApiConfig.CreateTx(ctx, tx, formInputId, input.ApiConfig.EndpointUrl, input.ApiConfig.Method, input.ApiConfig.CacheDurationSeconds, input.ApiConfig.NoOptionsMessage, bodyTemplate)
		if err != nil {
			return err
		}
	}

	if hasExisting {
		if err := dbclient.Client.FormInputApiHeaders.DeleteByApiConfigTx(ctx, tx, configId); err != nil {
			return err
		}
	}

	for _, header := range input.ApiConfig.Headers {
		value := header.HeaderValue
		if header.IsSecret && value == SecretHeaderMask {
			previous, ok := existingSecrets[header.HeaderName]
			if !ok {
				return fmt.Errorf("Header \"%s\" was submitted masked but has no stored value - please enter it again", header.HeaderName)
			}

			value = previous
		}

		if _, err := dbclient.Client.FormInputApiHeaders.CreateTx(ctx, tx, configId, header.HeaderName, value, header.IsSecret); err != nil {
			return err
		}
	}

	return nil
}
