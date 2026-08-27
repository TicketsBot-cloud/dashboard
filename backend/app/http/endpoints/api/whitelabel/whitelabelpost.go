package api

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/common/tokenchange"
	"github.com/TicketsBot-cloud/common/whitelabel"
	"github.com/TicketsBot-cloud/common/whitelabeldelete"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/application"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/TicketsBot-cloud/worker/bot/command/manager"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
)

func WhitelabelPost() func(*gin.Context) {
	cm := new(manager.CommandManager)
	cm.RegisterCommands()

	return func(c *gin.Context) {
		userId := c.Keys["userid"].(uint64)

		if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_WHITELABEL", featureflags.ForDashboardUser(userId)) {
			c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Whitelabel management is temporarily unavailable. Please try again shortly."))
			return
		}

		type whitelabelPostBody struct {
			Token string `json:"token"`
		}

		// Get token
		var data whitelabelPostBody
		if err := c.ShouldBindJSON(&data); err != nil {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body: malformed JSON"))
			return
		}

		bot, err := fetchApplication(c, data.Token)
		if err != nil {
			var restError request.RestError
			if errors.Is(err, errInvalidToken) {
				c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid token"))
			} else if errors.As(err, &restError) && restError.StatusCode == http.StatusUnauthorized {
				c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid token"))
			} else {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to parse request data"))
			}

			return
		}

		// Check if this is a different token
		existing, err := dbclient.Client.Whitelabel.GetByUserId(c, userId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}

		// Take existing whitelabel bot offline, if it is a different bot
		if existing.BotId != 0 && existing.BotId != bot.Id {
			whitelabeldelete.Publish(redis.Client.Client, existing.BotId)
		}

		// Set token in DB so that http-gateway can use it when Discord validates the interactions endpoint
		// TODO: Use a transaction
		if err := dbclient.Client.Whitelabel.Set(c, database.WhitelabelBot{
			UserId:    userId,
			BotId:     bot.Id,
			PublicKey: bot.VerifyKey,
			Token:     data.Token,
		}); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}

		// Set intents
		var currentFlags application.Flag = 0
		if bot.Flags != nil {
			currentFlags = *bot.Flags
		}

		editData := rest.EditCurrentApplicationData{
			Flags:                   whitelabel.DesiredIntentFlags(currentFlags),
			InteractionsEndpointUrl: utils.Ptr(fmt.Sprintf("%s/handle/%d", config.Conf.Bot.InteractionsBaseUrl, bot.Id)),
		}

		if _, err := rest.EditCurrentApplication(c, data.Token, nil, editData); err != nil {
			// TODO: Use a transaction
			if _, deleteErr := dbclient.Client.Whitelabel.Delete(c, bot.Id); deleteErr != nil {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(deleteErr, "Failed to process request"))
				return
			}

			if whitelabel.IsIntentsRejection(err) {
				c.JSON(http.StatusBadRequest, utils.ErrorStr(whitelabel.IntentsRejectedMessage))
				return
			}

			_ = c.AbortWithError(http.StatusInternalServerError, app.NewServerError(err))
			return
		}

		tokenChangeData := tokenchange.TokenChangeData{
			Token: data.Token,
			NewId: bot.Id,
			OldId: 0,
		}

		if err := tokenchange.PublishTokenChange(redis.Client.Client, tokenChangeData); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}

		if err := createInteractions(cm, bot.Id, data.Token); err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
			return
		}

		if err := whitelabel.SyncGuilds(c, dbclient.Client, data.Token, bot.Id); err != nil {
			log.Logger.Error("Failed to sync whitelabel guilds", zap.Error(err), zap.Uint64("bot_id", bot.Id))
		}

		audit.Log(audit.LogEntry{
			UserId:       userId,
			ActionType:   database.AuditActionWhitelabelCreate,
			ResourceType: database.AuditResourceWhitelabel,
			ResourceId:   audit.StringPtr(fmt.Sprintf("%d", bot.Id)),
		})
		c.JSON(200, gin.H{
			"success":  true,
			"bot":      bot,
			"username": bot.Bot.Username,
		})
	}
}

var errInvalidToken = fmt.Errorf("invalid token")

func validateToken(token string) bool {
	split := strings.Split(token, ".")

	// Check for 2 dots
	if len(split) != 3 {
		return false
	}

	// Validate bot ID
	// TODO: We could check the date on the snowflake
	idRaw, err := base64.RawStdEncoding.DecodeString(split[0])
	if err != nil {
		return false
	}

	if _, err := strconv.ParseUint(string(idRaw), 10, 64); err != nil {
		return false
	}

	// Validate time
	if _, err := base64.RawURLEncoding.DecodeString(split[1]); err != nil {
		return false
	}

	return true
}

func fetchApplication(ctx context.Context, token string) (*application.Application, error) {
	if !validateToken(token) {
		return nil, errInvalidToken
	}

	// Validate token + get bot ID
	// TODO: Use proper context
	app, err := rest.GetCurrentApplication(ctx, token, nil)
	if err != nil {
		return nil, err
	}

	if app.Id == 0 {
		return nil, errInvalidToken
	}

	return &app, nil
}
