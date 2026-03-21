package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/gin-gonic/gin"
)

func ListPanels(c *gin.Context) {
	type panelResponse struct {
		PanelId        int     `json:"panel_id"`
		ChannelId      uint64  `json:"channel_id,string"`
		Title          string  `json:"title"`
		Colour         int32   `json:"colour"`
		ButtonLabel    string  `json:"button_label"`
		ButtonStyle    int     `json:"button_style,string"`
		EmojiName      *string `json:"emoji_name,omitempty"`
		EmojiId        *uint64 `json:"emoji_id,omitempty,string"`
		UseCustomEmoji bool    `json:"use_custom_emoji"`
		Emote          *string `json:"emote,omitempty"`
	}

	guildId := c.Keys["guildid"].(uint64)

	panels, err := dbclient.Client.Panel.GetByGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panels"))
		return
	}

	wrapped := make([]panelResponse, len(panels))
	for i, p := range panels {
		wrapped[i] = panelResponse{
			PanelId:        p.PanelId,
			ChannelId:      p.ChannelId,
			Title:          p.Title,
			Colour:         p.Colour,
			ButtonLabel:    p.ButtonLabel,
			ButtonStyle:    p.ButtonStyle,
			EmojiName:      p.EmojiName,
			EmojiId:        p.EmojiId,
			UseCustomEmoji: p.EmojiId != nil,
			Emote:          p.EmojiName,
		}
	}

	c.JSON(200, wrapped)
}
