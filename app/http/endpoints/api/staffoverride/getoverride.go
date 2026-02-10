package api

import (
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/gin-gonic/gin"
)

func GetOverrideHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	hasOverride, err := database.Client.StaffOverride.HasActiveOverride(ctx, guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load staff overrides. Please try again."))
		return
	}

	ctx.JSON(200, gin.H{
		"has_override": hasOverride,
	})
}
