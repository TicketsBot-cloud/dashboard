package api

import (
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func newIntegrationValidator() *validator.Validate {
	v := validator.New()
	utils.Must(v.RegisterValidation("webhook", WebhookValidator))

	// Report the JSON field name in errors, so messages match what the dashboard
	// actually sends (webhook_url) rather than the Go field name (WebhookUrl).
	v.RegisterTagNameFunc(func(field reflect.StructField) string {
		name := strings.SplitN(field.Tag.Get("json"), ",", 2)[0]
		if name == "" || name == "-" {
			return field.Name
		}

		return name
	})

	return v
}

func WebhookValidator(fl validator.FieldLevel) bool {
	return utils.ValidateWebhookUrl(fl.Field().String()) == nil
}
