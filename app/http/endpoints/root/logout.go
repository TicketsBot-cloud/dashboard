package root

import (
	"github.com/TicketsBot-cloud/dashboard/app/http/session"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func LogoutHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	if err := session.Store.Clear(userId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to clear session. Please try again."))
		return
	}

	ctx.Status(204)
}
