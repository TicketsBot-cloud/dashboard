package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/featureflags"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

type deleteBody struct {
	TagId string `json:"tag_id"`
}

func DeleteTag(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(ctx, "202608_FEATURE_TAGS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		ctx.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Tag management is temporarily unavailable. Please try again shortly."))
		return
	}

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
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch tag from database"))
		return
	}

	if !exists {
		ctx.JSON(404, utils.ErrorStr("Tag not found: %s", body.TagId))
		return
	}

	if tag.ApplicationCommandId != nil {
		botContext, err := botcontext.ContextForGuild(guildId)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
			return
		}

		if err := botContext.DeleteGuildCommand(ctx, guildId, *tag.ApplicationCommandId); err != nil {
			// The command may already be gone; that must not strand the tag.
			if restError, ok := discordError(err); !ok || restError.StatusCode != http.StatusNotFound {
				_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete tag. Please try again."))
				return
			}
		}
	}

	if err := database.Client.Tag.Delete(ctx, guildId, tag.Id); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete tag. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionTagDelete,
		ResourceType: dbmodel.AuditResourceTag,
		ResourceId:   audit.StringPtr(tag.Id),
		OldData:      tag,
	})
	ctx.Status(204)
}
