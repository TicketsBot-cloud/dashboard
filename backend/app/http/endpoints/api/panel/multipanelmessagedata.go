package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"

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

	// UsesComponentsV2 switches send()/edit() from the classic embed builder to the
	// Components V2 tree in Components, with the system select-menu/button-rows appended.
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

	if panel.UsesComponentsV2 && panel.Components != nil {
		var components []component.Component
		if err := json.Unmarshal([]byte(*panel.Components), &components); err != nil {
			// Data was validated and marshalled by us on write, so this should not happen.
			// Fall back to the classic embed rather than sending a broken/empty message.
			log.Logger.Error("Failed to unmarshal multi-panel components; falling back to classic message", zap.Int("multi_panel_id", panel.Id), zap.Error(err))
		} else {
			data.UsesComponentsV2 = true
			data.Components = components
		}
	}

	if !data.UsesComponentsV2 && panel.Embed != nil {
		data.Embed = types.NewCustomEmbed(panel.Embed.CustomEmbed, panel.Embed.Fields).IntoDiscordEmbed()
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

// buildPanelSelectOptions builds one SelectOption per panel, shared between the
// system-owned dropdown built here and a panel-select placeholder resolved inside a
// guild-authored tree (see resolveComponentTreePanelRefs).
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

// unplacedPanels filters panels down to those not already referenced by a panel
// placeholder somewhere in d.Components, so buildSystemComponents never duplicates a
// panel that has been placed inside the guild-authored tree. Derived directly from
// d.Components (a validated tree - already carrying panel_id/is_panel_select for a
// Components V2 multi-panel, whether just bound from a request or reconstructed from
// stored JSON by multiPanelIntoMessageData) rather than threaded in as a parameter, so
// every call path - initial send, in-place edit, and the resend/panel-update/panel-delete
// flows that rebuild multiPanelMessageData from stored data - stays correct without each
// caller having to recompute placement itself.
func (d *multiPanelMessageData) unplacedPanels(panels []database.PanelWithCustomization) []database.PanelWithCustomization {
	if !d.UsesComponentsV2 || len(d.Components) == 0 {
		return panels
	}

	placed, hasSelect, err := collectPlacedPanelIds(d.Components)
	if err != nil {
		// A tree that fails this walk should never reach here - it was already validated
		// at save time. Fail safe by treating nothing as placed, rather than dropping
		// every panel from the default row on an unexpected error.
		return panels
	}

	// A placed panel-select node has no PanelId-bearing entries of its own in placed
	// (only Buttons carry a PanelId), but it still absorbs every remaining panel - its
	// options are built from the unplaced subset when resolved, see
	// resolveComponentPanelRef - so the default row has nothing left to show at all.
	if hasSelect {
		return nil
	}

	if len(placed) == 0 {
		return panels
	}

	unplaced := make([]database.PanelWithCustomization, 0, len(panels))
	for _, pwc := range panels {
		if !placed[pwc.PanelId] {
			unplaced = append(unplaced, pwc)
		}
	}

	return unplaced
}

// buildSystemComponents builds the backend-owned select-menu or button-rows that are
// always appended on top of whatever the guild authors, in both Classic and Components
// V2 mode. Any panel already placed inside the guild-authored tree (see unplacedPanels)
// is excluded here, so it never appears twice.
func (d *multiPanelMessageData) buildSystemComponents(panels []database.PanelWithCustomization) []component.Component {
	panels = d.unplacedPanels(panels)
	if len(panels) == 0 {
		return nil
	}

	if d.SelectMenu {
		options := buildPanelSelectOptions(panels)

		var placeholder string
		if d.SelectMenuPlaceholder == nil {
			placeholder = "Select a topic..."
		} else {
			placeholder = *d.SelectMenuPlaceholder
		}

		return []component.Component{
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
	}

	buttons := make([]component.Component, len(panels))
	for i, pwc := range panels {
		effectiveEmojiName := getEffectiveEmoji(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
		effectiveEmojiId := getEffectiveEmojiId(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
		effectiveEmojiAnimated := getEffectiveEmojiAnimated(pwc.Panel, pwc.CustomEmojiName, pwc.CustomEmojiId)
		emoji := types.NewEmoji(effectiveEmojiName, effectiveEmojiId, effectiveEmojiAnimated).IntoGdl()

		buttons[i] = component.BuildButton(component.Button{
			Label:    getEffectiveLabel(pwc.Panel, pwc.CustomLabel),
			CustomId: pwc.CustomId,
			Style:    component.ButtonStyle(pwc.ButtonStyle),
			Emoji:    emoji,
			Disabled: pwc.Disabled,
		})
	}

	var rows []component.Component
	for i := 0; i <= int(math.Ceil(float64(len(buttons))/5)); i++ {
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

	return rows
}

func (d *multiPanelMessageData) send(ctx *botcontext.BotContext, panels []database.PanelWithCustomization) (uint64, error) {
	// buildSystemComponents must run before the tree is resolved: it filters out panels
	// placed inside the tree by reading d.Components (see unplacedPanels), and resolving
	// the tree clears the panel_id/is_panel_select markers it depends on.
	systemComponents := d.buildSystemComponents(panels)

	var data rest.CreateMessageData
	if d.UsesComponentsV2 {
		resolvedComponents := resolveComponentTreePanelRefs(d.Components, panels)
		data = rest.CreateMessageData{
			Flags:      message.SumFlags(message.FlagComponentsV2),
			Components: append(append([]component.Component{}, resolvedComponents...), systemComponents...),
		}
	} else {
		d.applyFooter()
		data = rest.CreateMessageData{
			Embeds:     []*embed.Embed{d.Embed},
			Components: systemComponents,
		}
	}

	// TODO: Use proper context
	msg, err := rest.CreateMessage(context.Background(), ctx.Token, ctx.RateLimiter, d.ChannelId, data)
	if err != nil {
		return 0, err
	}

	return msg.Id, nil
}

// buildEditData constructs the outgoing edit payload. wasAlreadyV2 must reflect whether the
// message already carried the Components V2 flag before this edit - see the equivalent
// note on panelMessageData.buildEditData for why this matters. resolvedComponents must be
// d.Components already run through resolveComponentTreePanelRefs - see the call in edit().
func (d *multiPanelMessageData) buildEditData(resolvedComponents, systemComponents []component.Component, wasAlreadyV2 bool) rest.EditMessageData {
	if d.UsesComponentsV2 {
		// Flags must always be set explicitly here, even on an ongoing V2-to-V2 edit -
		// see the identical note on panelMessageData.buildEditData for why (EditMessageData.Flags
		// has no `omitempty` in the pinned gdl version, so an unset Flags sends an
		// explicit "flags":0 and Discord validates Components against Classic rules).
		data := rest.EditMessageData{
			Flags:      message.SumFlags(message.FlagComponentsV2),
			Components: append(append([]component.Component{}, resolvedComponents...), systemComponents...),
		}

		if !wasAlreadyV2 {
			data.Content = ""
			data.Embeds = []*embed.Embed{}
		}

		return data
	}

	d.applyFooter()
	return rest.EditMessageData{
		Embeds:     []*embed.Embed{d.Embed},
		Components: systemComponents,
	}
}

// edit updates the existing multi-panel message.
func (d *multiPanelMessageData) edit(ctx *botcontext.BotContext, messageId uint64, panels []database.PanelWithCustomization, wasAlreadyV2 bool) error {
	// buildSystemComponents must run before the tree is resolved - see the identical note
	// in send().
	systemComponents := d.buildSystemComponents(panels)
	resolvedComponents := resolveComponentTreePanelRefs(d.Components, panels)
	data := d.buildEditData(resolvedComponents, systemComponents, wasAlreadyV2)

	_, err := rest.EditMessage(context.Background(), ctx.Token, ctx.RateLimiter, d.ChannelId, messageId, data)
	return err
}

// resolveComponentTreePanelRefs walks a guild-authored Components V2 tree and replaces
// every panel placeholder - a Button carrying PanelId, or the single SelectMenu carrying
// IsPanelSelect - with a real component built from the referenced panel(s), clearing the
// placeholder markers on the output. A node that doesn't reference a panel is returned
// unchanged.
//
// This must never be the value written back to storage: whatever the caller persists
// must remain the pre-resolve tree, still carrying panel_id/is_panel_select, so a saved
// multi-panel doesn't lose the "this opens panel X" placement information the next time
// it's edited in the dashboard. marshalComponents in multipanelcreate.go/
// multipanelupdate.go always marshals data.Components (the request body) for that
// reason, never this function's return value.
//
// A placeholder whose panel is no longer present in panels - for example the referenced
// panel was deleted from the guild via a path outside this multi-panel's own create/
// update flow, such as paneldelete.go rebuilding every multi-panel that targeted it - is
// dropped rather than sent to Discord half-formed: a button with no custom_id and no URL
// is not a valid Discord component, and a Section can't be sent without its accessory.
func resolveComponentTreePanelRefs(tree []component.Component, panels []database.PanelWithCustomization) []component.Component {
	placed, _, err := collectPlacedPanelIds(tree)
	if err != nil {
		// A tree that fails this walk should never reach here - it was already validated
		// at save time. Fail safe by treating nothing as placed.
		placed = nil
	}

	unplaced := make([]database.PanelWithCustomization, 0, len(panels))
	for _, pwc := range panels {
		if !placed[pwc.PanelId] {
			unplaced = append(unplaced, pwc)
		}
	}

	return resolveComponentSlice(tree, panels, unplaced)
}

func resolveComponentSlice(tree []component.Component, panels, unplaced []database.PanelWithCustomization) []component.Component {
	resolved := make([]component.Component, 0, len(tree))

	for _, c := range tree {
		if rc, ok := resolveComponentPanelRef(c, panels, unplaced); ok {
			resolved = append(resolved, rc)
		}
	}

	return resolved
}

// resolveComponentPanelRef resolves a single node. The bool return reports whether the
// node should be kept by its parent - false for a placeholder whose panel no longer
// exists, so the caller can drop it instead of emitting an invalid payload.
func resolveComponentPanelRef(c component.Component, panels, unplaced []database.PanelWithCustomization) (component.Component, bool) {
	switch c.Type {
	case component.ComponentContainer:
		container, ok := c.ComponentData.(component.Container)
		if !ok {
			return c, true
		}

		container.Components = resolveComponentSlice(container.Components, panels, unplaced)
		c.ComponentData = container
		return c, true
	case component.ComponentSection:
		section, ok := c.ComponentData.(component.Section)
		if !ok {
			return c, true
		}

		section.Components = resolveComponentSlice(section.Components, panels, unplaced)

		resolvedAccessory, ok := resolveComponentPanelRef(section.Accessory, panels, unplaced)
		if !ok {
			// The accessory referenced a panel that no longer exists: a section can't be
			// sent without one, so drop the whole section.
			return component.Component{}, false
		}

		section.Accessory = resolvedAccessory
		c.ComponentData = section
		return c, true
	case component.ComponentActionRow:
		row, ok := c.ComponentData.(component.ActionRow)
		if !ok {
			return c, true
		}

		row.Components = resolveComponentSlice(row.Components, panels, unplaced)
		if len(row.Components) == 0 {
			// Every button in this row referenced a panel that no longer exists.
			return component.Component{}, false
		}

		c.ComponentData = row
		return c, true
	case component.ComponentButton:
		button, ok := c.ComponentData.(component.Button)
		if !ok || button.PanelId == nil {
			return c, true
		}

		pwc := findPanelById(panels, *button.PanelId)
		if pwc == nil {
			return component.Component{}, false
		}

		return component.BuildButton(buildResolvedPanelButton(*pwc)), true
	case component.ComponentSelectMenu:
		sm, ok := c.ComponentData.(component.SelectMenu)
		if !ok || !sm.IsPanelSelect {
			return c, true
		}

		if len(unplaced) == 0 {
			// Every panel this dropdown would have listed is gone (for example the last
			// unplaced panel was deleted from the guild via paneldelete.go after this
			// placement was saved). Discord rejects a select menu with zero options, so
			// drop the node rather than send a broken payload; the parent action row then
			// drops too via its own len(row.Components) == 0 check.
			return component.Component{}, false
		}

		return component.BuildSelectMenu(component.SelectMenu{
			CustomId:    "multipanel",
			Options:     buildPanelSelectOptions(unplaced),
			Placeholder: sm.Placeholder,
			MinValues:   utils.IntPtr(1),
			MaxValues:   utils.IntPtr(1),
			Disabled:    false,
		}), true
	default:
		return c, true
	}
}

// findPanelById looks a panel up by its real panel ID rather than slice position:
// panels is index-aligned with the request body in the handlers that build it, but
// resolveComponentTreePanelRefs walks the guild-authored tree in tree order, not panel
// order.
func findPanelById(panels []database.PanelWithCustomization, panelId int) *database.PanelWithCustomization {
	for i := range panels {
		if panels[i].PanelId == panelId {
			return &panels[i]
		}
	}

	return nil
}

// buildResolvedPanelButton rebuilds a full Button from a panel's own resolved defaults -
// the same Label/Emoji/Style/Disabled buildSystemComponents would use for this panel in
// the default row - discarding anything else the client sent on the placeholder node.
// PanelId is left unset on the output, so it never leaks into the outbound Discord
// payload.
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
