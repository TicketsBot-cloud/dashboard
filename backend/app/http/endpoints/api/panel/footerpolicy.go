package api

import (
	"context"

	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/common/premium"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
)

// No premium gets our branding, voting premium gets no footer at all, paid premium keeps its own.
type footerPolicy struct {
	ShowBranding bool
	AllowCustom  bool
}

func footerPolicyForGuild(ctx context.Context, guildId uint64, botContext *botcontext.BotContext) (footerPolicy, error) {
	tier, source, err := rpc.PremiumClient.GetTierByGuildIdWithSource(ctx, guildId, botContext.Token, botContext.RateLimiter)
	if err != nil {
		return footerPolicy{}, err
	}

	return footerPolicy{
		ShowBranding: tier == premium.None,
		AllowCustom:  tier > premium.None && source != model.EntitlementSourceVoting,
	}, nil
}
