package api

import (
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

const defaultRoleColor = 10070709

func RolesHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	roles, err := botContext.RestCache.GetGuildRoles(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to load roles from Discord. Please try again."))
		return
	}

	for i := range roles {
		if roles[i].Color == 0 {
			roles[i].Color = defaultRoleColor
		}
	}

	ctx.JSON(200, gin.H{
		"success": true,
		"roles":   roles,
	})
}
