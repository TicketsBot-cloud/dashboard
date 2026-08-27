package root

import (
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/session"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func LogoutHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	if err := session.Store.Clear(userId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to clear session. Please try again."))
		return
	}

	ctx.Status(204)
}
