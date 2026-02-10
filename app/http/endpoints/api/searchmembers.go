package api

import (
	"context"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/gdl/objects/member"
	"github.com/gin-gonic/gin"
)

func SearchMembers(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	query := ctx.Query("query")
	if len(query) > 32 {
		ctx.JSON(400, utils.ErrorStr("Invalid query"))
		return
	}

	var members []member.Member
	if query == "" {
		// TODO: Use proper context
		members, err = botCtx.ListMembers(context.Background(), guildId)
	} else {
		// TODO: Use proper context
		members, err = botCtx.SearchMembers(context.Background(), guildId, query)
	}

	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to process request. Please try again."))
		return
	}

	ctx.JSON(200, members)
}
