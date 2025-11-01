package api

import (
	"fmt"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func GetTeams(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	teams, err := dbclient.Client.SupportTeam.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr(fmt.Sprintf("Failed to fetch team from database: %v", err)))
		return
	}

	// prevent serving null
	if teams == nil {
		teams = make([]database.SupportTeam, 0)
	}

	ctx.JSON(200, teams)
}
