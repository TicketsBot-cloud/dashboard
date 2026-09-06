package api

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/validation"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/validation/defaults"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

func ApplyPanelDefaults(data *panelBody) {
	for _, applicator := range DefaultApplicators(data) {
		if applicator.ShouldApply() {
			applicator.Apply()
		}
	}
}

func DefaultApplicators(data *panelBody) []defaults.DefaultApplicator {
	return []defaults.DefaultApplicator{
		defaults.NewDefaultApplicator(defaults.EmptyStringCheck, &data.Title, "Open a ticket!"),
		defaults.NewDefaultApplicator(defaults.EmptyStringCheck, &data.Content, "By clicking the button, a ticket will be opened for you."),
		defaults.NewDefaultApplicator[*string](defaults.NilOrEmptyStringCheck, &data.ImageUrl, nil),
		defaults.NewDefaultApplicator[*string](defaults.NilOrEmptyStringCheck, &data.ThumbnailUrl, nil),
		defaults.NewDefaultApplicator[*string](defaults.NilOrEmptyStringCheck, &data.NamingScheme, nil),
		defaults.NewDefaultApplicator(defaults.EmptyStringCheck, &data.MentionBehaviour, MentionBehaviourNone),
	}
}

const (
	MentionBehaviourNone   = "none"
	MentionBehaviourHide   = "hide"
	MentionBehaviourDelete = "delete"
)

// panelNameMaxLength bounds the dashboard-only Panel Name label. No exact precedent
// exists for this specific field: the closest comparisons are the Discord-facing
// panel Title/ButtonLabel (80 chars, validateTitle/validateButtonLabel) and other
// dashboard-only labels elsewhere in this codebase (team names and integration names
// both cap at 32). 100 sits comfortably above the Discord-facing title cap without
// being excessive for a purely organisational label.
const panelNameMaxLength = 100

type PanelValidationContext struct {
	Data       panelBody
	GuildId    uint64
	IsPremium  bool
	BotContext *botcontext.BotContext
	Channels   []channel.Channel
	Roles      []guild.Role
}

func ValidatePanelBody(validationContext PanelValidationContext) error {
	ctx, cancelFunc := context.WithTimeout(context.Background(), time.Second*5)
	defer cancelFunc()

	return validation.Validate(ctx, validationContext, panelValidators()...)
}

func panelValidators() []validation.Validator[PanelValidationContext] {
	return []validation.Validator[PanelValidationContext]{
		validateName,
		validateTitle,
		validateContent,
		validateChannelId,
		validateCategory,
		validateEmoji,
		validateImageUrl,
		validateThumbnailUrl,
		validateButtonStyle,
		validateButtonLabel,
		validateButtonLabelOrEmoji,
		validateFormId,
		validateExitSurveyFormId,
		validateTeams,
		validateKBCategories,
		validateNamingScheme,
		validateWelcomeMessage,
		validateAccessControlList,
		validatePendingCategory,
		validateTranscriptChannelId,
		validateTicketNotificationChannel,
		validateCooldownSeconds,
		validateTicketLimit,
		validateOverflowCategoryId,
		validateSupportCanType,
		validateAutoClose,
		validateMentionBehaviour,
		validateMessageComponents,
		validateWelcomeMessageComponents,
	}
}

// validateName gates the dashboard-only Panel Name label - always visible regardless
// of Classic/Components V2 mode, and never sent to Discord. Unlike Title/Content
// (which fall back to a default when blank, see ApplyPanelDefaults), Name is required:
// there is no sensible default for a label whose entire purpose is to identify this
// specific panel in the dashboard's panel list.
func validateName(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		return validateResourceName(ctx.Data.Name, "Panel")
	}
}

// validateResourceName is the shared check behind the dashboard-only Name label on
// both panels and multi-panels: required, no sensible default (see validateName),
// bounded by the same panelNameMaxLength used for the panel-facing field.
func validateResourceName(rawName, resourceLabel string) error {
	name := strings.TrimSpace(rawName)

	if name == "" {
		return validation.NewInvalidInputErrorf("%s name is required", resourceLabel)
	}

	if utf8.RuneCountInString(name) > panelNameMaxLength {
		return validation.NewInvalidInputErrorf("%s name must be %d characters or fewer", resourceLabel, panelNameMaxLength)
	}

	return nil
}

func validateTitle(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if utf8.RuneCountInString(ctx.Data.Title) > 80 {
			return validation.NewInvalidInputError("Panel title must be less than 80 characters")
		}

		return nil
	}
}

func validateContent(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if utf8.RuneCountInString(ctx.Data.Content) > 4096 {
			return validation.NewInvalidInputError("Panel content must be less than 4096 characters")
		}

		return nil
	}
}

func validateChannelId(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		for _, ch := range ctx.Channels {
			if ch.Id == ctx.Data.ChannelId && (ch.Type == channel.ChannelTypeGuildText || ch.Type == channel.ChannelTypeGuildNews) {
				return nil
			}
		}

		return validation.NewInvalidInputError("Panel channel not found")
	}
}

func validateCategory(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		for _, ch := range ctx.Channels {
			if ch.Id == ctx.Data.CategoryId && ch.Type == channel.ChannelTypeGuildCategory {
				return nil
			}
		}

		return validation.NewInvalidInputError("Invalid ticket category")
	}
}

func validateEmoji(c PanelValidationContext) validation.ValidationFunc {
	return func() error {
		emoji := c.Data.Emoji

		// If no emoji is provided (empty name), skip validation
		if len(emoji.Name) == 0 && !emoji.IsCustomEmoji {
			return nil
		}

		if emoji.IsCustomEmoji {
			if emoji.Id == nil {
				return validation.NewInvalidInputError("Custom emoji was missing ID")
			}

			ctx, cancel := context.WithTimeout(context.Background(), app.DefaultTimeout)
			defer cancel()

			resolvedEmoji, err := c.BotContext.GetGuildEmoji(ctx, c.GuildId, *emoji.Id)
			if err != nil {
				return err
			}

			if resolvedEmoji.Id.Value == 0 {
				return validation.NewInvalidInputError("Emoji not found")
			}

			if resolvedEmoji.Name != emoji.Name {
				return validation.NewInvalidInputError("Emoji name mismatch")
			}
		} else {
			// Validate Unicode emoji
			name := strings.TrimSpace(emoji.Name)

			// Must be valid UTF-8
			if !utf8.ValidString(name) {
				return validation.NewInvalidInputError("Invalid emoji")
			}

			emoji.Name = name
		}

		return nil
	}
}

var urlRegex = regexp.MustCompile(`^https?://([-a-zA-Z0-9@:%._+~#=]{1,256})\.[a-zA-Z0-9()]{1,63}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$`)

func validateNullableUrl(url *string) validation.ValidationFunc {
	return func() error {
		if url != nil && (len(*url) > 255 || !urlRegex.MatchString(*url)) {
			return validation.NewInvalidInputError("Invalid URL")
		}

		return nil
	}
}

func validateImageUrl(ctx PanelValidationContext) validation.ValidationFunc {
	return validateNullableUrl(ctx.Data.ImageUrl)
}

func validateThumbnailUrl(ctx PanelValidationContext) validation.ValidationFunc {
	return validateNullableUrl(ctx.Data.ThumbnailUrl)
}

func validateButtonStyle(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.ButtonStyle < component.ButtonStylePrimary && ctx.Data.ButtonStyle > component.ButtonStyleDanger {
			return validation.NewInvalidInputError("Invalid button style")
		}

		return nil
	}
}

func validateButtonLabel(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if utf8.RuneCountInString(ctx.Data.ButtonLabel) > 80 {
			return validation.NewInvalidInputError("Button label must be less than 80 characters")
		}

		return nil
	}
}

func validateButtonLabelOrEmoji(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		hasLabel := len(strings.TrimSpace(ctx.Data.ButtonLabel)) > 0
		hasEmoji := len(strings.TrimSpace(ctx.Data.Emoji.Name)) > 0

		if !hasLabel && !hasEmoji {
			return validation.NewInvalidInputError("Button must have at least one of label or emoji")
		}

		return nil
	}
}

func validatedNullableFormId(guildId uint64, formId *int) validation.ValidationFunc {
	return func() error {
		if formId == nil {
			return nil
		}

		form, ok, err := dbclient.Client.Forms.Get(context.Background(), *formId)
		if err != nil {
			return err
		}

		if !ok {
			return validation.NewInvalidInputError("Form not found")
		}

		if form.GuildId != guildId {
			return validation.NewInvalidInputError("Guild ID mismatch when validating form")
		}

		return nil
	}
}

func validateFormId(ctx PanelValidationContext) validation.ValidationFunc {
	return validatedNullableFormId(ctx.GuildId, ctx.Data.FormId)
}

// Check premium on the worker side to maintain settings if user unsubscribes and later resubscribes
func validateExitSurveyFormId(ctx PanelValidationContext) validation.ValidationFunc {
	return validatedNullableFormId(ctx.GuildId, ctx.Data.ExitSurveyFormId)
}

func validatePendingCategory(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.PendingCategory == nil {
			return nil
		}

		if !ctx.IsPremium {
			return validation.NewInvalidInputError("Awaiting response category is a premium feature")
		}

		for _, ch := range ctx.Channels {
			if ch.Id == *ctx.Data.PendingCategory && ch.Type == channel.ChannelTypeGuildCategory {
				return nil
			}
		}

		return validation.NewInvalidInputError("Invalid awaiting response category")
	}
}

func validateTeams(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		// Query does not work nicely if there are no teams created in the guild, but if the user submits no teams,
		// then the input is guaranteed to be valid. Teams array excludes default team.
		if len(ctx.Data.Teams) == 0 {
			return nil
		}

		ok, err := dbclient.Client.SupportTeam.AllTeamsExistForGuild(context.Background(), ctx.GuildId, ctx.Data.Teams)
		if err != nil {
			return err
		}

		if !ok {
			return validation.NewInvalidInputError("Invalid support team")
		}

		return nil
	}
}

func validateKBCategories(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if len(ctx.Data.KBCategoryIds) == 0 {
			return nil
		}

		categories, err := dbclient.Client.KBCategories.GetByGuild(context.Background(), ctx.GuildId)
		if err != nil {
			return err
		}

		valid := make(map[int]struct{}, len(categories))
		for _, category := range categories {
			valid[category.Id] = struct{}{}
		}

		for _, id := range ctx.Data.KBCategoryIds {
			if _, ok := valid[id]; !ok {
				return validation.NewInvalidInputError("Invalid knowledge base category")
			}
		}

		return nil
	}
}

// Match anything that looks like a placeholder
var placeholderPattern = regexp.MustCompile(`%([^%]+)%`)

// Strict patterns for specific placeholder types
var simplePlaceholderPattern = regexp.MustCompile(`^[a-z_]+$`)
var dateWithFormatPattern = regexp.MustCompile(`^date:([ymd\-\/\._ ]+)$`)
var dateOffsetPattern = regexp.MustCompile(`^date_(days|weeks|months):(-?\d+)(?::([ymd\-\/\._ ]+))?$`)
var dateTimestampPattern = regexp.MustCompile(`^date_timestamp:(\d+)(?::([ymd\-\/\._ ]+))?$`)

// Discord filters out illegal characters (such as +, $, ") when creating the channel for us
func validateNamingScheme(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.NamingScheme == nil {
			return nil
		}

		if utf8.RuneCountInString(*ctx.Data.NamingScheme) > 100 {
			return validation.NewInvalidInputError("Naming scheme must be less than 100 characters")
		}

		// Validate placeholders used
		validPlaceholders := []string{"id", "username", "nickname", "id_padded", "claimed", "claim_indicator", "claimed_by", "date"}
		for _, match := range placeholderPattern.FindAllStringSubmatch(*ctx.Data.NamingScheme, -1) {
			if len(match) < 2 {
				return errors.New("Infallible: Regex match length was < 2")
			}

			content := match[1]

			// Check if it's a date_days, date_weeks, or date_months placeholder
			if dateOffsetPattern.MatchString(content) {
				continue
			}

			// Check if it's a date_timestamp placeholder
			if dateTimestampPattern.MatchString(content) {
				continue
			}

			// Check if it's a date with format
			if dateWithFormatPattern.MatchString(content) {
				continue
			}

			// Check if it's a simple placeholder (no parameters)
			if simplePlaceholderPattern.MatchString(content) {
				if utils.Contains(validPlaceholders, content) {
					continue
				}
				return validation.NewInvalidInputError(fmt.Sprintf("Invalid naming scheme placeholder: %s", content))
			}

			// If we get here, it's a malformed placeholder
			return validation.NewInvalidInputError(fmt.Sprintf("Invalid placeholder format: %s", content))
		}

		return nil
	}
}

func validateWelcomeMessage(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		return validateEmbed(ctx.Data.WelcomeMessage)
	}
}

func validateAccessControlList(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		acl := ctx.Data.AccessControlList

		if len(acl) == 0 {
			return validation.NewInvalidInputError("Access control list is empty")
		}

		if len(acl) > 10 {
			return validation.NewInvalidInputError("Access control list cannot have more than 10 roles")
		}

		roles := utils.ToSet(utils.Map(ctx.Roles, utils.RoleToId))

		if roles.Size() != len(ctx.Roles) {
			return validation.NewInvalidInputError("Duplicate roles in access control list")
		}

		everyoneRoleFound := false
		for _, rule := range acl {
			if rule.RoleId == ctx.GuildId {
				everyoneRoleFound = true
			}

			if rule.Action != database.AccessControlActionDeny && rule.Action != database.AccessControlActionAllow {
				return validation.NewInvalidInputErrorf("Invalid access control action \"%s\"", rule.Action)
			}

			if !roles.Contains(rule.RoleId) {
				return validation.NewInvalidInputErrorf("Invalid role %d in access control list not found in the guild", rule.RoleId)
			}
		}

		if !everyoneRoleFound {
			return validation.NewInvalidInputError("Access control list does not contain @everyone rule")
		}

		return nil
	}
}

func validateEmbed(e *types.CustomEmbed) error {
	if e == nil {
		return nil
	}

	if e.Title == nil && e.Description == nil && len(e.Fields) == 0 && e.ImageUrl == nil && e.ThumbnailUrl == nil {
		return validation.NewInvalidInputError("Your embed message does not contain any content")
	}

	for _, url := range []*string{e.ImageUrl, e.ThumbnailUrl} {
		if url == nil || *url == types.AvatarUrlPlaceholder {
			continue
		}

		if len(*url) > 255 || !urlRegex.MatchString(*url) {
			return validation.NewInvalidInputError("Invalid URL")
		}
	}

	if total := e.TotalCharacterCount(); total > types.EmbedTotalCharacterLimit {
		return validation.NewInvalidInputErrorf("Total embed characters (%d) exceeds Discord's %d character limit", total, types.EmbedTotalCharacterLimit)
	}

	return nil
}

func validateCooldownSeconds(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.CooldownSeconds < 0 {
			return validation.NewInvalidInputError("Cooldown must be 0 or greater")
		}
		return nil
	}
}

func validateTranscriptChannelId(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.TranscriptChannelId == nil {
			return nil
		}

		for _, ch := range ctx.Channels {
			if ch.Id == *ctx.Data.TranscriptChannelId {
				if ch.Type != channel.ChannelTypeGuildText && ch.Type != channel.ChannelTypeGuildNews {
					return validation.NewInvalidInputError("Transcript channel must be a text channel")
				}
				return nil
			}
		}

		return validation.NewInvalidInputError("Transcript channel not found")
	}
}

func validateTicketNotificationChannel(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		// Always validate the channel if provided
		if ctx.Data.TicketNotificationChannel != nil {
			channelFound := false
			for _, ch := range ctx.Channels {
				if ch.Id == *ctx.Data.TicketNotificationChannel {
					channelFound = true
					if ch.Type != channel.ChannelTypeGuildText {
						return validation.NewInvalidInputError("Ticket notification channel must be a text channel")
					}
					break
				}
			}

			if !channelFound {
				return validation.NewInvalidInputError("Ticket notification channel not found")
			}
		}

		// Thread mode requires a per-panel notification channel
		if ctx.Data.UseThreads && ctx.Data.TicketNotificationChannel == nil {
			return validation.NewInvalidInputError("You must select a ticket notification channel for this panel when thread mode is enabled")
		}

		return nil
	}
}

func validateTicketLimit(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.TicketLimit == nil {
			return nil
		}

		if *ctx.Data.TicketLimit > 10 {
			return validation.NewInvalidInputError("Ticket limit must be at most 11")
		}

		return nil
	}
}

func validateOverflowCategoryId(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.OverflowCategoryId == nil {
			return nil
		}

		for _, ch := range ctx.Channels {
			if ch.Id == *ctx.Data.OverflowCategoryId {
				if ch.GuildId != ctx.GuildId {
					return validation.NewInvalidInputError("Overflow category guild ID does not match")
				}

				if ch.Type != channel.ChannelTypeGuildCategory {
					return validation.NewInvalidInputError("Overflow category is not a category")
				}

				return nil
			}
		}

		return validation.NewInvalidInputError("Invalid overflow category")
	}
}

func validateSupportCanType(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.SupportCanType && !ctx.Data.SupportCanView {
			return validation.NewInvalidInputError("Support must be able to view a claimed ticket in order to type in it")
		}

		return nil
	}
}

func validateMentionBehaviour(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		switch ctx.Data.MentionBehaviour {
		case MentionBehaviourNone, MentionBehaviourHide, MentionBehaviourDelete:
			return nil
		default:
			return validation.NewInvalidInputError("Invalid mention behaviour")
		}
	}
}

// validateMessageComponents gates the panel's button-message Components V2 tree.
func validateMessageComponents(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if !ctx.Data.MessageUsesComponentsV2 {
			return nil
		}

		if !ctx.IsPremium {
			return validation.NewInvalidInputError("Component-based messages are a premium feature")
		}

		// A single panel's own message has no concept of "other panels" to place, so
		// panel-placement is never valid here: no valid panel IDs, dropdown mode off.
		if err := validateComponentTree(ctx.Data.MessageComponents, nil, false); err != nil {
			return err
		}

		// Reserve 1 top-level slot and 2 total components for the system-appended
		// open-ticket button action row.
		return validateComponentTreeBudget(ctx.Data.MessageComponents, 1, 2)
	}
}

// validateWelcomeMessageComponents gates the panel's welcome-message Components V2 tree.
func validateWelcomeMessageComponents(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if !ctx.Data.WelcomeMessageUsesComponentsV2 {
			return nil
		}

		if !ctx.IsPremium {
			return validation.NewInvalidInputError("Component-based welcome messages are a premium feature")
		}

		// The welcome message has no concept of "other panels" to place either.
		if err := validateComponentTree(ctx.Data.WelcomeMessageComponents, nil, false); err != nil {
			return err
		}

		visibleButtons := 0
		if !ctx.Data.HideCloseButton {
			visibleButtons++
		}
		if !ctx.Data.HideCloseWithReasonButton {
			visibleButtons++
		}
		if !ctx.Data.HideClaimButton {
			visibleButtons++
		}

		// Reserve a flat budget of 1 top-level slot / 3 total components for form-answer
		// content: the worker appends this at ticket-open time once the submitted form is
		// known, so its true size can't be computed here. This is a best-effort save-time
		// guard, not the sole enforcement point - the worker re-checks the hard ceiling
		// when it actually builds the message and truncates if the real form exceeds it.
		reservedTopLevel := 1
		reservedTotal := 3

		if visibleButtons > 0 {
			reservedTopLevel++                  // the close/claim buttons' action row
			reservedTotal += visibleButtons + 1 // the buttons themselves, plus their row
		}

		return validateComponentTreeBudget(ctx.Data.WelcomeMessageComponents, reservedTopLevel, reservedTotal)
	}
}

// maxComponentTreeDepth bounds recursion in validateComponentTree independently of the
// top-level/total budget checks, which only run after the tree has already been fully
// walked. Discord's real component nesting is at most 2 levels deep (Container ->
// Section -> leaf), so this is generous headroom, not a semantic limit - its only job is
// to stop a pathologically deep (but otherwise structurally cheap) attacker-supplied tree
// from forcing an expensive/unbounded recursive walk before any size limit is enforced.
const maxComponentTreeDepth = 10

// validateComponentTree recursively rejects any interactive component (action rows,
// buttons, every select-menu/input/form-field type) at any nesting depth, and rejects
// a Section accessory that isn't a Thumbnail. System-owned interactive elements are
// appended by the backend separately and can never appear in a guild-authored tree.
//
// The two deliberate exceptions - a button placed as a stand-in for a real panel's
// "Open Ticket" button, and a select menu placed as a stand-in for the multi-panel's
// dropdown - are gated by validPanelIds and selectMenuModeOn. Pass nil/false from any
// caller that has no concept of "other panels" to place (a single panel's own
// button/welcome message): that leaves this identical to the pre-existing behaviour.
func validateComponentTree(tree []component.Component, validPanelIds map[int]bool, selectMenuModeOn bool) error {
	return validateComponentTreeAtDepth(tree, 0, validPanelIds, selectMenuModeOn)
}

func validateComponentTreeAtDepth(tree []component.Component, depth int, validPanelIds map[int]bool, selectMenuModeOn bool) error {
	if depth > maxComponentTreeDepth {
		return validation.NewInvalidInputError("Component tree is nested too deeply")
	}

	for _, c := range tree {
		if err := validateComponentNode(c, depth, validPanelIds, selectMenuModeOn); err != nil {
			return err
		}
	}

	return nil
}

func validateComponentNode(c component.Component, depth int, validPanelIds map[int]bool, selectMenuModeOn bool) error {
	switch c.Type {
	case component.ComponentContainer:
		container, ok := c.ComponentData.(component.Container)
		if !ok {
			return validation.NewInvalidInputError("Invalid container component")
		}

		return validateComponentTreeAtDepth(container.Components, depth+1, validPanelIds, selectMenuModeOn)
	case component.ComponentSection:
		section, ok := c.ComponentData.(component.Section)
		if !ok {
			return validation.NewInvalidInputError("Invalid section component")
		}

		if err := validateComponentTreeAtDepth(section.Components, depth+1, validPanelIds, selectMenuModeOn); err != nil {
			return err
		}

		return validateSectionAccessory(section.Accessory, validPanelIds)
	case component.ComponentTextDisplay, component.ComponentMediaGallery, component.ComponentFile, component.ComponentSeparator:
		return nil
	case component.ComponentThumbnail:
		// Only valid as a section's accessory, never as a standalone tree entry.
		return validation.NewInvalidInputError("A thumbnail can only be used as a section's accessory")
	case component.ComponentActionRow:
		row, ok := c.ComponentData.(component.ActionRow)
		if !ok {
			return validation.NewInvalidInputError("Invalid action row component")
		}

		return validateActionRow(row, validPanelIds, selectMenuModeOn)
	case component.ComponentButton, component.ComponentSelectMenu, component.ComponentInputText,
		component.ComponentUserSelect, component.ComponentRoleSelect, component.ComponentMentionableSelect, component.ComponentChannelSelect,
		component.ComponentLabel, component.ComponentFileUpload, component.ComponentRadioGroup, component.ComponentCheckboxGroup, component.ComponentCheckbox:
		// A bare button/select outside of an action row is never valid on its own -
		// Discord's schema requires both a button and a select menu live inside an action
		// row. The only places a button may appear at all are a guild-authored action row
		// of link/panel buttons (see validateActionRow) or a section's accessory (see
		// validateSectionAccessory); the only place a select menu may appear at all is as
		// the sole child of a guild-authored action row, and only as a panel-select
		// placeholder (see validateActionRow/isPanelSelect) - every other select menu
		// remains banned everywhere, with no exception.
		return validation.NewInvalidInputError("Interactive components are not allowed in this message")
	default:
		return validation.NewInvalidInputErrorf("Unsupported component type %d", c.Type)
	}
}

// isLinkButton reports whether c is a link-style button with no custom_id: Discord
// handles a link button entirely client-side - clicking it just opens the URL, no
// interaction event is ever sent to the bot - so there's no custom_id for an attacker
// to spoof a system button with, and no interaction payload for the bot to mis-dispatch.
// Shared by validateActionRow and validateSectionAccessory, two of the three positions
// where a button is ever allowed in a guild-authored tree.
func isLinkButton(c component.Component) bool {
	if c.Type != component.ComponentButton {
		return false
	}

	button, ok := c.ComponentData.(component.Button)
	if !ok {
		return false
	}

	return button.Style == component.ButtonStyleLink && button.CustomId == "" && button.Url != nil && *button.Url != ""
}

// isPanelButton reports whether c is a placeholder button standing in for a real panel's
// "Open Ticket" button that belongs to this multi-panel: a Button with no custom_id, no
// URL, PanelId set, and that PanelId present in validPanelIds.
//
// This is the load-bearing security rule for the whole panel-placement feature: a
// component carrying both a non-empty CustomId and a non-nil PanelId is rejected here
// (CustomId != "" fails the check below) rather than accepted under either
// interpretation - never let a client smuggle an arbitrary custom_id in alongside a
// panel_id. The only custom_id this feature ever causes to reach Discord is one the
// backend itself reads from panels.custom_id for a panel_id that genuinely belongs to
// this multi-panel (validPanelIds is built from data.Panels, which validatePanels has
// already ownership-checked against the guild before this function ever runs) - never a
// client-supplied value.
func isPanelButton(c component.Component, validPanelIds map[int]bool) bool {
	if c.Type != component.ComponentButton {
		return false
	}

	button, ok := c.ComponentData.(component.Button)
	if !ok {
		return false
	}

	if button.CustomId != "" || button.Url != nil || button.PanelId == nil {
		return false
	}

	return validPanelIds[*button.PanelId]
}

// isPanelSelect reports whether c is a placeholder select menu marking where the
// multi-panel's dropdown should be placed inside the guild-authored tree: a SelectMenu
// with IsPanelSelect set, no custom_id, and no options (both are populated by the
// backend at resolve time - see resolveComponentTreePanelRefs). Only valid at all when
// selectMenuModeOn is true - dropdown-mode placement makes no sense when this
// multi-panel isn't actually in dropdown mode.
func isPanelSelect(c component.Component, selectMenuModeOn bool) bool {
	if !selectMenuModeOn {
		return false
	}

	if c.Type != component.ComponentSelectMenu {
		return false
	}

	sm, ok := c.ComponentData.(component.SelectMenu)
	if !ok {
		return false
	}

	return sm.IsPanelSelect && sm.CustomId == "" && len(sm.Options) == 0
}

// validateActionRow allows a guild-authored ActionRow - at top level or inside a
// Container's Components, never as a Section's accessory, which stays limited to a
// single Thumbnail, link button, or panel button - in one of two shapes: every child is
// a link button (see isLinkButton) or a panel button (see isPanelButton), or the row's
// sole child is the panel-select placeholder (see isPanelSelect). The second shape
// mirrors Discord's own rule that a select menu is only ever valid as the sole component
// of its action row, and matches how buildSystemComponents always wraps its own select
// menu in a single-child row. A row of several link/panel buttons is just N instances of
// the same two safe primitives; any other shape (a non-link/non-panel button, any other
// select menu type, or a select menu mixed with anything else) keeps the whole row
// banned, matching the "no interactive components" rule everywhere else.
func validateActionRow(row component.ActionRow, validPanelIds map[int]bool, selectMenuModeOn bool) error {
	if len(row.Components) == 0 {
		return validation.NewInvalidInputError("An action row must contain at least one component")
	}

	if len(row.Components) > 5 {
		return validation.NewInvalidInputError("An action row cannot contain more than 5 components")
	}

	if len(row.Components) == 1 && isPanelSelect(row.Components[0], selectMenuModeOn) {
		return nil
	}

	for _, child := range row.Components {
		if !isLinkButton(child) && !isPanelButton(child, validPanelIds) {
			return validation.NewInvalidInputError("An action row may only contain link buttons or panel buttons, or a single panel dropdown on its own")
		}
	}

	return nil
}

// validateSectionAccessory allows a section's accessory to be a Thumbnail, a link-style
// Button (style Link, no CustomId, has a Url), or a panel button (see isPanelButton).
// Discord handles a link button entirely client-side - clicking it just opens the URL, no
// interaction event is ever sent to the bot - so there's no custom_id for an attacker
// to spoof a system button with, and no interaction payload for the bot to mis-dispatch.
// A panel button carries no client-supplied custom_id either (see isPanelButton). Every
// other button style (has a CustomId, triggers a bot-handled interaction) and every
// select-menu type remain fully disallowed everywhere in the tree, including here.
//
// Discord's Section object requires accessory (it is not an optional field), and
// gdl's Component.MarshalJSON errors out on a zero-value ComponentData rather than
// omitting the key, so a missing accessory must be rejected here at validation time -
// otherwise it passes validation but then fails to marshal when the message is sent.
func validateSectionAccessory(accessory component.Component, validPanelIds map[int]bool) error {
	if accessory.ComponentData == nil {
		return validation.NewInvalidInputError("A section must have an accessory (a thumbnail, a link button, or a panel button)")
	}

	switch accessory.Type {
	case component.ComponentThumbnail:
		return nil
	case component.ComponentButton:
		if !isLinkButton(accessory) && !isPanelButton(accessory, validPanelIds) {
			return validation.NewInvalidInputError("A button used as a section's accessory must be a link button or a panel button, with no custom ID")
		}

		return nil
	default:
		return validation.NewInvalidInputError("A section's accessory must be a thumbnail, a link button, or a panel button")
	}
}

// collectPlacedPanelIds walks an already validateComponentTree-approved tree
// depth-first and collects every panel that has been placed inside it, either as a
// button (PanelId) or as the single dropdown placeholder (IsPanelSelect).
//
// Whether a placed panel_id is actually a member of this multi-panel was already
// enforced by isPanelButton during validateComponentTree, so this function can assume
// every PanelId it sees has already passed that check - it only needs to catch
// duplicates and the select-menu-count/mode rules, which validateComponentTree does not
// check on its own (each node is validated independently of its siblings there).
func collectPlacedPanelIds(tree []component.Component) (placed map[int]bool, hasSelect bool, err error) {
	placed = make(map[int]bool)

	var walk func(nodes []component.Component) error
	walk = func(nodes []component.Component) error {
		for _, c := range nodes {
			switch c.Type {
			case component.ComponentContainer:
				container, ok := c.ComponentData.(component.Container)
				if !ok {
					continue
				}

				if err := walk(container.Components); err != nil {
					return err
				}
			case component.ComponentSection:
				section, ok := c.ComponentData.(component.Section)
				if !ok {
					continue
				}

				if err := walk(section.Components); err != nil {
					return err
				}

				if err := walk([]component.Component{section.Accessory}); err != nil {
					return err
				}
			case component.ComponentActionRow:
				row, ok := c.ComponentData.(component.ActionRow)
				if !ok {
					continue
				}

				if err := walk(row.Components); err != nil {
					return err
				}
			case component.ComponentButton:
				button, ok := c.ComponentData.(component.Button)
				if !ok || button.PanelId == nil {
					continue
				}

				if placed[*button.PanelId] {
					return validation.NewInvalidInputErrorf("Panel %d is placed more than once in the message", *button.PanelId)
				}

				placed[*button.PanelId] = true
			case component.ComponentSelectMenu:
				sm, ok := c.ComponentData.(component.SelectMenu)
				if !ok || !sm.IsPanelSelect {
					continue
				}

				if hasSelect {
					return validation.NewInvalidInputError("The panel dropdown can only be placed once in the message")
				}

				hasSelect = true
			}
		}

		return nil
	}

	if err := walk(tree); err != nil {
		return nil, false, err
	}

	return placed, hasSelect, nil
}

// validateComponentTreeBudget enforces Discord's 10-top-level/30-total component limits,
// minus whatever the backend will append on top of the guild's tree (reservedTopLevel/
// reservedTotal). A pure function so it's directly unit-testable without a gin.Context.
func validateComponentTreeBudget(tree []component.Component, reservedTopLevel, reservedTotal int) error {
	total := countComponents(tree)

	if len(tree)+reservedTopLevel > 10 {
		return validation.NewInvalidInputErrorf(
			"Too many top-level components: %d (maximum %d, %d reserved for system components)",
			len(tree), 10-reservedTopLevel, reservedTopLevel,
		)
	}

	if total+reservedTotal > 30 {
		return validation.NewInvalidInputErrorf(
			"Too many components: %d (maximum %d, %d reserved for system components)",
			total, 30-reservedTotal, reservedTotal,
		)
	}

	return nil
}

func countComponents(tree []component.Component) int {
	count := 0

	for _, c := range tree {
		count++

		switch c.Type {
		case component.ComponentContainer:
			if container, ok := c.ComponentData.(component.Container); ok {
				count += countComponents(container.Components)
			}
		case component.ComponentSection:
			if section, ok := c.ComponentData.(component.Section); ok {
				count += countComponents(section.Components)
				if section.Accessory.ComponentData != nil {
					count++
				}
			}
		case component.ComponentActionRow:
			// An action row's children (link buttons - see validateActionRow) are leaves,
			// so this adds their count directly rather than recursing.
			if row, ok := c.ComponentData.(component.ActionRow); ok {
				count += len(row.Components)
			}
		}
	}

	return count
}

func validateAutoClose(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		ac := ctx.Data.AutoClose

		if !ac.Enabled {
			return nil
		}

		if ac.SinceOpenWithNoResponse < 0 {
			return validation.NewInvalidInputError("Auto-close time cannot be negative")
		}

		if ac.SinceLastMessage < 0 {
			return validation.NewInvalidInputError("Auto-close time cannot be negative")
		}

		maxSeconds := int64((time.Hour * 24 * 60).Seconds())
		if ac.SinceOpenWithNoResponse > maxSeconds || ac.SinceLastMessage > maxSeconds {
			return validation.NewInvalidInputError("Auto-close time period cannot be longer than 60 days")
		}

		return nil
	}
}
