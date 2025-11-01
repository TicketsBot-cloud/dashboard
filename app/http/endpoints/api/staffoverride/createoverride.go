package api

import (
	"fmt"
	"time"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

type createOverrideBody struct {
	TimePeriod int `json:"time_period"`
}

func CreateOverrideHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	var body createOverrideBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request body: malformed JSON"))
		fmt.Println(err.Error())
		return
	}

	expires := time.Now().Add(time.Hour * time.Duration(body.TimePeriod))
	if err := database.Client.StaffOverride.Set(ctx, guildId, expires); err != nil {
		ctx.JSON(500, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	ctx.Status(204)
}
