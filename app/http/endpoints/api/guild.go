package api

import (
	"github.com/TicketsBot-cloud/common/experiments"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func GuildHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	guild, err := botContext.GetGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch guild information from Discord for guild %d. Please try again."))
		return
	}

	var enabledExperiments []string
	if mgr := experiments.GetGlobalManager(); mgr != nil {
		for _, exp := range experiments.List {
			if mgr.HasFeature(ctx, guildId, exp) {
				enabledExperiments = append(enabledExperiments, string(exp))
			}
		}
	}
	if enabledExperiments == nil {
		enabledExperiments = []string{}
	}

	ctx.JSON(200, gin.H{
		"id":          guild.Id,
		"name":        guild.Name,
		"icon":        guild.Icon,
		"experiments": enabledExperiments,
	})
}
