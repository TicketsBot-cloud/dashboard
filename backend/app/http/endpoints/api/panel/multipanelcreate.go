package api

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/common/premium"
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

// validateMultiPanelComponents enforces the type-allowlist and reserved-budget check on
// a multi-panel's Components V2 tree. Premium gating is handled separately by the caller
// with an explicit 402, matching the free-tier quota check in panelcreate.go.
//
// A panel referenced by a placeholder inside the tree (a button carrying PanelId, or the
// dropdown carrying IsPanelSelect) is excluded from the reserved system-row budget below,
// since the backend no longer appends it to the default row - see buildSystemComponents
// in multipanelmessagedata.go. validPanelIds is built from data.Panels, which
// validatePanels has already ownership-checked against this guild earlier in the same
// request's validation pipeline (doValidations runs before this function is ever
// called), so every ID accepted here is guaranteed to belong to this guild's own panels.
func validateMultiPanelComponents(data multiPanelCreateData) error {
	if !data.UsesComponentsV2 {
		return nil
	}

	validPanelIds := make(map[int]bool, len(data.Panels))
	for _, p := range data.Panels {
		validPanelIds[p.PanelId] = true
	}

	if err := validateComponentTree(data.Components, validPanelIds, data.SelectMenu); err != nil {
		return err
	}

	placed, hasSelect, err := collectPlacedPanelIds(data.Components)
	if err != nil {
		return err
	}

	unplacedCount := 0
	for _, p := range data.Panels {
		if !placed[p.PanelId] {
			unplacedCount++
		}
	}

	if hasSelect && unplacedCount == 0 {
		return validation.NewInvalidInputError("The panel dropdown placed in the message must have at least one panel left to list; every panel in this multi-panel is already placed elsewhere in the message")
	}

	var reservedTopLevel, reservedTotal int
	if data.SelectMenu {
		if !hasSelect {
			// 1 row + 1 select menu, covering every panel not already placed elsewhere via
			// a panel button. A placed dropdown reserves nothing extra here: it is already
			// counted as part of the authored tree by countComponents (row + select = the
			// same 1 top-level / 2 total this reservation exists to cover).
			reservedTopLevel, reservedTotal = 1, 2
		}
	} else {
		n := unplacedCount
		rows := int(math.Ceil(float64(n) / 5))
		reservedTopLevel, reservedTotal = rows, rows+n
	}

	return validateComponentTreeBudget(data.Components, reservedTopLevel, reservedTotal)
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

	if data.UsesComponentsV2 {
		// The classic embed is never read for a Components V2 message (see IntoMessageData
		// and the persistence branch below, both gated on !UsesComponentsV2) - the frontend
		// still submits whatever embed state it has regardless of message mode, so validating
		// its contents here would reject a Components V2 multi-panel over fields that are
		// never sent to Discord or stored.
		data.Embed = nil
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

	if err := validateResourceName(data.Name, "Multi-panel"); err != nil {
		var validationError *validation.InvalidInputError
		if errors.As(err, &validationError) {
			c.JSON(400, utils.ErrorStr("%s", validationError.Error()))
		} else {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
		}
		return
	}

	// validate body & get sub-panels
	panels, err := data.doValidations(guildId)
	if err != nil {
		var validationError *validation.InvalidInputError
		if errors.As(err, &validationError) {
			c.JSON(400, utils.ErrorStr("%s", validationError.Error()))
		} else {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
		}
		return
	}

	// Validate labels for dropdown mode
	if data.SelectMenu {
		for _, panel := range panels {
			panelConfig := data.Panels[0]
			for i, cfg := range data.Panels {
				if panels[i].PanelId == cfg.PanelId {
					panelConfig = cfg
					break
				}
			}

			effectiveLabel := getEffectiveLabelForValidation(panel.ButtonLabel, panelConfig.CustomLabel)

			if effectiveLabel == "" {
				formatted := fmt.Sprintf("Panel '%s' must have a label when using dropdown mode. Please add a custom label or ensure the panel has a button label.", panel.Title)
				c.JSON(400, utils.ErrorStr("%s", formatted))
				return
			}
		}
	}

	// get bot context
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify premium status"))
		return
	}

	if data.UsesComponentsV2 && premiumTier == premium.None {
		c.JSON(402, utils.ErrorStr("Component-based multi-panel messages require premium. Purchase premium to unlock this feature."))
		return
	}

	if err := validateMultiPanelComponents(data); err != nil {
		var validationError *validation.InvalidInputError
		if errors.As(err, &validationError) {
			c.JSON(400, utils.ErrorStr("%s", validationError.Error()))
		} else {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
		}
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

	var dbEmbedWithFields *database.CustomEmbedWithFields
	var componentsJSON *string
	if data.UsesComponentsV2 {
		componentsJSON, err = marshalComponents(data.Components)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
			return
		}
	} else {
		dbEmbed, dbEmbedFields := data.Embed.IntoDatabaseStruct()
		dbEmbedWithFields = &database.CustomEmbedWithFields{
			CustomEmbed: dbEmbed,
			Fields:      dbEmbedFields,
		}
	}

	// Validated non-empty by validateResourceName; trimmed here for consistent storage.
	name := strings.TrimSpace(data.Name)

	multiPanel := database.MultiPanel{
		MessageId:             messageId,
		ChannelId:             data.ChannelId,
		GuildId:               guildId,
		SelectMenu:            data.SelectMenu,
		SelectMenuPlaceholder: data.SelectMenuPlaceholder,
		Embed:                 dbEmbedWithFields,
		UsesComponentsV2:      data.UsesComponentsV2,
		Components:            componentsJSON,
		Name:                  &name,
	}

	multiPanel.Id, err = dbclient.Client.MultiPanels.Create(c, multiPanel)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create multi-panel"))
		return
	}

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
	if err := validateEmbed(d.Embed); err != nil {
		return nil, err
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
			if ch.Id == d.ChannelId && (ch.Type == channel.ChannelTypeGuildText || ch.Type == channel.ChannelTypeGuildNews) {
				valid = true
				break
			}
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

	for _, panelConfig := range d.Panels {
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
