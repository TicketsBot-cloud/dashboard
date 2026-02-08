package api

import (
	"fmt"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type deleteBody struct {
	TagId string `json:"tag_id"`
}

func DeleteTag(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body deleteBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	// Increase max length for characters from other alphabets
	if body.TagId == "" || len(body.TagId) > 100 {
		ctx.JSON(400, utils.ErrorStr("Invalid tag"))
		return
	}

	// Fetch tag to see if we need to delete a guild command
	tag, exists, err := database.Client.Tag.Get(ctx, guildId, body.TagId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr(fmt.Sprintf("Failed to fetch tag from database: %v", err)))
		return
	}

	if !exists {
		ctx.JSON(404, utils.ErrorStr(fmt.Sprintf("Tag not found: %s", body.TagId)))
		return
	}

	if tag.ApplicationCommandId != nil {
		botContext, err := botcontext.ContextForGuild(guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
			return
		}

		if err := botContext.DeleteGuildCommand(ctx, guildId, *tag.ApplicationCommandId); err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to delete tag. Please try again."))
			return
		}
	}

	if err := database.Client.Tag.Delete(ctx, guildId, body.TagId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete tag. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTagDelete,
		ResourceType: dbmodel.AuditResourceTag,
		ResourceId:   audit.StringPtr(body.TagId),
		OldData:      tag,
	})
	ctx.Status(204)
}
