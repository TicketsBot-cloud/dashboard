package api

import (
	"context"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

func MultiPanelList(ctx *gin.Context) {
	type multiPanelResponse struct {
		Id                    int                `json:"id"`
		MessageId             uint64             `json:"message_id,string"`
		ChannelId             uint64             `json:"channel_id,string"`
		GuildId               uint64             `json:"guild_id,string"`
		SelectMenu            bool               `json:"select_menu"`
		SelectMenuPlaceholder *string            `json:"select_menu_placeholder"`
		Embed                 *types.CustomEmbed `json:"embed"`
		Panels                []int              `json:"panels"`
	}

	guildId := ctx.Keys["guildid"].(uint64)

	multiPanels, err := dbclient.Client.MultiPanels.GetByGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load multi-panels. Please try again."))
		return
	}

	data := make([]multiPanelResponse, len(multiPanels))
	group, _ := errgroup.WithContext(context.Background())
	for i, multiPanel := range multiPanels {
		i := i
		multiPanel := multiPanel

		var transformedEmbed *types.CustomEmbed
		if multiPanel.Embed != nil {
			transformedEmbed = types.NewCustomEmbed(multiPanel.Embed.CustomEmbed, multiPanel.Embed.Fields)
		}

		data[i] = multiPanelResponse{
			Id:                    multiPanel.Id,
			MessageId:             multiPanel.MessageId,
			ChannelId:             multiPanel.ChannelId,
			GuildId:               multiPanel.GuildId,
			SelectMenu:            multiPanel.SelectMenu,
			SelectMenuPlaceholder: multiPanel.SelectMenuPlaceholder,
			Embed:                 transformedEmbed,
		}

		// TODO: Use a join
		group.Go(func() error {
			panels, err := dbclient.Client.MultiPanelTargets.GetPanels(ctx, multiPanel.Id)
			if err != nil {
				return err
			}

			panelIds := make([]int, len(panels))
			for i, panel := range panels {
				panelIds[i] = panel.PanelId
			}

			data[i].Panels = panelIds

			return nil
		})
	}

	if err := group.Wait(); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load multi-panels. Please try again."))
		return
	}

	ctx.JSON(200, gin.H{
		"success": true,
		"data":    data,
	})
}
