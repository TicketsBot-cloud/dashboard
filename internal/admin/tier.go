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

func GetAdminTier(ctx context.Context, id uint64) AdminTier {
	if IsBotOwner(id) {
		return AdminTierOwner
	}

	tier, err := dbclient.Client.BotStaff.GetTier(ctx, id)
	if err != nil || tier == "" {
		return AdminTierNone
	}

	switch tier {
	case database.BotStaffTierAdmin:
		return AdminTierAdmin
	case database.BotStaffTierHelper:
		return AdminTierHelper
	default:
		return AdminTierNone
	}
}
