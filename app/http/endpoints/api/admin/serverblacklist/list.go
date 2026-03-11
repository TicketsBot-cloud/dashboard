package serverblacklist

import (
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

type entryData struct {
	GuildId     string  `json:"guild_id"`
	Reason      *string `json:"reason"`
	OwnerId     *string `json:"owner_id"`
	RealOwnerId *string `json:"real_owner_id"`
}

func ListHandler(ctx *gin.Context) {
	entries, err := database.Client.ServerBlacklist.ListAllEntries(ctx)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	result := make([]entryData, len(entries))
	for i, entry := range entries {
		data := entryData{
			GuildId: strconv.FormatUint(entry.GuildId, 10),
			Reason:  entry.Reason,
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
