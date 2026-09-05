package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

func MultiPanelGet(ctx *gin.Context) {
	type panelConfiguration struct {
		PanelId         int     `json:"panel_id"`
		CustomLabel     *string `json:"custom_label,omitempty"`
		Description     *string `json:"description,omitempty"`
		CustomEmojiName *string `json:"custom_emoji_name,omitempty"`
		CustomEmojiId   *uint64 `json:"custom_emoji_id,omitempty,string"`
	}

	type multiPanelResponse struct {
		Id                    int                  `json:"id"`
		MessageId             uint64               `json:"message_id,string"`
		ChannelId             uint64               `json:"channel_id,string"`
		GuildId               uint64               `json:"guild_id,string"`
		SelectMenu            bool                 `json:"select_menu"`
		SelectMenuPlaceholder *string              `json:"select_menu_placeholder"`
		Embed                 *types.CustomEmbed   `json:"embed"`
		Panels                []panelConfiguration `json:"panels"`
	}

	guildId := ctx.Keys["guildid"].(uint64)

	multiPanelId, err := strconv.Atoi(ctx.Param("panelid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid multi-panel ID"))
		return
	}

	multiPanel, ok, err := dbclient.Client.MultiPanels.Get(ctx, multiPanelId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load multi-panel"))
		return
	}

	if !ok {
		ctx.JSON(404, utils.ErrorStr("Multi-panel not found"))
		return
	}

	if multiPanel.GuildId != guildId {
		ctx.JSON(404, utils.ErrorStr("Multi-panel not found"))
		return
	}

	var transformedEmbed *types.CustomEmbed
	if multiPanel.Embed != nil && multiPanel.Embed.CustomEmbed != nil {
		transformedEmbed = types.NewCustomEmbed(multiPanel.Embed.CustomEmbed, multiPanel.Embed.Fields)
	} else {
		transformedEmbed = &types.CustomEmbed{Colour: 0x5865f2}
	}

	panels, err := dbclient.Client.MultiPanelTargets.GetPanels(ctx, multiPanelId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load multi-panel"))
		return
	}

	configs := make([]panelConfiguration, len(panels))
	for i, panel := range panels {
		configs[i] = panelConfiguration{
			PanelId:         panel.PanelId,
			CustomLabel:     panel.CustomLabel,
			Description:     panel.Description,
			CustomEmojiName: panel.CustomEmojiName,
			CustomEmojiId:   panel.CustomEmojiId,
		}
	}

	ctx.JSON(200, gin.H{
		"data": multiPanelResponse{
			Id:                    multiPanel.Id,
			MessageId:             multiPanel.MessageId,
			ChannelId:             multiPanel.ChannelId,
			GuildId:               multiPanel.GuildId,
			SelectMenu:            multiPanel.SelectMenu,
			SelectMenuPlaceholder: multiPanel.SelectMenuPlaceholder,
			Embed:                 transformedEmbed,
			Panels:                configs,
		},
	})
}
