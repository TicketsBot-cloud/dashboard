package botstaff

import (
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func RemoveBotStaffHandler(ctx *gin.Context) {
	userId, err := strconv.ParseUint(ctx.Param("userid"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to delete record. Please try again."))
		return
	}

	if err := database.Client.BotStaff.Delete(ctx, userId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete record. Please try again."))
		return
	}

	ctx.Status(204)
}
