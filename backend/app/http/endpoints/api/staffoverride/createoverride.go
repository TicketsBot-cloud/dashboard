package api

import (
	"fmt"
	"time"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

type createOverrideBody struct {
	TimePeriod int `json:"time_period"`
}

func CreateOverrideHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body createOverrideBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request body: malformed JSON"))
		fmt.Println(err.Error())
		return
	}

	expires := time.Now().Add(time.Hour * time.Duration(body.TimePeriod))
	if err := database.Client.StaffOverride.Set(ctx, guildId, expires); err != nil {
		ctx.JSON(500, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionStaffOverrideCreate,
		ResourceType: dbmodel.AuditResourceStaffOverride,
		NewData:      map[string]interface{}{"time_period": body.TimePeriod},
	})
	ctx.Status(204)
}
