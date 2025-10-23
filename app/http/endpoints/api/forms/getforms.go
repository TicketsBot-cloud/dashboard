package forms

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type embeddedFormInput struct {
	database.FormInput
	Options []database.FormInputOption `json:"options"`
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

	data := make([]embeddedForm, len(forms))
	for i, form := range forms {
		formInputs, ok := inputs[form.Id]
		if !ok {
			formInputs = make([]database.FormInput, 0)
		}

		inputs := make([]embeddedFormInput, len(formInputs))
		for j, input := range formInputs {
			inputs[j] = embeddedFormInput{
				FormInput: input,
				Options:   options[input.Id],
			}
		}

		data[i] = embeddedForm{
			Form:   form,
			Inputs: inputs,
		}
	}

	c.JSON(200, data)
}
