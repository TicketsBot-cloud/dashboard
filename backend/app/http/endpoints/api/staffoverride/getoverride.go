package api

import (
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func GetOverrideHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	hasOverride, err := database.Client.StaffOverride.HasActiveOverride(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load staff overrides. Please try again."))
		return
	}

	ctx.JSON(200, gin.H{
		"has_override": hasOverride,
	})
}
