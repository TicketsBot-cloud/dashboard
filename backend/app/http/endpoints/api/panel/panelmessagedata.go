package api

import (
	"encoding/json"
	"fmt"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/objects/guild/emoji"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"go.uber.org/zap"
)

type panelMessageData struct {
	ChannelId uint64

	Title, Content, CustomId string
	Colour                   int
	ImageUrl, ThumbnailUrl   *string
	Emoji                    *emoji.Emoji
	ButtonStyle              component.ButtonStyle
	ButtonLabel              string
	ButtonDisabled           bool
	ShowBranding             bool

	// UsesComponentsV2 switches send()/edit() from the classic embed builder to the
	// Components V2 tree in Components, with the system open-ticket button appended.
	UsesComponentsV2 bool
	Components       []component.Component
}

// marshalComponents serialises a guild-authored component tree for JSONB storage.
// An empty/nil tree is stored as NULL rather than "[]", matching the nullable column.
func marshalComponents(components []component.Component) (*string, error) {
	if len(components) == 0 {
		return nil, nil
	}

	raw, err := json.Marshal(components)
	if err != nil {
		return nil, err
	}

	s := string(raw)
	return &s, nil
}

func panelIntoMessageData(panel database.Panel, showBranding bool) panelMessageData {
	var emote *emoji.Emoji
	if panel.EmojiName != nil { // No emoji = nil
		if panel.EmojiId == nil { // Unicode emoji
			emote = &emoji.Emoji{
				Name: *panel.EmojiName,
			}
		} else { // Custom emoji
			emote = &emoji.Emoji{
				Id:   objects.NewNullableSnowflake(*panel.EmojiId),
				Name: *panel.EmojiName,
			}
		}
	}

	data := panelMessageData{
		ChannelId:      panel.ChannelId,
		Title:          panel.Title,
		Content:        panel.Content,
		CustomId:       panel.CustomId,
		Colour:         int(panel.Colour),
		ImageUrl:       panel.ImageUrl,
		ThumbnailUrl:   panel.ThumbnailUrl,
		Emoji:          emote,
		ButtonStyle:    component.ButtonStyle(panel.ButtonStyle),
		ButtonLabel:    panel.ButtonLabel,
		ButtonDisabled: panel.Disabled,
		ShowBranding:   showBranding,
	}

	if panel.MessageUsesComponentsV2 && panel.MessageComponents != nil {
		var components []component.Component
		if err := json.Unmarshal([]byte(*panel.MessageComponents), &components); err != nil {
			// Data was validated and marshalled by us on write, so this should not happen.
			// Fall back to the classic embed rather than sending a broken/empty message.
			log.Logger.Error("Failed to unmarshal panel message components; falling back to classic message", zap.Int("panel_id", panel.PanelId), zap.Error(err))
		} else {
			data.UsesComponentsV2 = true
			data.Components = components
		}
	}

	return data
}

func (p *panelMessageData) buildEmbed() *embed.Embed {
	e := embed.NewEmbed().
		SetTitle(p.Title).
		SetDescription(p.Content).
		SetColor(p.Colour)

	if p.ImageUrl != nil {
		e.SetImage(*p.ImageUrl)
	}

	if p.ThumbnailUrl != nil {
		e.SetThumbnail(*p.ThumbnailUrl)
	}

	if p.ShowBranding {
		e.SetFooter(fmt.Sprintf("Powered by %s", config.Conf.Bot.PoweredBy), config.Conf.Bot.IconUrl)
	}

	return e
}

// systemButton is the open-ticket button the backend always appends, in both
// Classic and Components V2 mode. The guild-authored tree can never contain one.
func (p *panelMessageData) systemButton() component.Component {
	return component.BuildActionRow(component.BuildButton(component.Button{
		Label:    p.ButtonLabel,
		CustomId: p.CustomId,
		Style:    p.ButtonStyle,
		Emoji:    p.Emoji,
		Url:      nil,
		Disabled: p.ButtonDisabled,
	}))
}

func (p *panelMessageData) send(c *botcontext.BotContext) (uint64, error) {
	ctx, cancel := app.DefaultContext()
	defer cancel()

	var data rest.CreateMessageData

	if p.UsesComponentsV2 {
		data = rest.CreateMessageData{
			Flags:      message.SumFlags(message.FlagComponentsV2),
			Components: append(append([]component.Component{}, p.Components...), p.systemButton()),
		}
	} else {
		data = rest.CreateMessageData{
			Embeds:     []*embed.Embed{p.buildEmbed()},
			Components: []component.Component{p.systemButton()},
		}
	}

	msg, err := rest.CreateMessage(ctx, c.Token, c.RateLimiter, p.ChannelId, data)
	if err != nil {
		return 0, err
	}

	return msg.Id, nil
}

// buildEditData constructs the outgoing edit payload. wasAlreadyV2 must reflect
// whether the message already carried the Components V2 flag before this edit:
// Discord's flag is sticky and cannot be unset via edit (panelupdate.go resends
// instead whenever downgrading back to Classic), but the first Classic-to-V2
// transition must clear content/embeds and apply the flag in the same request.
func (p *panelMessageData) buildEditData(wasAlreadyV2 bool) rest.EditMessageData {
	if p.UsesComponentsV2 {
		// Flags must always be set explicitly here, even on an ongoing V2-to-V2 edit:
		// EditMessageData.Flags has no `omitempty` in the pinned gdl version, so leaving
		// it unset would send an explicit "flags":0, which Discord reads as "this message
		// has no flags" and validates Components against Classic (ActionRow-only) rules -
		// producing a components[0] "must be one of (1,)" error despite the flag being
		// sticky server-side. Content/Embeds are safe to leave conditional below, since
		// their "correct" steady-state value in V2 mode is already empty either way.
		data := rest.EditMessageData{
			Flags:      message.SumFlags(message.FlagComponentsV2),
			Components: append(append([]component.Component{}, p.Components...), p.systemButton()),
		}

		if !wasAlreadyV2 {
			data.Content = ""
			data.Embeds = []*embed.Embed{}
		}

		return data
	}

	return rest.EditMessageData{
		Embeds:     []*embed.Embed{p.buildEmbed()},
		Components: []component.Component{p.systemButton()},
	}
}

// edit updates the existing panel message.
func (p *panelMessageData) edit(c *botcontext.BotContext, messageId uint64, wasAlreadyV2 bool) error {
	ctx, cancel := app.DefaultContext()
	defer cancel()

	data := p.buildEditData(wasAlreadyV2)

	_, err := rest.EditMessage(ctx, c.Token, c.RateLimiter, p.ChannelId, messageId, data)
	return err
}
