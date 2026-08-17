package admin

import (
	"context"

	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
)

type AdminTier string

const (
	AdminTierNone   AdminTier = ""
	AdminTierHelper AdminTier = "helper"
	AdminTierAdmin  AdminTier = "admin"
	AdminTierOwner  AdminTier = "owner"
)

func IsBotOwner(id uint64) bool {
	return config.Conf.Owner != 0 && config.Conf.Owner == id
}

func IsBotAdmin(ctx context.Context, id uint64) bool {
	if IsBotOwner(id) {
		return true
	}

	tier, err := dbclient.Client.BotStaff.GetTier(ctx, id)
	if err != nil {
		return false
	}

	return tier == database.BotStaffTierAdmin
}

func IsBotHelper(ctx context.Context, id uint64) bool {
	if IsBotOwner(id) {
		return true
	}

	tier, err := dbclient.Client.BotStaff.GetTier(ctx, id)
	if err != nil {
		return false
	}

	return tier != ""
}

func HasGlobalView(ctx context.Context, id uint64) bool {
	if IsBotOwner(id) {
		return true
	}

	globalView, err := dbclient.Client.BotStaff.HasGlobalView(ctx, id)
	if err != nil {
		return false
	}

	return globalView
}

func GetAdminTier(ctx context.Context, id uint64) AdminTier {
	if IsBotOwner(id) {
		return AdminTierOwner
	}

	tier, err := dbclient.Client.BotStaff.GetTier(ctx, id)
	if err != nil {
		return AdminTierNone
	}

	return TierFromBotStaff(tier)
}

func TierFromBotStaff(tier database.BotStaffTier) AdminTier {
	switch tier {
	case database.BotStaffTierAdmin:
		return AdminTierAdmin
	case database.BotStaffTierHelper:
		return AdminTierHelper
	default:
		return AdminTierNone
	}
}

// Tiers are hierarchical: each inherits everything below it.
func TierSatisfies(userTier, minimumTier AdminTier) bool {
	return TierRank(userTier) >= TierRank(minimumTier)
}

func TierRank(tier AdminTier) int {
	switch tier {
	case AdminTierOwner:
		return 3
	case AdminTierAdmin:
		return 2
	case AdminTierHelper:
		return 1
	default:
		return 0
	}
}
