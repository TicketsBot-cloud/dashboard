package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

func ListPanels(c *gin.Context) {
	type panelResponse struct {
		PanelId           int     `json:"panel_id"`
		ChannelId         uint64  `json:"channel_id,string"`
		Title             string  `json:"title"`
		Colour            int32   `json:"colour"`
		ButtonLabel       string  `json:"button_label"`
		ButtonStyle       int     `json:"button_style,string"`
		EmojiName         *string `json:"emoji_name,omitempty"`
		EmojiId           *uint64 `json:"emoji_id,omitempty,string"`
		UseCustomEmoji    bool    `json:"use_custom_emoji"`
		Emote             *string `json:"emote,omitempty"`
		HasSupportHours   bool    `json:"has_support_hours"`
		IsCurrentlyActive bool    `json:"is_currently_active"`
	}

	guildId := c.Keys["guildid"].(uint64)

	var panels []database.Panel
	var activePanelIds []int

	g, ctx := errgroup.WithContext(c)

	g.Go(func() error {
		var err error
		panels, err = dbclient.Client.Panel.GetByGuild(ctx, guildId)
		return err
	})

	g.Go(func() error {
		var err error
		activePanelIds, err = dbclient.Client.PanelSupportHours.GetActivePanels(ctx, guildId)
		return err
	})

	if err := g.Wait(); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panels"))
		return
	}

	activeSet := make(map[int]bool, len(activePanelIds))
	for _, id := range activePanelIds {
		activeSet[id] = true
	}

	// Check which panels have support hours configured
	supportHoursSet := make(map[int]bool)
	for _, p := range panels {
		has, err := dbclient.Client.PanelSupportHours.HasSupportHours(c, p.PanelId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel support hours"))
			return
		}
		if has {
			supportHoursSet[p.PanelId] = true
		}
	}

	wrapped := make([]panelResponse, len(panels))
	for i, p := range panels {
		hasSH := supportHoursSet[p.PanelId]
		wrapped[i] = panelResponse{
			PanelId:           p.PanelId,
			ChannelId:         p.ChannelId,
			Title:             p.Title,
			Colour:            p.Colour,
			ButtonLabel:       p.ButtonLabel,
			ButtonStyle:       p.ButtonStyle,
			EmojiName:         p.EmojiName,
			EmojiId:           p.EmojiId,
			UseCustomEmoji:    p.EmojiId != nil,
			Emote:             p.EmojiName,
			HasSupportHours:   hasSH,
			IsCurrentlyActive: !hasSH || activeSet[p.PanelId],
		}
	}

	c.JSON(200, wrapped)
}
