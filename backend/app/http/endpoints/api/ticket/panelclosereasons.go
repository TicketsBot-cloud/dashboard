package api

import (
	"context"
	"strings"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"go.uber.org/zap"
)

const closeReasonNotPredefined = "Close reason must be one of the panel's predefined close reasons"

func resolveCloseReason(ctx context.Context, ticket dbmodel.Ticket, reason string) (string, bool) {
	if strings.TrimSpace(reason) == "" || ticket.PanelId == nil {
		return reason, true
	}

	closeReasons, err := database.Client.PanelCloseReasons.Get(ctx, *ticket.PanelId)
	if err != nil {
		log.Logger.Error("Failed to load panel close reasons", zap.Int("panel_id", *ticket.PanelId), zap.Error(err))
		return reason, true
	}

	return closeReasons.Resolve(reason)
}

func getGuildCloseReasons(ctx context.Context, guildId uint64, reason string) map[int]dbmodel.PanelCloseReasons {
	if strings.TrimSpace(reason) == "" {
		return nil
	}

	closeReasons, err := database.Client.PanelCloseReasons.GetAllForGuild(ctx, guildId)
	if err != nil {
		log.Logger.Error("Failed to load panel close reasons", zap.Uint64("guild_id", guildId), zap.Error(err))
		return nil
	}

	return closeReasons
}

func resolveCloseReasonFrom(panelCloseReasons map[int]dbmodel.PanelCloseReasons, ticket dbmodel.Ticket, reason string) (string, bool) {
	if ticket.PanelId == nil {
		return reason, true
	}

	closeReasons, ok := panelCloseReasons[*ticket.PanelId]
	if !ok {
		return reason, true
	}

	return closeReasons.Resolve(reason)
}
