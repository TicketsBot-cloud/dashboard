package api

import (
	"context"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
)

const componentsV2PremiumMessage = "Component-based messages require premium. Purchase premium to unlock this feature."

// hasPaidPremium excludes voting premium, as custom footers do: Components V2 is a paid
// feature, not something votes unlock.
func hasPaidPremium(ctx context.Context, guildId uint64, botContext *botcontext.BotContext) (bool, error) {
	tier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		return false, err
	}

	return tier > premium.None, nil
}
