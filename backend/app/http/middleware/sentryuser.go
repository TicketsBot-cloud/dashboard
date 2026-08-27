package middleware

import (
	"fmt"

	"github.com/getsentry/sentry-go"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
)

func SentryUser(ctx *gin.Context) {
	hub := sentrygin.GetHubFromContext(ctx)
	if hub == nil {
		return
	}

	hub.ConfigureScope(func(scope *sentry.Scope) {
		user := sentry.User{}

		if userId, ok := ctx.Keys["userid"]; ok {
			user.ID = fmt.Sprintf("user:%d", userId.(uint64))
		}

		if guildId, ok := ctx.Keys["guildid"]; ok {
			if user.Data == nil {
				user.Data = make(map[string]string)
			}
			user.Data["guild_id"] = fmt.Sprintf("%d", guildId.(uint64))
		}

		if user.ID != "" {
			scope.SetUser(user)
		}
	})
}
