package api_overview

import (
	"context"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type basicOverviewResponse struct {
	TotalTickets  uint64                 `json:"total_tickets"`
	OpenTickets   uint64                 `json:"open_tickets"`
	TicketsPerDay []database.CountOnDate `json:"tickets_per_day"`
}

func GetBasicOverviewHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	allPanels, panelIds, err := utils.GetPanelAccess(ctx, guildId, ctx.Keys["userid"].(uint64))
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to check panel access"))
		return
	}

	var filter *database.PanelFilter
	if !allPanels {
		filter = utils.ScopePanelFilter(nil, panelIds)
	}

	var resp basicOverviewResponse

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	group, groupCtx := errgroup.WithContext(timeoutCtx)

	group.Go(func() error {
		count, err := dbclient.Client.Tickets.GetTotalTicketCountFiltered(groupCtx, guildId, filter)
		if err != nil {
			return err
		}
		resp.TotalTickets = uint64(count)
		return nil
	})

	group.Go(func() error {
		count, err := dbclient.Client.Tickets.CountOpenTickets(groupCtx, guildId, filter)
		if err != nil {
			return err
		}
		resp.OpenTickets = uint64(count)
		return nil
	})

	group.Go(func() (err error) {
		resp.TicketsPerDay, err = dbclient.Client.Tickets.GetTicketsPerDayFiltered(groupCtx, guildId, 7, filter)
		return
	})

	if err := group.Wait(); err != nil {
		log.Logger.Error("Failed to retrieve overview data", zap.Uint64("guild_id", guildId), zap.Error(err))
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve overview data. Please try again later."))
		return
	}

	if resp.TicketsPerDay == nil {
		resp.TicketsPerDay = make([]database.CountOnDate, 0)
	}

	ctx.JSON(200, resp)
}
