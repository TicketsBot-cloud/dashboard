package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"golang.org/x/sync/errgroup"
)

func MultiPanelUpdate(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	// parse body
	var data multiPanelCreateData
	if err := c.ShouldBindJSON(&data); err != nil {
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

	if err := validate.Struct(data); err != nil {
		var validationErrors validator.ValidationErrors
		if ok := errors.As(err, &validationErrors); !ok {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "An error occurred while validating the panel"))
			return
		}

		formatted := "Your input contained the following errors:\n" + utils.FormatValidationErrors(validationErrors)
		c.JSON(400, utils.ErrorStr(formatted))
		return
	}

	// validate body & get sub-panels
	panels, err := data.doValidations(guildId)
	if err != nil {
		c.JSON(400, utils.ErrorStr("Failed to update multi-panel. Please try again."))
		return
	}

	// Validate labels for dropdown mode
	if data.SelectMenu {
		for _, panel := range panels {
			var panelConfig *panelConfiguration
			for _, cfg := range data.Panels {
				if panel.PanelId == cfg.PanelId {
					panelConfig = &cfg
					break
				}
			}

			var effectiveLabel string
			if panelConfig != nil {
				effectiveLabel = getEffectiveLabelForValidation(panel.ButtonLabel, panelConfig.CustomLabel)
			} else {
				effectiveLabel = panel.ButtonLabel
			}

			if effectiveLabel == "" {
				c.JSON(400, utils.ErrorStr(fmt.Sprintf("Panel '%s' must have a label when using dropdown mode. Please add a custom label or ensure the panel has a button label.", panel.Title)))
				return
			}
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

	// get bot context
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	// delete old message
	ctx, cancel := app.DefaultContext()
	defer cancel()

	if err := rest.DeleteMessage(ctx, botContext.Token, botContext.RateLimiter, multiPanel.ChannelId, multiPanel.MessageId); err != nil {
		var unwrapped request.RestError
		if !errors.As(err, &unwrapped) || !unwrapped.IsClientError() {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
			return
		}
	}
	cancel()

	// get premium status
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, true, botContext.Token, botContext.RateLimiter)
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

	// send new message
	messageData := data.IntoMessageData(premiumTier > premium.None)
	messageId, err := messageData.send(botContext, panelsWithCustom)
	if err != nil {
		var unwrapped request.RestError
		if errors.As(err, &unwrapped) && unwrapped.StatusCode == 403 {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("I do not have permission to send messages in the provided channel"))
		} else {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
		}

		return
	}

	// update DB
	dbEmbed, dbEmbedFields := data.Embed.IntoDatabaseStruct()
	updated := database.MultiPanel{
		Id:                    multiPanel.Id,
		MessageId:             messageId,
		ChannelId:             data.ChannelId,
		GuildId:               guildId,
		SelectMenu:            data.SelectMenu,
		SelectMenuPlaceholder: data.SelectMenuPlaceholder,
		Embed: &database.CustomEmbedWithFields{
			CustomEmbed: dbEmbed,
			Fields:      dbEmbedFields,
		},
	}

	if err = dbclient.Client.MultiPanels.Update(c, multiPanel.Id, updated); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update multi-panel"))
		return
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
		"data":    multiPanel,
	})
}
