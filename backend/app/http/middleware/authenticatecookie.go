package middleware

import (
	"github.com/gin-gonic/contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func AuthenticateCookie(ctx *gin.Context) {
	store := sessions.Default(ctx)
	if store == nil {
		ctx.Redirect(302, "/login")
		ctx.Abort()
		return
	}

	if !utils.IsLoggedIn(store) {
		ctx.Redirect(302, "/login")
		ctx.Abort()
		return
	}

	ctx.Keys["userid"] = utils.GetUserId(store)
}
