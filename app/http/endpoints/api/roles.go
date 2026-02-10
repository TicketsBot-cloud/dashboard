package api

import (
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/gin-gonic/gin"
)

func RolesHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	roles, err := botContext.RestCache.GetGuildRoles(guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Unable to load roles from Discord. Please try again."))
		return
	}

	ctx.JSON(200, gin.H{
		"success": true,
		"roles":   roles,
	})
}
