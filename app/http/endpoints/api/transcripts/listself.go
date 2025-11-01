package api

import (
	"context"
	"errors"
	"strconv"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	gdlutils "github.com/TicketsBot-cloud/gdl/utils"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

// ListSelfTranscripts TODO: Give user option to rate ticket
func ListSelfTranscripts(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	page, err := strconv.Atoi(ctx.Query("page"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	var offset int
	if page > 1 {
		offset = pageLimit * (page - 1)
	}

	opts := database.TicketQueryOptions{
		UserIds: []uint64{userId},
		Open:    gdlutils.BoolPtr(false),
		Order:   database.OrderTypeDescending,
		Limit:   pageLimit,
		Offset:  offset,
	}

	tickets, err := dbclient.Client.Tickets.GetByOptions(ctx, opts)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	type TranscriptData struct {
		TicketId  int    `json:"ticket_id"`
		GuildId   uint64 `json:"guild_id"`
		GuildName string `json:"guild_name"`
	}

	// TODO: Not O(n)
	data := make([]TranscriptData, len(tickets))

	group, _ := errgroup.WithContext(context.Background())
	for i, ticket := range tickets {
		group.Go(func() error {
			var guildName string
			{
				guild, err := cache.Instance.GetGuild(context.Background(), ticket.GuildId)
				if err == nil {
					guildName = guild.Name
				} else if errors.Is(err, cache2.ErrNotFound) {
					guildName = "Unknown server"
				} else {
					return err
				}
			}

			data[i] = TranscriptData{
				TicketId:  ticket.Id,
				GuildId:   ticket.GuildId,
				GuildName: guildName,
			}

			return nil
		})
	}

	if err := group.Wait(); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	ctx.JSON(200, data)
}
