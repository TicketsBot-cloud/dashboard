package api

import (
	"net/url"
	"reflect"
	"regexp"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/go-playground/validator/v10"
)

var placeholderRegex = regexp.MustCompile(`%[\w|-]+%`)

// Hosts integrations must not target. Matched on the registrable domain so
// subdomains (ptb.discord.com) and casing variants are covered.
var blockedDomains = map[string]bool{
	"discord.com": true,
	"discord.gg":  true,
}

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
	value := fl.Field().String()
	stripped := placeholderRegex.ReplaceAllString(value, "")

	parsed, err := url.Parse(stripped)
	if err != nil {
		return false
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}

	if parsed.Host == "" {
		return false
	}

	return !blockedDomains[utils.SecondLevelDomain(strings.ToLower(parsed.Hostname()))]
}
