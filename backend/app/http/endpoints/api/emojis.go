package api

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func EmojisHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	// TODO: Use proper context
	emojis, err := botContext.GetGuildEmojis(context.Background(), guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	ctx.JSON(200, emojis)
}
