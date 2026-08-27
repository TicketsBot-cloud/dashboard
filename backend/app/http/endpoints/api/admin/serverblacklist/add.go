package serverblacklist

import (
	"fmt"
	"strconv"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

type addBody struct {
	Reason *string `json:"reason"`
}

func AddHandler(ctx *gin.Context) {
	authUserId := ctx.Keys["userid"].(uint64)
	guildId, err := strconv.ParseUint(ctx.Param("guildid"), 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	var body addBody
	// Body is optional - reason may be nil
	_ = ctx.BindJSON(&body)

	if err := database.Client.ServerBlacklist.Add(ctx, guildId, body.Reason, nil, nil); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	audit.LogStaff(audit.LogEntry{
		UserId:       authUserId,
		ActionType:   dbmodel.AuditActionServerBlacklistAdd,
		ResourceType: dbmodel.AuditResourceServerBlacklist,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d", guildId)),
		NewData:      map[string]any{"guild_id": guildId, "reason": body.Reason},
	})
	ctx.Status(204)
}
