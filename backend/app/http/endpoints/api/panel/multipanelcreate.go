package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/validation"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
	"golang.org/x/sync/errgroup"
)

type panelConfiguration struct {
	PanelId         int     `json:"panel_id"`
	CustomEmojiName *string `json:"custom_emoji_name" validate:"omitempty,max=32"`
	CustomEmojiId   *uint64 `json:"custom_emoji_id,string"`
	CustomLabel     *string `json:"custom_label" validate:"omitempty,max=80"`
	Description     *string `json:"description" validate:"omitempty,max=100"`
}

func getEffectiveLabelForValidation(buttonLabel string, customLabel *string) string {
	if customLabel != nil && *customLabel != "" {
		return *customLabel
	}
	return buttonLabel
}

type multiPanelCreateData struct {
	Name                  string                `json:"name"`
	ChannelId             uint64                `json:"channel_id,string"`
	SelectMenu            bool                  `json:"select_menu"`
	SelectMenuPlaceholder *string               `json:"select_menu_placeholder,omitempty" validate:"omitempty,max=150"`
	Panels                []panelConfiguration  `json:"panels" validate:"dive"`
	Embed                 *types.CustomEmbed    `json:"embed" validate:"omitempty"`
	UsesComponentsV2      bool                  `json:"uses_components_v2"`
	Components            []component.Component `json:"components"`
}

func (d *multiPanelCreateData) IntoMessageData(footer footerPolicy) multiPanelMessageData {
	data := multiPanelMessageData{
		Footer:                footer,
		ChannelId:             d.ChannelId,
		SelectMenu:            d.SelectMenu,
		SelectMenuPlaceholder: d.SelectMenuPlaceholder,
		UsesComponentsV2:      d.UsesComponentsV2,
		Components:            d.Components,
	}

	if !d.UsesComponentsV2 {
		data.Embed = d.Embed.IntoDiscordEmbed()
	}

	return data
}

func validateMultiPanelComponents(data multiPanelCreateData) error {
	if !data.UsesComponentsV2 {
		return nil
	}

	validPanelIds := make(map[int]bool, len(data.Panels))
	for _, p := range data.Panels {
		validPanelIds[p.PanelId] = true
	}

	result, err := validateComponentTree(data.Components, treeRules{validPanelIds: validPanelIds, dropdownMode: data.SelectMenu})
	if err != nil {
		return err
	}

	unplaced := len(validPanelIds) - len(result.placed)
	if result.dropdownUsed && unplaced == 0 {
		return validation.NewInvalidInputError("Dropdown: every panel is already placed as a button, so the dropdown would have nothing to list")
	}

	return checkComponentBudget(result.count, multiPanelReserved(data.SelectMenu, result.dropdownUsed, unplaced))
}

// multiPanelReserved is exactly what buildComponents appends after the authored tree.
func multiPanelReserved(dropdownMode, dropdownPlaced bool, unplaced int) int {
	switch {
	case unplaced == 0 || dropdownPlaced:
		return 0
	case dropdownMode:
		return dropdownReserved
	default:
		rows := (unplaced + maxActionRowChildren - 1) / maxActionRowChildren
		return rows + unplaced
	}
}

// Removing a panel from the list must not fail the save over a placement the user cannot see.
func (d *multiPanelCreateData) stripUnknownPlacements() {
	known := make(map[int]bool, len(d.Panels))
	for _, p := range d.Panels {
		known[p.PanelId] = true
	}

	d.Components = mapComponentTree(d.Components, func(c component.Component) (component.Component, bool) {
		if button, ok := c.ComponentData.(component.Button); ok {
			if panelId, isPlacement := parsePanelPlacement(button.CustomId); isPlacement && !known[panelId] {
				return component.Component{}, false
			}
		}

		return c, true
	})
}

func embedIntoDatabase(e *types.CustomEmbed) *database.CustomEmbedWithFields {
	if e == nil {
		return nil
	}

	dbEmbed, dbEmbedFields := e.IntoDatabaseStruct()
	return &database.CustomEmbedWithFields{CustomEmbed: dbEmbed, Fields: dbEmbedFields}
}

func findPanelConfig(configs []panelConfiguration, panelId int) *panelConfiguration {
	for i := range configs {
		if configs[i].PanelId == panelId {
			return &configs[i]
		}
	}

	return nil
}

func validateDropdownLabels(panels []database.Panel, configs []panelConfiguration) error {
	for _, panel := range panels {
		label := panel.ButtonLabel
		if config := findPanelConfig(configs, panel.PanelId); config != nil {
			label = getEffectiveLabelForValidation(panel.ButtonLabel, config.CustomLabel)
		}

		if label == "" {
			return validation.NewInvalidInputErrorf("Panel '%s' must have a label when using dropdown mode. Please add a custom label or ensure the panel has a button label.", panel.Title)
		}
	}

	return nil
}

func respondValidationError(c *gin.Context, err error, internalMessage string) {
	var validationError *validation.InvalidInputError
	if errors.As(err, &validationError) {
		c.JSON(400, utils.ErrorStr("%s", validationError.Error()))
	} else {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, internalMessage))
	}
}

func MultiPanelCreate(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_PANELS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Panel management is temporarily unavailable. Please try again shortly."))
		return
	}

	var data multiPanelCreateData
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	if data.entersComponentsV2(database.MultiPanel{}) {
		tier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, true, botContext.Token, botContext.RateLimiter)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify premium status"))
			return
		}

		if !componentsV2BuilderEnabled(c, userId, guildId, tier) {
			c.JSON(403, utils.ErrorStr(componentsV2UnavailableMessage))
			return
		}
	}

	if data.UsesComponentsV2 {
		paid, err := hasPaidPremium(c, guildId, botContext)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify premium status"))
			return
		}

		if !paid {
			c.JSON(402, utils.ErrorStr(componentsV2PremiumMessage))
			return
		}

		data.Embed = classicEmbedForV2(data.Embed)
		data.stripUnknownPlacements()
	} else if data.Embed == nil {
		c.JSON(400, utils.ErrorStr("An embed is required for classic messages."))
		return
	}

	if err := validate.Struct(data); err != nil {
		var validationErrors validator.ValidationErrors
		if ok := errors.As(err, &validationErrors); !ok {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "An error occurred while validating the panel"))
			return
		}

		formatted := "Your input contained the following errors:\n" + utils.FormatValidationErrors(validationErrors)
		c.JSON(400, utils.ErrorStr("%s", formatted))
		return
	}

	name, err := normaliseMultiPanelName(data.Name)
	if err != nil {
		respondValidationError(c, err, "Failed to create multi-panel")
		return
	}

	// validate body & get sub-panels
	panels, err := data.doValidations(guildId)
	if err != nil {
		respondValidationError(c, err, "Failed to create multi-panel")
		return
	}

	if data.SelectMenu {
		if err := validateDropdownLabels(panels, data.Panels); err != nil {
			respondValidationError(c, err, "Failed to create multi-panel")
			return
		}
	}

	if err := validateMultiPanelComponents(data); err != nil {
		respondValidationError(c, err, "Failed to create multi-panel")
		return
	}

	footer, err := footerPolicyForGuild(c, guildId, botContext)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
		return
	}

	// Create PanelWithCustomization by combining panels with their configurations
	panelsWithCustom := make([]database.PanelWithCustomization, len(panels))
	for i, panel := range panels {
		panelsWithCustom[i] = database.PanelWithCustomization{
			Panel:           panel,
			CustomLabel:     data.Panels[i].CustomLabel,
			Description:     data.Panels[i].Description,
			CustomEmojiName: data.Panels[i].CustomEmojiName,
			CustomEmojiId:   data.Panels[i].CustomEmojiId,
		}
	}

	if data.UsesComponentsV2 {
		data.Components = normaliseComponentTree(data.Components)
	}

	messageData := data.IntoMessageData(footer)
	messageId, err := messageData.send(botContext, panelsWithCustom)
	if err != nil {
		var unwrapped request.RestError
		if errors.As(err, &unwrapped) {
			if unwrapped.StatusCode == 403 {
				c.JSON(http.StatusBadRequest, utils.ErrorStr("I do not have permission to send messages in the provided channel"))
			} else {
				c.JSON(http.StatusBadRequest, utils.ErrorStr("%s", multiPanelDiscordSubPanelError("send", unwrapped.ApiError.Message)))
			}
		} else {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
		}

		return
	}

	// Any return before the row exists would leave the message in the channel with nothing
	// behind it.
	stored := false
	defer func() {
		if !stored {
			discardMessage(botContext, data.ChannelId, messageId)
		}
	}()

	var componentsJSON *string
	if data.UsesComponentsV2 {
		componentsJSON, err = marshalComponents(data.Components)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
			return
		}
	}

	multiPanel := database.MultiPanel{
		MessageId:             messageId,
		ChannelId:             data.ChannelId,
		GuildId:               guildId,
		SelectMenu:            data.SelectMenu,
		SelectMenuPlaceholder: data.SelectMenuPlaceholder,
		Embed:                 embedIntoDatabase(data.Embed),
		UsesComponentsV2:      data.UsesComponentsV2,
		Components:            componentsJSON,
		Name:                  name,
	}

	multiPanel.Id, err = dbclient.Client.MultiPanels.Create(c, multiPanel)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
		return
	}
	stored = true

	group, _ := errgroup.WithContext(context.Background())
	for i, panel := range panels {
		i := i
		panel := panel

		// Find matching panel config by panel_id
		var panelConfig *panelConfiguration
		for _, cfg := range data.Panels {
			if cfg.PanelId == panel.PanelId {
				panelConfig = &cfg
				break
			}
		}

		group.Go(func() error {
			if panelConfig != nil {
				return dbclient.Client.MultiPanelTargets.Insert(c, multiPanel.Id, panel.PanelId, i, panelConfig.CustomLabel, panelConfig.Description, panelConfig.CustomEmojiName, panelConfig.CustomEmojiId)
			} else {
				return dbclient.Client.MultiPanelTargets.Insert(c, multiPanel.Id, panel.PanelId, i, nil, nil, nil, nil)
			}
		})
	}

	if err := group.Wait(); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionMultiPanelCreate,
		ResourceType: database.AuditResourceMultiPanel,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", multiPanel.Id)),
		NewData:      data,
	})
	c.JSON(200, gin.H{
		"success": true,
		"data":    multiPanel,
	})
}

func (d *multiPanelCreateData) doValidations(guildId uint64) (panels []database.Panel, err error) {
	if !d.UsesComponentsV2 {
		if err := validateEmbed(d.Embed); err != nil {
			return nil, err
		}
	}

	group, _ := errgroup.WithContext(context.Background())

	group.Go(d.validateChannel(guildId))
	group.Go(func() (e error) {
		panels, e = d.validatePanels(guildId)
		return
	})

	err = group.Wait()
	return
}

func (d *multiPanelCreateData) validateChannel(guildId uint64) func() error {
	return func() error {
		// TODO: Use proper context
		channels, err := cache.Instance.GetGuildChannels(context.Background(), guildId)
		if err != nil {
			return err
		}

		var valid bool
		for _, ch := range channels {
			if ch.Id != d.ChannelId {
				continue
			}

			if ch.IsObfuscated() {
				return errChannelNoAccess("The selected channel")
			}

			valid = ch.Type == channel.ChannelTypeGuildText || ch.Type == channel.ChannelTypeGuildNews
			break
		}

		if !valid {
			return validation.NewInvalidInputError("The selected channel does not exist")
		}

		return nil
	}
}

func (d *multiPanelCreateData) validatePanels(guildId uint64) (panels []database.Panel, err error) {
	if len(d.Panels) < 2 {
		err = validation.NewInvalidInputError("a multi-panel must contain at least 2 sub-panels")
		return
	}

	if len(d.Panels) > 15 {
		err = validation.NewInvalidInputError("multi-panels cannot contain more than 15 sub-panels")
		return
	}

	existingPanels, err := dbclient.Client.Panel.GetByGuild(context.Background(), guildId)
	if err != nil {
		return nil, err
	}

	seen := make(map[int]struct{}, len(d.Panels))
	for _, panelConfig := range d.Panels {
		if _, duplicate := seen[panelConfig.PanelId]; duplicate {
			return nil, validation.NewInvalidInputError("each panel can only be added to a multi-panel once")
		}
		seen[panelConfig.PanelId] = struct{}{}

		var valid bool
		// find panel struct
		for _, panel := range existingPanels {
			if panel.PanelId == panelConfig.PanelId {
				valid = true
				panels = append(panels, panel)
			}
		}

		if !valid {
			return nil, validation.NewInvalidInputError("invalid panel ID")
		}
	}

	return
}
