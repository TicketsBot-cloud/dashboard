package api

import (
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
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
