package root

import (
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/session"
	"github.com/gin-gonic/gin"
)

func LogoutHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	if err := session.Store.Clear(userId); err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to clear session. Please try again."))
		return
	}

	ctx.Status(204)
}
