package api

import (
	"context"
	"fmt"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/utils"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
	"go.uber.org/zap"
)

type multiPanelMessageData struct {
	Footer footerPolicy

	ChannelId uint64

	SelectMenu            bool
	SelectMenuPlaceholder *string

	Embed *embed.Embed

	UsesComponentsV2 bool
	Components       []component.Component
}

func (d *multiPanelMessageData) applyFooter() {
	if d.Footer.ShowBranding {
		d.Embed.SetFooter(fmt.Sprintf("Powered by %s", config.Conf.Bot.PoweredBy), config.Conf.Bot.IconUrl)
	} else if !d.Footer.AllowCustom {
		d.Embed.Footer = nil
	}
}

func multiPanelDiscordSubPanelError(action, detail string) string {
	return fmt.Sprintf(
		"Failed to %s multi-panel message. One of the included panels may be misconfigured: %s",
		action,
		detail,
	)
}

func multiPanelIntoMessageData(panel database.MultiPanel, footer footerPolicy) multiPanelMessageData {
	data := multiPanelMessageData{
		Footer: footer,

		ChannelId: panel.ChannelId,

		SelectMenu:            panel.SelectMenu,
		SelectMenuPlaceholder: panel.SelectMenuPlaceholder,
	}

	if panel.UsesComponentsV2 {
		// A corrupt tree renders as an empty one. Falling back to Classic would send an
		// edit without the V2 flag to a message that has it, which Discord refuses.
		data.UsesComponentsV2 = true

		components, err := unmarshalComponents(panel.Components)
		if err != nil {
			log.Logger.Error("Failed to unmarshal multi-panel components; rendering an empty tree", zap.Int("multi_panel_id", panel.Id), zap.Error(err))
		} else {
			data.Components = components
		}
	}

	if !data.UsesComponentsV2 {
		custom := &types.CustomEmbed{Colour: 0x5865f2}
		if panel.Embed != nil && panel.Embed.CustomEmbed != nil {
			custom = types.NewCustomEmbed(panel.Embed.CustomEmbed, panel.Embed.Fields)
		}
		data.Embed = custom.IntoDiscordEmbed()
	}

	return data
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

func getEffectiveEmojiAnimated(panel database.Panel, customEmojiName *string, customEmojiId *uint64) bool {
	// Custom emoji overrides don't store the animated flag; only panel-native emoji does
	if customEmojiName != nil && *customEmojiName != "" {
		return false
	}
	return panel.EmojiAnimated
}

// effectiveDescription treats a non-nil pointer to an empty string as "no description".
// The dashboard always submits this field as a string (never omitting it), so an admin who
// leaves a panel's description blank still produces a non-nil *string pointing at "". Discord
// rejects a select option whose description field is present but empty, so this must never be
// passed through as-is.
func effectiveDescription(description *string) *string {
	if description != nil && *description == "" {
		return nil
	}
	return description
}

func buildPanelSelectOptions(panels []database.PanelWithCustomization) []component.SelectOption {
	options := make([]component.SelectOption, len(panels))
	for i, pwc := range panels {
		effectiveEmojiName := getEffectiveEmoji(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
		effectiveEmojiId := getEffectiveEmojiId(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
		effectiveEmojiAnimated := getEffectiveEmojiAnimated(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
		emoji := types.NewEmoji(effectiveEmojiName, effectiveEmojiId, effectiveEmojiAnimated).IntoGdl()

		options[i] = component.SelectOption{
			Label:       getEffectiveLabel(pwc.Panel, pwc.CustomLabel),
			Value:       pwc.CustomId,
			Description: effectiveDescription(pwc.Description),
			Emoji:       emoji,
		}
	}

	return options
}

// buildPanelDropdown is the single builder for the dropdown, whether it is appended
// by the system or placed inside the authored tree.
func (d *multiPanelMessageData) buildPanelDropdown(panels []database.PanelWithCustomization) component.Component {
	placeholder := "Select a topic..."
	if d.SelectMenuPlaceholder != nil {
		placeholder = *d.SelectMenuPlaceholder
	}

	return component.BuildSelectMenu(component.SelectMenu{
		CustomId:    panelDropdownCustomId,
		Options:     buildPanelSelectOptions(panels),
		Placeholder: placeholder,
		MinValues:   utils.IntPtr(1),
		MaxValues:   utils.IntPtr(1),
	})
}

// buildSystemRows builds the dropdown row or the button rows for the given panels.
func (d *multiPanelMessageData) buildSystemRows(panels []database.PanelWithCustomization) []component.Component {
	if len(panels) == 0 {
		return nil
	}

	if d.SelectMenu {
		return []component.Component{component.BuildActionRow(d.buildPanelDropdown(panels))}
	}

	var rows []component.Component
	for start := 0; start < len(panels); start += maxActionRowChildren {
		end := min(start+maxActionRowChildren, len(panels))

		buttons := make([]component.Component, 0, end-start)
		for _, pwc := range panels[start:end] {
			buttons = append(buttons, component.BuildButton(buildResolvedPanelButton(pwc)))
		}

		rows = append(rows, component.BuildActionRow(buttons...))
	}

	return rows
}

// buildComponents returns the components to send. For a Components V2 message that is the
// authored tree with panel placements resolved into real buttons and dropdown, plus the
// system rows for every panel the tree does not place. Nothing unresolved survives: a
// placement whose panel is no longer in the multi-panel, or any node that is not a
// recognised safe component, is dropped, so a "panel:" marker can never reach Discord.
func (d *multiPanelMessageData) buildComponents(panels []database.PanelWithCustomization) (tree, system []component.Component) {
	if !d.UsesComponentsV2 {
		return nil, d.buildSystemRows(panels)
	}

	byId := make(map[int]database.PanelWithCustomization, len(panels))
	for _, pwc := range panels {
		byId[pwc.PanelId] = pwc
	}

	placed := make(map[int]bool)
	tree = mapComponentTree(d.Components, func(c component.Component) (component.Component, bool) {
		switch data := c.ComponentData.(type) {
		case component.Button:
			if data.CustomId == "" {
				return c, isResolvableLinkButton(data)
			}

			panelId, ok := parsePanelPlacement(data.CustomId)
			if !ok || data.Url != nil || placed[panelId] {
				return component.Component{}, false
			}

			pwc, ok := byId[panelId]
			if !ok {
				return component.Component{}, false
			}

			placed[panelId] = true
			return component.BuildButton(buildResolvedPanelButton(pwc)), true
		case component.SelectMenu:
			return c, d.SelectMenu && data.CustomId == panelDropdownCustomId
		case component.TextDisplay, component.MediaGallery, component.Separator, component.Thumbnail:
			return c, true
		default:
			return component.Component{}, false
		}
	})

	unplaced := make([]database.PanelWithCustomization, 0, len(panels))
	for _, pwc := range panels {
		if !placed[pwc.PanelId] {
			unplaced = append(unplaced, pwc)
		}
	}

	dropdownPlaced := false
	tree = mapComponentTree(tree, func(c component.Component) (component.Component, bool) {
		if _, ok := c.ComponentData.(component.SelectMenu); !ok {
			return c, true
		}

		if dropdownPlaced || len(unplaced) == 0 {
			return component.Component{}, false
		}

		dropdownPlaced = true
		return d.buildPanelDropdown(unplaced), true
	})

	if dropdownPlaced {
		return tree, nil
	}

	return tree, d.buildSystemRows(unplaced)
}

func isResolvableLinkButton(b component.Button) bool {
	return b.Style == component.ButtonStyleLink && b.Url != nil && *b.Url != ""
}

// mapComponentTree rebuilds a tree bottom-up, passing every leaf (anything that is not a
// container, section or action row) through fn. A leaf fn rejects is dropped, and so is any
// parent left unable to render without it: an action row or container with no children, and
// a section with no text or no accessory.
func mapComponentTree(nodes []component.Component, fn func(component.Component) (component.Component, bool)) []component.Component {
	out := make([]component.Component, 0, len(nodes))

	for _, c := range nodes {
		switch data := c.ComponentData.(type) {
		case component.Container:
			data.Components = mapComponentTree(data.Components, fn)
			if len(data.Components) == 0 {
				continue
			}

			c.ComponentData = data
		case component.Section:
			accessory, ok := fn(data.Accessory)
			if !ok {
				continue
			}

			data.Components = mapComponentTree(data.Components, fn)
			if len(data.Components) == 0 {
				continue
			}

			data.Accessory = accessory
			c.ComponentData = data
		case component.ActionRow:
			data.Components = mapComponentTree(data.Components, fn)
			if len(data.Components) == 0 {
				continue
			}

			c.ComponentData = data
		default:
			resolved, ok := fn(c)
			if !ok {
				continue
			}

			c = resolved
		}

		out = append(out, c)
	}

	return out
}

func (d *multiPanelMessageData) send(ctx *botcontext.BotContext, panels []database.PanelWithCustomization) (uint64, error) {
	tree, system := d.buildComponents(panels)

	var data rest.CreateMessageData
	if d.UsesComponentsV2 {
		data = rest.CreateMessageData{
			Flags:      message.SumFlags(message.FlagComponentsV2),
			Components: append(tree, system...),
		}
	} else {
		d.applyFooter()
		data = rest.CreateMessageData{
			Embeds:     []*embed.Embed{d.Embed},
			Components: system,
		}
	}

	// TODO: Use proper context
	msg, err := rest.CreateMessage(context.Background(), ctx.Token, ctx.RateLimiter, d.ChannelId, data)
	if err != nil {
		return 0, err
	}

	return msg.Id, nil
}

func (d *multiPanelMessageData) buildEditData(components []component.Component) rest.EditMessageData {
	if d.UsesComponentsV2 {
		return v2EditData(components)
	}

	d.applyFooter()
	return rest.EditMessageData{
		Embeds:     []*embed.Embed{d.Embed},
		Components: components,
	}
}

// v2EditData is sent for every Components V2 edit. IS_COMPONENTS_V2 can be set but never
// removed, and an edit that omits flags is validated as a classic message. Embeds must be
// empty on a V2 message, and without allowed_mentions Discord re-parses mentions with its
// default allowances.
func v2EditData(components []component.Component) rest.EditMessageData {
	return rest.EditMessageData{
		Embeds:          []*embed.Embed{},
		Flags:           message.SumFlags(message.FlagComponentsV2),
		Components:      components,
		AllowedMentions: &message.AllowedMention{},
	}
}

func (d *multiPanelMessageData) edit(ctx *botcontext.BotContext, messageId uint64, panels []database.PanelWithCustomization) error {
	tree, system := d.buildComponents(panels)
	data := d.buildEditData(append(tree, system...))

	_, err := rest.EditMessage(context.Background(), ctx.Token, ctx.RateLimiter, d.ChannelId, messageId, data)
	return err
}

// buildResolvedPanelButton builds a panel's button from its own resolved defaults, ignoring
// anything the client sent on a placement node.
func buildResolvedPanelButton(pwc database.PanelWithCustomization) component.Button {
	effectiveEmojiName := getEffectiveEmoji(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
	effectiveEmojiId := getEffectiveEmojiId(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
	effectiveEmojiAnimated := getEffectiveEmojiAnimated(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
	emoji := types.NewEmoji(effectiveEmojiName, effectiveEmojiId, effectiveEmojiAnimated).IntoGdl()

	return component.Button{
		Label:    getEffectiveLabel(pwc.Panel, pwc.CustomLabel),
		CustomId: pwc.CustomId,
		Style:    component.ButtonStyle(pwc.ButtonStyle),
		Emoji:    emoji,
		Disabled: pwc.Disabled,
	}
}
