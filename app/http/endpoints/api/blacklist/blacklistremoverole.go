package api

import (
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func RemoveRoleBlacklistHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	roleId, err := strconv.ParseUint(ctx.Param("role"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorJson(err))
		return
	}

	if err := database.Client.RoleBlacklist.Remove(ctx, guildId, roleId); err != nil {
		ctx.JSON(500, utils.ErrorJson(err))
		return
	}

	ctx.Status(204)
}
