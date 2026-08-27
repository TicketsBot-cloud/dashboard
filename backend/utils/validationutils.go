package utils

import (
	"fmt"
	"github.com/go-playground/validator/v10"
	"reflect"
	"strings"
)

func FormatValidationError(err validator.FieldError) string {
	switch err.Tag() {
	case "max":
		if err.Type() == reflect.TypeOf("") {
			return fmt.Sprintf("Field \"%s\" cannot exceed %s characters in length", err.Field(), err.Param())
		} else {
			return fmt.Sprintf("Field \"%s\" cannot be greater than %s", err.Field(), err.Param())
		}
	case "min":
		if err.Type() == reflect.TypeOf("") {
			return fmt.Sprintf("Field \"%s\" must be at least %s characters in length", err.Field(), err.Param())
		} else {
			return fmt.Sprintf("Field \"%s\" cannot be less than %s", err.Field(), err.Param())
		}
	case "required":
		return fmt.Sprintf("Field \"%s\" is required", err.Field())
	case "webhook":
		return fmt.Sprintf("Field \"%s\" must be a valid http:// or https:// URL and cannot point to Discord", err.Field())
	case "url":
		return fmt.Sprintf("Field \"%s\" must be a valid URL", err.Field())
	case "startswith":
		return fmt.Sprintf("Field \"%s\" must start with \"%s\"", err.Field(), err.Param())
	case "startsnotwith":
		return fmt.Sprintf("Field \"%s\" cannot start with \"%s\"", err.Field(), err.Param())
	case "oneof":
		return fmt.Sprintf("Field \"%s\" must be one of: %s", err.Field(), strings.ReplaceAll(err.Param(), " ", ", "))
	case "excludes", "excludesall":
		return fmt.Sprintf("Field \"%s\" cannot contain \"%s\"", err.Field(), err.Param())
	default:
		return err.Error()
	}
}

func FormatValidationErrors(errors validator.ValidationErrors) string {
	var formatted string
	for _, err := range errors {
		formatted += FormatValidationError(err) + "\n"
	}

	formatted = strings.TrimSuffix(formatted, "\n")
	return formatted
}
