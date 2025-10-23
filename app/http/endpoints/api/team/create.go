package api

import (
	"fmt"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func CreateTeam(ctx *gin.Context) {
	type body struct {
		Name string `json:"name"`
	}

	guildId := ctx.Keys["guildid"].(uint64)

	var data body
	if err := ctx.ShouldBindJSON(&data); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if len(data.Name) == 0 || len(data.Name) > 32 {
		ctx.JSON(400, utils.ErrorStr("Team name must be between 1 and 32 characters"))
		return
	}

	_, exists, err := dbclient.Client.SupportTeam.GetByName(ctx, guildId, data.Name)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr(fmt.Sprintf("Failed to fetch team from database: %v", err)))
		return
	}

	if exists {
		ctx.JSON(400, utils.ErrorStr("Team already exists"))
		return
	}

	id, err := dbclient.Client.SupportTeam.Create(ctx, guildId, data.Name)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to create team. Please try again."))
		return
	}

	ctx.JSON(200, database.SupportTeam{
		Id:      id,
		GuildId: guildId,
		Name:    data.Name,
	})
}
