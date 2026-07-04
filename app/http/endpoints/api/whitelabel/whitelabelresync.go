package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/TicketsBot-cloud/common/tokenchange"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/application"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/worker/bot/command/manager"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// WhitelabelResync reapplies the bot's gateway intents, re-registers its slash commands,
// re-signals the sharder via a token-change publish, and reconciles the whitelabel_guilds
// table against the guilds the bot is actually in. It's a full "reset" of everything the
// dashboard configures for the bot, using the token already stored for the user.
func WhitelabelResync() func(*gin.Context) {
	cm := new(manager.CommandManager)
	cm.RegisterCommands()

	return func(c *gin.Context) {
		userId := c.Keys["userid"].(uint64)

		bot, err := dbclient.Client.Whitelabel.GetByUserId(c, userId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load whitelabel bot"))
			return
		}

		if bot.BotId == 0 {
			c.JSON(http.StatusNotFound, utils.ErrorStr("No bot found"))
			return
		}

		// Fetch the current application to preserve its existing flags
		current, err := rest.GetCurrentApplication(context.Background(), bot.Token, nil)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to reach Discord with the stored token"))
			return
		}

		var currentFlags application.Flag = 0
		if current.Flags != nil {
			currentFlags = *current.Flags
		}
		
		editData := rest.EditCurrentApplicationData{
			Flags: utils.Ptr(application.BuildFlags(
				currentFlags,
				application.FlagIntentGatewayGuildMembersLimited,
				application.FlagGatewayMessageContentLimited,
			)),
		}

		if _, err := rest.EditCurrentApplication(context.Background(), bot.Token, nil, editData); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update the Discord application"))
			return
		}

		if err := tokenchange.PublishTokenChange(redis.Client.Client, tokenchange.TokenChangeData{
			Token: bot.Token,
			NewId: bot.BotId,
			OldId: 0,
		}); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}

		// Re-register slash commands. The cooldown is non-fatal here: the rest of the resync
		// (token reapply + guild sync) still succeeded, and commands were registered recently.
		if err := createInteractions(cm, bot.BotId, bot.Token); err != nil && !errors.Is(err, ErrInteractionCreateCooldown) {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to re-create slash commands"))
			return
		} else if err != nil {
			log.Logger.Warn("Skipped slash command re-registration during resync (on cooldown)", zap.Uint64("bot_id", bot.BotId))
		}

		if err := syncWhitelabelGuilds(c, bot.BotId, bot.Token); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to sync guilds"))
			return
		}

		audit.Log(audit.LogEntry{
			UserId:       userId,
			ActionType:   database.AuditActionWhitelabelResync,
			ResourceType: database.AuditResourceWhitelabel,
			ResourceId:   audit.StringPtr(fmt.Sprintf("%d", bot.BotId)),
		})

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}
