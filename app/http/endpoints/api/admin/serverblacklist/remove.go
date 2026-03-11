package serverblacklist

import (
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func RemoveHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)
	guildId, err := strconv.ParseUint(ctx.Param("guildid"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to delete record. Please try again."))
		return
	}

	if err := database.Client.ServerBlacklist.Delete(ctx, guildId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete record. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionServerBlacklistRemove,
		ResourceType: dbmodel.AuditResourceServerBlacklist,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", guildId)),
		OldData:      map[string]any{"guild_id": guildId},
	})
	ctx.Status(204)
}
