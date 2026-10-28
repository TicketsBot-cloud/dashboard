package api

import (
	"context"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/database"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

const (
	componentsV2PremiumMessage     = "Components v2 messages require premium. Switch them back to Classic to save without premium."
	componentsV2UnavailableMessage = "Components v2 messages aren't available for this server yet. Switch them back to Classic to save."
)

// hasPaidPremium excludes voting premium, as custom footers do: Components V2 is a paid
// feature, not something votes unlock.
func hasPaidPremium(ctx context.Context, guildId uint64, botContext *botcontext.BotContext) (bool, error) {
	tier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		return false, err
	}

	return tier > premium.None, nil
}

// Same attributes as GetGuildFeatureFlags, voting premium included, so the verdict matches what
// the browser was told.
func componentsV2BuilderEnabled(ctx context.Context, userId, guildId uint64, tier premium.PremiumTier) bool {
	attributes := utils.DashboardFlagAttributes(ctx, userId).WithGuild(guildId).WithPremiumTier(int8(tier))
	return utils.FeatureFlags.IsEnabled(ctx, "202608_COMPONENTS_V2_BUILDER", attributes)
}

// Only switching a message to Components V2 is gated, so turning the flag off never locks a
// stored V2 message.
func (p *panelBody) entersComponentsV2(stored database.Panel) bool {
	return (p.MessageUsesComponentsV2 && !stored.MessageUsesComponentsV2) ||
		(p.WelcomeMessageUsesComponentsV2 && !stored.WelcomeMessageUsesComponentsV2)
}

func (d *multiPanelCreateData) entersComponentsV2(stored database.MultiPanel) bool {
	return d.UsesComponentsV2 && !stored.UsesComponentsV2
}
