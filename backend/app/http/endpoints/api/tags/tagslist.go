package api

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

func TagsListHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	tags, err := database.Client.Tag.GetByGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr(fmt.Sprintf("Failed to fetch tag from database: %v", err)))
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
			KBArticleId:     data.KBArticleId,
		}
	}

	ctx.JSON(200, wrapped)
}
