package api

import (
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/gin-gonic/gin"
)

func GuildHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	guild, err := botContext.GetGuild(ctx, guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to fetch guild information from Discord for guild %d. Please try again."))
		return
	}

	ctx.JSON(200, gin.H{
		"id":   guild.Id,
		"name": guild.Name,
		"icon": guild.Icon,
	})
}
