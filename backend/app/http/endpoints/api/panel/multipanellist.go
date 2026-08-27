package api

import (
	"github.com/gin-gonic/gin"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func MultiPanelList(ctx *gin.Context) {
	type multiPanelResponse struct {
		Id    int     `json:"id"`
		Title *string `json:"title"`
	}

	guildId := ctx.Keys["guildid"].(uint64)

	multiPanels, err := dbclient.Client.MultiPanels.GetByGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load multi-panels. Please try again."))
		return
	}

	data := make([]multiPanelResponse, len(multiPanels))
	for i, multiPanel := range multiPanels {
		var title *string
		if multiPanel.Embed != nil {
			title = multiPanel.Embed.Title
		}

		data[i] = multiPanelResponse{
			Id:    multiPanel.Id,
			Title: title,
		}
	}

	ctx.JSON(200, gin.H{
		"success": true,
		"data":    data,
	})
}
