package api

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/validation"
	"github.com/TicketsBot-cloud/dashboard/app/http/validation/defaults"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
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
	}
}

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
		validateNamingScheme,
		validateWelcomeMessage,
		validateAccessControlList,
		validatePendingCategory,
		validateTicketNotificationChannel,
		validateCooldownSeconds,
	}
}

func validateTitle(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if len(ctx.Data.Title) > 80 {
			return validation.NewInvalidInputError("Panel title must be less than 80 characters")
		}

		return nil
	}
}

func validateContent(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if len(ctx.Data.Content) > 4096 {
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
		if len(ctx.Data.ButtonLabel) > 80 {
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

var placeholderPattern = regexp.MustCompile(`%(\w+)%`)

// Discord filters out illegal characters (such as +, $, ") when creating the channel for us
func validateNamingScheme(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.NamingScheme == nil {
			return nil
		}

		if len(*ctx.Data.NamingScheme) > 100 {
			return validation.NewInvalidInputError("Naming scheme must be less than 100 characters")
		}

		// Validate placeholders used
		validPlaceholders := []string{"id", "username", "nickname", "id_padded", "claimed", "claim_indicator", "claimed_by"}
		for _, match := range placeholderPattern.FindAllStringSubmatch(*ctx.Data.NamingScheme, -1) {
			if len(match) < 2 { // Infallible
				return errors.New("Infallible: Regex match length was < 2")
			}

			placeholder := match[1]
			if !utils.Contains(validPlaceholders, placeholder) {
				return validation.NewInvalidInputError(fmt.Sprintf("Invalid naming scheme placeholder: %s", placeholder))
			}
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
	if e == nil || e.Title != nil || e.Description != nil || len(e.Fields) > 0 || e.ImageUrl != nil || e.ThumbnailUrl != nil {
		if e.ImageUrl != nil && (len(*e.ImageUrl) > 255 || !urlRegex.MatchString(*e.ImageUrl)) {
			if *e.ImageUrl == "%avatar_url%" {
				// Ignore validation as it is a placeholder
				return nil
			}

			return validation.NewInvalidInputError("Invalid URL")
		}

		if e.ThumbnailUrl != nil && (len(*e.ThumbnailUrl) > 255 || !urlRegex.MatchString(*e.ThumbnailUrl)) {
			if *e.ThumbnailUrl == "%avatar_url%" {
				// Ignore validation as it is a placeholder
				return nil
			}

			return validation.NewInvalidInputError("Invalid URL")
		}

		return nil
	}

	return validation.NewInvalidInputError("Your embed message does not contain any content")
}

func validateCooldownSeconds(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		if ctx.Data.CooldownSeconds < 0 {
			return validation.NewInvalidInputError("Cooldown must be 0 or greater")
		}
		return nil
	}
}

func validateTicketNotificationChannel(ctx PanelValidationContext) validation.ValidationFunc {
	return func() error {
		// If UseThreads is false, clear the TicketNotificationChannel
		if !ctx.Data.UseThreads {
			ctx.Data.TicketNotificationChannel = nil
			return nil
		}

		// If UseThreads is true, we need either a panel-specific channel OR a global channel
		if ctx.Data.TicketNotificationChannel == nil {
			// Panel wants to use global setting - check if global notification channel exists
			globalCtx, cancel := context.WithTimeout(context.Background(), time.Second*3)
			defer cancel()

			settings, err := dbclient.Client.Settings.Get(globalCtx, ctx.GuildId)
			if err != nil {
				return fmt.Errorf("Failed to fetch global settings: %w", err)
			}

			if settings.TicketNotificationChannel == nil {
				return validation.NewInvalidInputError("You must select a ticket notification channel for this panel, or configure a global ticket notification channel in settings")
			}
		} else {
			// Validate the panel-specific channel
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

		return nil
	}
}
