package api

import (
	"github.com/gin-gonic/gin"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func MultiPanelList(ctx *gin.Context) {
	type multiPanelResponse struct {
		Id            int     `json:"id"`
		Name          string  `json:"name"`
		Title         *string `json:"title"`
		ForceDisabled bool    `json:"force_disabled"`
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
		} else if multiPanel.UsesComponentsV2 {
			// A Components V2 message has no embed title to fall back on.
			t := "Components V2 message"
			title = &t
		}

		// Name is the dashboard-only label and takes priority; Title is the classic
		// embed title, which doubled as the list label before Name existed, and
		// still does for any multi-panel created before this field was introduced.
		displayName := "Untitled multi-panel"
		if title != nil && *title != "" {
			displayName = *title
		}
		if multiPanel.Name != nil && *multiPanel.Name != "" {
			displayName = *multiPanel.Name
		}

		data[i] = multiPanelResponse{
			Id:            multiPanel.Id,
			Name:          displayName,
			Title:         title,
			ForceDisabled: multiPanel.ForceDisabled,
		}
	}

	ctx.JSON(200, gin.H{
		"success": true,
		"data":    data,
	})
}
