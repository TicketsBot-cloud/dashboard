package api

import (
	"fmt"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/gin-gonic/gin"
)

func TagsListHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	tags, err := database.Client.Tag.GetByGuild(ctx, guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, fmt.Sprintf("Failed to fetch tag from database: %v", err)))
		return
	}

	wrapped := make(map[string]tag)
	for id, data := range tags {
		var embed *types.CustomEmbed
		if data.Embed != nil {
			embed = types.NewCustomEmbed(data.Embed.CustomEmbed, data.Embed.Fields)
		}

		wrapped[id] = tag{
			Id:              data.Id,
			UseGuildCommand: data.ApplicationCommandId != nil,
			Content:         data.Content,
			UseEmbed:        data.Embed != nil,
			Embed:           embed,
		}
	}

	ctx.JSON(200, wrapped)
}
