package serverblacklist

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"go.uber.org/zap"
)

type entryData struct {
	GuildId     string  `json:"guild_id"`
	Name        string  `json:"name,omitempty"`
	Icon        string  `json:"icon,omitempty"`
	Reason      *string `json:"reason"`
	OwnerId     *string `json:"owner_id"`
	RealOwnerId *string `json:"real_owner_id"`
}

func ListHandler(ctx *gin.Context) {
	entries, err := database.Client.ServerBlacklist.ListAllEntries(ctx)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch records. Please try again."))
		return
	}

	guildIds := make([]uint64, len(entries))
	for i, entry := range entries {
		guildIds[i] = entry.GuildId
	}

	// AdminLayout's access check calls this route, so a cache failure must not 500 it
	guilds, err := cache.Instance.GetGuilds(ctx, guildIds)
	if err != nil {
		log.Logger.Warn("Failed to resolve blacklisted servers", zap.Error(err))
	}

	result := make([]entryData, len(entries))
	for i, entry := range entries {
		data := entryData{
			GuildId: strconv.FormatUint(entry.GuildId, 10),
			Reason:  entry.Reason,
		}

		if guild, ok := guilds[entry.GuildId]; ok {
			data.Name = guild.Name
			data.Icon = guild.Icon
		}

		if entry.OwnerId != nil {
			s := strconv.FormatUint(*entry.OwnerId, 10)
			data.OwnerId = &s
		}

		if entry.RealOwnerId != nil {
			s := strconv.FormatUint(*entry.RealOwnerId, 10)
			data.RealOwnerId = &s
		}

		result[i] = data
	}

	ctx.JSON(200, result)
}
