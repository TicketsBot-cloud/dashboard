package api

import (
	"net/url"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/validation"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

const (
	maxAccentColour = 0xFFFFFF

	maxMessageComponents = 40

	// Not in Discord's docs: observed to count only text display content (section text included).
	maxTreeTextLength         = 4000
	maxComponentUrlLength     = 512
	maxMediaDescriptionLength = 1024
	maxButtonLabelLength      = 80
	maxActionRowChildren      = 5
	maxSectionTextDisplays    = 3
	maxGalleryItems           = 10

	// Marks a panel placed in a multi-panel tree; replaced by the real panel button before sending.
	panelPlacementPrefix = "panel:"

	panelDropdownCustomId = "multipanel"

	panelMessageReserved       = 2
	welcomeFormAnswersReserved = 5
	dropdownReserved           = 2
)

type treeRules struct {
	validPanelIds          map[int]bool
	dropdownMode           bool
	reserved               int
	allowAvatarPlaceholder bool
}

type treeValidator struct {
	rules        treeRules
	count        int
	textLength   int
	placed       map[int]bool
	selectPlaced bool
}

type treeResult struct {
	placed       map[int]bool
	dropdownUsed bool
	count        int
}

func validateComponentTree(tree []component.Component, rules treeRules) (treeResult, error) {
	v := &treeValidator{rules: rules, placed: make(map[int]bool)}

	for _, c := range tree {
		if err := v.node(c, false); err != nil {
			return treeResult{}, err
		}
	}

	if v.textLength > maxTreeTextLength {
		return treeResult{}, validation.NewInvalidInputErrorf("Text displays contain %d characters in total (maximum %d)", v.textLength, maxTreeTextLength)
	}

	return treeResult{placed: v.placed, dropdownUsed: v.selectPlaced, count: v.count}, nil
}

func checkComponentBudget(count, reserved int) error {
	limit := maxMessageComponents - reserved
	if count <= limit {
		return nil
	}

	if reserved > 0 {
		return validation.NewInvalidInputErrorf("Too many components: %d (maximum %d, with %d reserved for components added automatically)", count, limit, reserved)
	}

	return validation.NewInvalidInputErrorf("Too many components: %d (maximum %d)", count, limit)
}

func (v *treeValidator) add(n int) error {
	v.count += n
	return checkComponentBudget(v.count, v.rules.reserved)
}

func (v *treeValidator) node(c component.Component, inContainer bool) error {
	if err := v.add(1); err != nil {
		return err
	}

	switch d := c.ComponentData.(type) {
	case component.Container:
		if inContainer {
			return validation.NewInvalidInputError("Container: cannot be placed inside another container")
		}

		if len(d.Components) == 0 {
			return validation.NewInvalidInputError("Container: cannot be empty")
		}

		if d.AccentColor != nil && (*d.AccentColor < 0 || *d.AccentColor > maxAccentColour) {
			return validation.NewInvalidInputErrorf("Container: the accent colour must be between 0 and %d", maxAccentColour)
		}

		for _, child := range d.Components {
			if err := v.node(child, true); err != nil {
				return err
			}
		}

		return nil
	case component.Section:
		return v.section(d)
	case component.TextDisplay:
		return v.textDisplay(d)
	case component.MediaGallery:
		return v.mediaGallery(d)
	case component.Separator:
		if d.Spacing != nil && *d.Spacing != 1 && *d.Spacing != 2 {
			return validation.NewInvalidInputError("Separator: the spacing must be small (1) or large (2)")
		}

		return nil
	case component.ActionRow:
		return v.actionRow(d)
	case component.Thumbnail:
		return validation.NewInvalidInputError("Thumbnail: can only be used as a section's accessory")
	case component.File:
		return validation.NewInvalidInputError("File: not supported")
	case component.Button, component.SelectMenu:
		return validation.NewInvalidInputError("Buttons and dropdowns must be placed inside an action row")
	default:
		return validation.NewInvalidInputError("This message contains a component type that is not allowed")
	}
}

func (v *treeValidator) section(s component.Section) error {
	if len(s.Components) < 1 || len(s.Components) > maxSectionTextDisplays {
		return validation.NewInvalidInputErrorf("Section: needs between 1 and %d text displays", maxSectionTextDisplays)
	}

	for _, child := range s.Components {
		td, ok := child.ComponentData.(component.TextDisplay)
		if !ok {
			return validation.NewInvalidInputError("Section: can only contain text displays")
		}

		if err := v.add(1); err != nil {
			return err
		}

		if err := v.textDisplay(td); err != nil {
			return err
		}
	}

	if err := v.add(1); err != nil {
		return err
	}

	switch accessory := s.Accessory.ComponentData.(type) {
	case component.Thumbnail:
		return v.thumbnail(accessory)
	case component.Button:
		return v.button(accessory)
	case nil:
		return validation.NewInvalidInputError("Section: needs a thumbnail or button accessory")
	default:
		return validation.NewInvalidInputError("Section: the accessory must be a thumbnail or a button")
	}
}

func (v *treeValidator) textDisplay(t component.TextDisplay) error {
	if strings.TrimSpace(t.Content) == "" {
		return validation.NewInvalidInputError("Text display: cannot be blank")
	}

	if strings.ContainsRune(t.Content, 0) {
		return validation.NewInvalidInputError("Text display: cannot contain null characters")
	}

	v.textLength += utf8.RuneCountInString(t.Content)
	return nil
}

func (v *treeValidator) thumbnail(t component.Thumbnail) error {
	if err := v.checkMediaUrl("Thumbnail", t.Media.Url); err != nil {
		return err
	}

	return checkMediaDescription("Thumbnail", t.Description)
}

func (v *treeValidator) mediaGallery(g component.MediaGallery) error {
	if len(g.Items) < 1 || len(g.Items) > maxGalleryItems {
		return validation.NewInvalidInputErrorf("Media gallery: needs between 1 and %d items", maxGalleryItems)
	}

	for _, item := range g.Items {
		if err := v.checkMediaUrl("Media gallery", item.Media.Url); err != nil {
			return err
		}

		if err := checkMediaDescription("Media gallery", item.Description); err != nil {
			return err
		}
	}

	return nil
}

func (v *treeValidator) actionRow(row component.ActionRow) error {
	if len(row.Components) == 0 {
		return validation.NewInvalidInputError("Action row: cannot be empty")
	}

	if len(row.Components) > maxActionRowChildren {
		return validation.NewInvalidInputErrorf("Action row: cannot contain more than %d buttons", maxActionRowChildren)
	}

	if err := v.add(len(row.Components)); err != nil {
		return err
	}

	for _, child := range row.Components {
		switch d := child.ComponentData.(type) {
		case component.Button:
			if err := v.button(d); err != nil {
				return err
			}
		case component.SelectMenu:
			if len(row.Components) != 1 {
				return validation.NewInvalidInputError("Action row: the panel dropdown must be alone in its row")
			}

			if err := v.dropdown(d); err != nil {
				return err
			}
		default:
			return validation.NewInvalidInputError("Action row: can only contain link buttons, panel buttons or the panel dropdown")
		}
	}

	return nil
}

func (v *treeValidator) button(b component.Button) error {
	if b.Url != nil && b.CustomId != "" {
		return validation.NewInvalidInputError("Button: cannot be both a link button and a panel button")
	}

	if b.Url != nil || b.Style == component.ButtonStyleLink {
		return v.linkButton(b)
	}

	panelId, ok := parsePanelPlacement(b.CustomId)
	if !ok {
		return validation.NewInvalidInputError("Button: must be a link button or a panel button")
	}

	if v.rules.validPanelIds == nil {
		return validation.NewInvalidInputError("Panel button: can only be placed in a multi-panel")
	}

	if !v.rules.validPanelIds[panelId] {
		return validation.NewInvalidInputErrorf("Panel button: panel %d is not part of this multi-panel", panelId)
	}

	if v.placed[panelId] {
		return validation.NewInvalidInputErrorf("Panel button: panel %d is placed more than once", panelId)
	}

	v.placed[panelId] = true
	return nil
}

func (v *treeValidator) linkButton(b component.Button) error {
	if b.Style != component.ButtonStyleLink || b.Url == nil {
		return validation.NewInvalidInputError("Link button: needs the link style and a URL")
	}

	if b.SkuId != nil {
		return validation.NewInvalidInputError("Link button: cannot have a SKU")
	}

	if b.Emoji != nil {
		return validation.NewInvalidInputError("Link button: cannot have an emoji")
	}

	if err := checkUrl("Link button", *b.Url); err != nil {
		return err
	}

	label := strings.TrimSpace(b.Label)
	if label == "" {
		return validation.NewInvalidInputError("Link button: the label cannot be blank")
	}

	if utf8.RuneCountInString(b.Label) > maxButtonLabelLength {
		return validation.NewInvalidInputErrorf("Link button: the label must be %d characters or fewer", maxButtonLabelLength)
	}

	if strings.ContainsRune(b.Label, 0) {
		return validation.NewInvalidInputError("Link button: the label cannot contain null characters")
	}

	return nil
}

func (v *treeValidator) dropdown(s component.SelectMenu) error {
	if s.CustomId != panelDropdownCustomId {
		return validation.NewInvalidInputError("Dropdown: only the panel dropdown can be placed in a message")
	}

	if v.rules.validPanelIds == nil || !v.rules.dropdownMode {
		return validation.NewInvalidInputError("Dropdown: can only be placed in a multi-panel that uses a dropdown")
	}

	if v.selectPlaced {
		return validation.NewInvalidInputError("Dropdown: can only be placed once")
	}

	v.selectPlaced = true
	return nil
}

func (v *treeValidator) checkMediaUrl(kind, raw string) error {
	if raw == "" {
		return validation.NewInvalidInputErrorf("%s: an image URL is required", kind)
	}

	if raw == types.AvatarUrlPlaceholder && v.rules.allowAvatarPlaceholder {
		return nil
	}

	return checkUrl(kind, raw)
}

func checkMediaDescription(kind string, description *string) error {
	if description == nil {
		return nil
	}

	if utf8.RuneCountInString(*description) > maxMediaDescriptionLength {
		return validation.NewInvalidInputErrorf("%s: the alt text must be %d characters or fewer", kind, maxMediaDescriptionLength)
	}

	if strings.ContainsRune(*description, 0) {
		return validation.NewInvalidInputErrorf("%s: the alt text cannot contain null characters", kind)
	}

	return nil
}

func checkUrl(kind, raw string) error {
	if utf8.RuneCountInString(raw) > maxComponentUrlLength {
		return validation.NewInvalidInputErrorf("%s: the URL must be %d characters or fewer", kind, maxComponentUrlLength)
	}

	for _, r := range raw {
		if unicode.IsSpace(r) || unicode.IsControl(r) || isBidiControl(r) {
			return validation.NewInvalidInputErrorf("%s: the URL cannot contain spaces or control characters", kind)
		}
	}

	parsed, err := url.Parse(raw)
	if err != nil || !parsed.IsAbs() || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return validation.NewInvalidInputErrorf("%s: the URL must be a full http:// or https:// address", kind)
	}

	if parsed.User != nil {
		return validation.NewInvalidInputErrorf("%s: the URL cannot contain a username or password", kind)
	}

	if !hasDottedHostname(parsed.Hostname()) {
		return validation.NewInvalidInputErrorf("%s: the URL needs a valid domain name", kind)
	}

	return nil
}

func hasDottedHostname(host string) bool {
	labels := strings.Split(strings.TrimSuffix(host, "."), ".")
	if len(labels) < 2 {
		return false
	}

	for _, label := range labels {
		if label == "" {
			return false
		}
	}

	return true
}

func isBidiControl(r rune) bool {
	return unicode.Is(unicode.Bidi_Control, r)
}

func parsePanelPlacement(customId string) (int, bool) {
	raw, ok := strings.CutPrefix(customId, panelPlacementPrefix)
	if !ok || raw == "" || len(raw) > 9 {
		return 0, false
	}

	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 || strconv.Itoa(id) != raw {
		return 0, false
	}

	return id, true
}

func normaliseComponentTree(tree []component.Component) []component.Component {
	if tree == nil {
		return nil
	}

	out := make([]component.Component, len(tree))
	for i, c := range tree {
		out[i] = normaliseComponent(c)
	}

	return out
}

func normaliseComponent(c component.Component) component.Component {
	switch d := c.ComponentData.(type) {
	case component.Container:
		d.Components = normaliseComponentTree(d.Components)
		c.ComponentData = d
	case component.Section:
		d.Components = normaliseComponentTree(d.Components)
		d.Accessory = normaliseComponent(d.Accessory)
		c.ComponentData = d
	case component.ActionRow:
		d.Components = normaliseComponentTree(d.Components)
		c.ComponentData = d
	case component.Thumbnail:
		d.Media = component.UnfurledMediaItem{Url: d.Media.Url}
		c.ComponentData = d
	case component.MediaGallery:
		items := make([]component.MediaGalleryItem, len(d.Items))
		for i, item := range d.Items {
			item.Media = component.UnfurledMediaItem{Url: item.Media.Url}
			items[i] = item
		}

		d.Items = items
		c.ComponentData = d
	case component.SelectMenu:
		c.ComponentData = component.SelectMenu{CustomId: panelDropdownCustomId}
	case component.Button:
		c.ComponentData = normaliseButton(d)
	}

	return c
}

func normaliseButton(b component.Button) component.Button {
	if b.Url != nil {
		return component.Button{Label: b.Label, Style: component.ButtonStyleLink, Url: b.Url, Disabled: b.Disabled}
	}

	return component.Button{Style: panelButtonStyleOrDefault(b.Style), CustomId: b.CustomId}
}

func panelButtonStyleOrDefault(style component.ButtonStyle) component.ButtonStyle {
	if isPanelButtonStyle(style) {
		return style
	}

	return component.ButtonStylePrimary
}

func isPanelButtonStyle(style component.ButtonStyle) bool {
	switch style {
	case component.ButtonStylePrimary, component.ButtonStyleSecondary, component.ButtonStyleSuccess, component.ButtonStyleDanger:
		return true
	default:
		return false
	}
}
