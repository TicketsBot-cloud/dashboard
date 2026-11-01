package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/objects/guild/emoji"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
)

type panelMessageData struct {
	ChannelId uint64

	Title, Content, CustomId string
	Colour                   *int
	ImageUrl, ThumbnailUrl   *string
	Emoji                    *emoji.Emoji
	ButtonStyle              component.ButtonStyle
	ButtonLabel              string
	ButtonDisabled           bool
	ShowBranding             bool

	UsesComponentsV2 bool
	Components       []component.Component
}

func marshalComponents(components []component.Component) (*string, error) {
	if components == nil {
		components = []component.Component{}
	}

	raw, err := json.Marshal(components)
	if err != nil {
		return nil, err
	}

	s := string(raw)
	return &s, nil
}

func componentsToStore(usesComponentsV2 bool, tree []component.Component, stored *string) (*string, error) {
	if !usesComponentsV2 {
		return stored, nil
	}

	return marshalComponents(tree)
}

func unmarshalComponents(raw *string) ([]component.Component, error) {
	if raw == nil {
		return nil, nil
	}

	var components []component.Component
	if err := json.Unmarshal([]byte(*raw), &components); err != nil {
		return nil, err
	}

	return components, nil
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
		Colour:         utils.ConvertPtr[int](panel.Colour),
		ImageUrl:       panel.ImageUrl,
		ThumbnailUrl:   panel.ThumbnailUrl,
		Emoji:          emote,
		ButtonStyle:    component.ButtonStyle(panel.ButtonStyle),
		ButtonLabel:    panel.ButtonLabel,
		ButtonDisabled: panel.Disabled,
		ShowBranding:   showBranding,
	}

	if panel.MessageUsesComponentsV2 {
		// Classic would edit a V2 message without its flag, which Discord refuses.
		data.UsesComponentsV2 = true

		components, err := unmarshalComponents(panel.MessageComponents)
		if err != nil {
			log.Logger.Error("Failed to unmarshal panel message components", zap.Int("panel_id", panel.PanelId), zap.Error(err))
		} else {
			data.Components = components
		}
	}

	return data
}

func (p *panelMessageData) buildEmbed() *embed.Embed {
	e := embed.NewEmbed().
		SetTitle(p.Title).
		SetDescription(p.Content).
		SetColorPtr(p.Colour)

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

func (p *panelMessageData) buildEditData() rest.EditMessageData {
	if p.UsesComponentsV2 {
		return v2EditData(append(append([]component.Component{}, p.Components...), p.systemButton()))
	}

	return rest.EditMessageData{
		Embeds:     []*embed.Embed{p.buildEmbed()},
		Components: []component.Component{p.systemButton()},
	}
}

func (p *panelMessageData) edit(c *botcontext.BotContext, messageId uint64) error {
	ctx, cancel := app.DefaultContext()
	defer cancel()

	data := p.buildEditData()

	_, err := rest.EditMessage(ctx, c.Token, c.RateLimiter, p.ChannelId, messageId, data)
	return err
}

// A failed save can leave a V2 message under a Classic row, which only a repost can fix.
func shouldRepost(err error, classicEdit bool, isComponentsV2 func() bool) bool {
	var unwrapped request.RestError
	if !errors.As(err, &unwrapped) {
		return false
	}

	if unwrapped.StatusCode == 404 || unwrapped.StatusCode == 10008 || unwrapped.ApiError.Code == 50005 {
		return true
	}

	return classicEdit && unwrapped.StatusCode == 400 && isComponentsV2()
}

func liveComponentsV2(c *botcontext.BotContext, channelId, messageId uint64) func() bool {
	return func() bool {
		ctx, cancel := app.DefaultContext()
		defer cancel()

		msg, err := rest.GetChannelMessage(ctx, c.Token, c.RateLimiter, channelId, messageId)
		return err == nil && msg.Flags&int(message.FlagComponentsV2) != 0
	}
}

// Uses its own context because the request's may already be cancelled.
func discardMessage(c *botcontext.BotContext, channelId, messageId uint64) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rest.DeleteMessage(ctx, c.Token, c.RateLimiter, channelId, messageId); err != nil {
		log.Logger.Warn("Failed to delete orphaned panel message", zap.Uint64("channel_id", channelId), zap.Uint64("message_id", messageId), zap.Error(err))
	}
}
