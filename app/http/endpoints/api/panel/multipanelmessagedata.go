package api

import (
	"context"
	"math"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
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

func (d *multiPanelMessageData) send(ctx *botcontext.BotContext, panels []database.Panel) (uint64, error) {
	if !d.IsPremium {
		// TODO: Don't harcode
		d.Embed.SetFooter("Powered by ticketsbot.cloud", "https://ticketsbot.cloud/assets/img/logo.png")
	}

	var components []component.Component
	if d.SelectMenu {
		options := make([]component.SelectOption, len(panels))
		for i, panel := range panels {
			emoji := types.NewEmoji(panel.EmojiName, panel.EmojiId).IntoGdl()

			options[i] = component.SelectOption{
				Label: panel.ButtonLabel,
				Value: panel.CustomId,
				Emoji: emoji,
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
		for i, panel := range panels {
			emoji := types.NewEmoji(panel.EmojiName, panel.EmojiId).IntoGdl()

			buttons[i] = component.BuildButton(component.Button{
				Label:    panel.ButtonLabel,
				CustomId: panel.CustomId,
				Style:    component.ButtonStyle(panel.ButtonStyle),
				Emoji:    emoji,
				Disabled: panel.Disabled,
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
