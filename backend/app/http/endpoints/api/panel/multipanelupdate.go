package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v4"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"golang.org/x/sync/errgroup"
)

func MultiPanelUpdate(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_PANELS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Panel management is temporarily unavailable. Please try again shortly."))
		return
	}

	// parse body
	var data multiPanelCreateData
	keys, err := bindJSONWithKeys(c, &data)
	if err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request body: malformed JSON"))
		return
	}

	// parse panel ID
	panelId, err := strconv.Atoi(c.Param("panelid"))
	if err != nil {
		c.JSON(400, utils.ErrorStr("Missing panel ID"))
		return
	}

	// retrieve panel from DB
	multiPanel, ok, err := dbclient.Client.MultiPanels.Get(c, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to parse request data"))
		return
	}

	// check panel exists
	if !ok {
		c.JSON(404, utils.ErrorStr("No panel with the provided ID found"))
		return
	}

	// check panel is in the same guild
	if guildId != multiPanel.GuildId {
		c.JSON(403, utils.ErrorStr("Guild ID doesn't match"))
		return
	}

	if err := data.keepStoredWhenAbsent(keys, multiPanel); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
		return
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	if _, ok := componentsV2Gate(c, userId, guildId, botContext, data.entersComponentsV2(multiPanel), data.UsesComponentsV2, nil, nil, "Failed to verify premium status"); !ok {
		return
	}

	if data.UsesComponentsV2 {
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
		respondValidationError(c, err, "Failed to update multi-panel")
		return
	}

	// validate body & get sub-panels
	panels, err := data.doValidations(guildId)
	if err != nil {
		respondValidationError(c, err, "Failed to update multi-panel")
		return
	}

	if data.SelectMenu {
		if err := validateDropdownLabels(panels, data.Panels); err != nil {
			respondValidationError(c, err, "Failed to update multi-panel")
			return
		}
	}

	for _, panel := range panels {
		if panel.CustomId == "" {
			panel.CustomId, err = utils.RandString(30)
			if err != nil {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
				return
			}

			if err := dbclient.Client.Panel.Update(c, panel); err != nil {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
				return
			}
		}
	}

	if err := validateMultiPanelComponents(data); err != nil {
		respondValidationError(c, err, "Failed to update multi-panel")
		return
	}

	footer, err := footerPolicyForGuild(c, guildId, botContext)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
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
	var messageId uint64

	reposted := resendsMessage(multiPanel.ChannelId, data.ChannelId, multiPanel.UsesComponentsV2, data.UsesComponentsV2)
	if reposted {
		messageId, err = messageData.send(botContext, panelsWithCustom)
		if err != nil {
			var unwrapped request.RestError
			if errors.As(err, &unwrapped) {
				if unwrapped.StatusCode == 403 {
					c.JSON(http.StatusBadRequest, utils.ErrorStr("I do not have permission to send messages in the provided channel"))
				} else {
					c.JSON(http.StatusBadRequest, utils.ErrorStr("%s", multiPanelDiscordSubPanelError("send", unwrapped.ApiError.Message)))
				}
			} else {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
			}

			return
		}
	} else {
		// Try to edit existing message
		err = messageData.edit(botContext, multiPanel.MessageId, panelsWithCustom)
		if err != nil {
			var unwrapped request.RestError
			if shouldRepost(err, !messageData.UsesComponentsV2, liveComponentsV2(botContext, multiPanel.ChannelId, multiPanel.MessageId)) {
				reposted = true
				messageId, err = messageData.send(botContext, panelsWithCustom)
				if err != nil {
					var unwrapped2 request.RestError
					if errors.As(err, &unwrapped2) {
						if unwrapped2.StatusCode == 403 {
							c.JSON(http.StatusBadRequest, utils.ErrorStr("I do not have permission to send messages in the provided channel"))
						} else {
							c.JSON(http.StatusBadRequest, utils.ErrorStr("%s", multiPanelDiscordSubPanelError("send", unwrapped2.ApiError.Message)))
						}
					} else {
						_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
					}

					return
				}
			} else if errors.As(err, &unwrapped) && unwrapped.StatusCode == 403 {
				c.JSON(http.StatusBadRequest, utils.ErrorStr("I do not have permission to edit messages in the provided channel"))
				return
			} else if errors.As(err, &unwrapped) {
				c.JSON(http.StatusBadRequest, utils.ErrorStr("%s", multiPanelDiscordSubPanelError("edit", unwrapped.ApiError.Message)))
				return
			} else {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
				return
			}
		} else {
			messageId = multiPanel.MessageId
		}
	}

	stored := false
	defer func() {
		if reposted && !stored {
			discardMessage(botContext, data.ChannelId, messageId)
		}
	}()

	// update DB
	componentsJSON, err := componentsToStore(data.UsesComponentsV2, data.Components, multiPanel.Components)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
		return
	}

	dbEmbed := embedIntoDatabase(data.Embed)
	if data.UsesComponentsV2 && dbEmbed == nil {
		dbEmbed = multiPanel.Embed
	}

	updated := database.MultiPanel{
		Id:                    multiPanel.Id,
		MessageId:             messageId,
		ChannelId:             data.ChannelId,
		GuildId:               guildId,
		SelectMenu:            data.SelectMenu,
		SelectMenuPlaceholder: data.SelectMenuPlaceholder,
		Embed:                 dbEmbed,
		UsesComponentsV2:      data.UsesComponentsV2,
		Components:            componentsJSON,
		Name:                  name,
	}

	err = dbclient.Client.MultiPanels.BeginFunc(c, func(tx pgx.Tx) error {
		if err := dbclient.Client.MultiPanels.UpdateWithTx(c, tx, multiPanel.Id, updated); err != nil {
			return err
		}

		if err := dbclient.Client.MultiPanels.UpdateComponentsV2WithTx(c, tx, multiPanel.Id, updated.UsesComponentsV2, updated.Components); err != nil {
			return err
		}

		if err := dbclient.Client.MultiPanels.SetNameWithTx(c, tx, multiPanel.Id, updated.Name); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
		return
	}

	stored = true
	if reposted {
		ctx, cancel := app.DefaultContext()
		_ = rest.DeleteMessage(ctx, botContext.Token, botContext.RateLimiter, multiPanel.ChannelId, multiPanel.MessageId)
		cancel()
	}

	// TODO: one query for ACID purposes
	// delete old targets
	if err := dbclient.Client.MultiPanelTargets.DeleteAll(c, multiPanel.Id); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
		return
	}

	// insert new targets
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
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionMultiPanelUpdate,
		ResourceType: database.AuditResourceMultiPanel,
		ResourceId:   audit.StringPtr(strconv.Itoa(panelId)),
		OldData:      multiPanel,
		NewData:      updated,
	})
	c.JSON(200, gin.H{
		"success": true,
		"data":    updated,
	})
}
