package api

import (
	"context"
	"fmt"
	"math"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/utils"
)

type multiPanelMessageData struct {
	IsPremium bool

	ChannelId uint64

	SelectMenu            bool
	SelectMenuPlaceholder *string

	Embed *embed.Embed
}

func multiPanelIntoMessageData(panel database.MultiPanel, isPremium bool) multiPanelMessageData {
	return multiPanelMessageData{
		IsPremium: isPremium,

		ChannelId: panel.ChannelId,

		SelectMenu:            panel.SelectMenu,
		SelectMenuPlaceholder: panel.SelectMenuPlaceholder,
		Embed:                 types.NewCustomEmbed(panel.Embed.CustomEmbed, panel.Embed.Fields).IntoDiscordEmbed(),
	}
}

func getEffectiveLabel(panel database.Panel, customLabel *string) string {
	if customLabel != nil && *customLabel != "" {
		return *customLabel
	}
	return panel.ButtonLabel
}

func getEffectiveEmoji(panel database.Panel, customEmojiName *string, customEmojiId *uint64) *string {
	if customEmojiId != nil && *customEmojiId != 0 {
		if customEmojiName != nil && *customEmojiName != "" {
			return customEmojiName
		}
		return nil
	}
	if customEmojiName != nil && *customEmojiName != "" {
		return customEmojiName
	}
	return panel.EmojiName
}

func getEffectiveEmojiId(panel database.Panel, customEmojiName *string, customEmojiId *uint64) *uint64 {
	if customEmojiId != nil && *customEmojiId != 0 {
		return customEmojiId
	}
	if customEmojiName != nil && *customEmojiName != "" {
		return nil
	}
	return panel.EmojiId
}

func (d *multiPanelMessageData) send(ctx *botcontext.BotContext, panels []database.PanelWithCustomization) (uint64, error) {
	if !d.IsPremium {
		d.Embed.SetFooter(fmt.Sprintf("Powered by %s", config.Conf.Bot.PoweredBy), config.Conf.Bot.IconUrl)
	}

	var components []component.Component
	if d.SelectMenu {
		options := make([]component.SelectOption, len(panels))
		for i, pwc := range panels {
			effectiveEmojiName := getEffectiveEmoji(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
			effectiveEmojiId := getEffectiveEmojiId(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
			emoji := types.NewEmoji(effectiveEmojiName, effectiveEmojiId).IntoGdl()

			options[i] = component.SelectOption{
				Label:       getEffectiveLabel(pwc.Panel, pwc.CustomLabel),
				Value:       pwc.CustomId,
				Description: pwc.Description,
				Emoji:       emoji,
			}
		}

		var placeholder string
		if d.SelectMenuPlaceholder == nil {
			placeholder = "Select a topic..."
		} else {
			placeholder = *d.SelectMenuPlaceholder
		}

		components = []component.Component{
			component.BuildActionRow(
				component.BuildSelectMenu(
					component.SelectMenu{
						CustomId:    "multipanel",
						Options:     options,
						Placeholder: placeholder,
						MinValues:   utils.IntPtr(1),
						MaxValues:   utils.IntPtr(1),
						Disabled:    false,
					}),
			),
		}
	} else {
		buttons := make([]component.Component, len(panels))
		for i, pwc := range panels {
			effectiveEmojiName := getEffectiveEmoji(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
			effectiveEmojiId := getEffectiveEmojiId(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
			emoji := types.NewEmoji(effectiveEmojiName, effectiveEmojiId).IntoGdl()

			buttons[i] = component.BuildButton(component.Button{
				Label:    getEffectiveLabel(pwc.Panel, pwc.CustomLabel),
				CustomId: pwc.CustomId,
				Style:    component.ButtonStyle(pwc.ButtonStyle),
				Emoji:    emoji,
				Disabled: pwc.Disabled,
			})
		}

		var rows []component.Component
		for i := 0; i <= int(math.Ceil(float64(len(buttons)/5))); i++ {
			lb := i * 5
			ub := lb + 5

			if ub >= len(buttons) {
				ub = len(buttons)
			}

			if lb >= ub {
				break
			}

			row := component.BuildActionRow(buttons[lb:ub]...)
			rows = append(rows, row)
		}

		components = rows
	}

	data := rest.CreateMessageData{
		Embeds:     []*embed.Embed{d.Embed},
		Components: components,
	}

	// TODO: Use proper context
	msg, err := rest.CreateMessage(context.Background(), ctx.Token, ctx.RateLimiter, d.ChannelId, data)
	if err != nil {
		return 0, err
	}

	return msg.Id, nil
}
