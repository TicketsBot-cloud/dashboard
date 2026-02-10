package api

import (
	"context"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/gin-gonic/gin"
)

func EmojisHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	// TODO: Use proper context
	emojis, err := botContext.GetGuildEmojis(context.Background(), guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to process request. Please try again."))
		return
	}

	ctx.JSON(200, emojis)
}
