package api

import (
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func RemoveUserBlacklistHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	userId, err := strconv.ParseUint(ctx.Param("user"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to remove from blacklist. Please try again."))
		return
	}

	if err := database.Client.Blacklist.Remove(ctx, guildId, userId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to remove from blacklist. Please try again."))
		return
	}

	ctx.Status(204)
}
