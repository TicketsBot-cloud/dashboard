package forms

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type redactedApiHeader struct {
	database.FormInputApiHeader
	HeaderValue string `json:"header_value"`
}

type embeddedApiConfig struct {
	database.FormInputApiConfig
	Headers []redactedApiHeader `json:"headers"`
}

func redactHeaders(headers []database.FormInputApiHeader) []redactedApiHeader {
	redacted := make([]redactedApiHeader, len(headers))
	for i, header := range headers {
		value := header.HeaderValue
		if header.IsSecret {
			value = SecretHeaderMask
		}

		redacted[i] = redactedApiHeader{FormInputApiHeader: header, HeaderValue: value}
	}

	return redacted
}

type embeddedFormInput struct {
	database.FormInput
	Options   []database.FormInputOption `json:"options"`
	ApiConfig *embeddedApiConfig         `json:"api_config,omitempty"`
}

type embeddedForm struct {
	database.Form
	Inputs []embeddedFormInput `json:"inputs"`
}

func GetForms(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	forms, err := dbclient.Client.Forms.GetForms(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load forms"))
		return
	}

	inputs, err := dbclient.Client.FormInput.GetInputsForGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load forms"))
		return
	}

	options, err := dbclient.Client.FormInputOption.GetAllOptionsByGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load forms"))
		return
	}

	apiConfigs, err := dbclient.Client.FormInputApiConfig.GetAllByGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load form API configs"))
		return
	}

	apiHeaders, err := dbclient.Client.FormInputApiHeaders.GetAllByGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load form API headers"))
		return
	}

	data := make([]embeddedForm, len(forms))
	for i, form := range forms {
		formInputs, ok := inputs[form.Id]
		if !ok {
			formInputs = make([]database.FormInput, 0)
		}

		embeddedInputs := make([]embeddedFormInput, len(formInputs))
		for j, input := range formInputs {
			embedded := embeddedFormInput{
				FormInput: input,
				Options:   options[input.Id],
			}

			if apiConfigs != nil {
				if cfg, ok := apiConfigs[input.Id]; ok {
					embedded.ApiConfig = &embeddedApiConfig{
						FormInputApiConfig: cfg,
						Headers:            redactHeaders(apiHeaders[cfg.Id]),
					}
				}
			}

			embeddedInputs[j] = embedded
		}

		data[i] = embeddedForm{
			Form:   form,
			Inputs: embeddedInputs,
		}
	}

	c.JSON(200, data)
}
