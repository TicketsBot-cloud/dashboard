package submissionblacklist

import (
	"net/http"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
)

type entryData struct {
	TargetType dbmodel.SubmissionTargetType `json:"target_type"`
	TargetId   uint64                       `json:"target_id,string"`
	Name       string                       `json:"name,omitempty"`
	AvatarUrl  string                       `json:"avatar_url,omitempty"`
	Icon       string                       `json:"icon,omitempty"`
	Reason     *string                      `json:"reason"`
}

func ListHandler(feature dbmodel.SubmissionFeature) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		entries, err := database.Client.SubmissionBlacklist.List(ctx, feature)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch records. Please try again."))
			return
		}

		userIds := make([]uint64, 0, len(entries))
		guildIds := make([]uint64, 0, len(entries))
		for _, entry := range entries {
			switch entry.TargetType {
			case dbmodel.SubmissionTargetUser:
				userIds = append(userIds, entry.TargetId)
			case dbmodel.SubmissionTargetGuild:
				guildIds = append(guildIds, entry.TargetId)
			}
		}

		users, err := cache.Instance.GetUsers(ctx, userIds)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to resolve blacklisted users"))
			return
		}

		guilds, err := cache.Instance.GetGuilds(ctx, guildIds)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to resolve blacklisted servers"))
			return
		}

		result := make([]entryData, len(entries))
		for i, entry := range entries {
			result[i] = entryData{
				TargetType: entry.TargetType,
				TargetId:   entry.TargetId,
				Reason:     entry.Reason,
			}

			switch entry.TargetType {
			case dbmodel.SubmissionTargetUser:
				if user, ok := users[entry.TargetId]; ok {
					result[i].Name = user.Username
					result[i].AvatarUrl = user.AvatarUrl(256)
				}
			case dbmodel.SubmissionTargetGuild:
				if guild, ok := guilds[entry.TargetId]; ok {
					result[i].Name = guild.Name
					result[i].Icon = guild.Icon
				}
			}
		}

		ctx.JSON(http.StatusOK, result)
	}
}
