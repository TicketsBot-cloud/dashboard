package api

import (
	"context"
	"net/http"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

const (
	componentsV2PremiumMessage     = "Components v2 messages require premium. Switch them back to Classic to save."
	componentsV2UnavailableMessage = "Components v2 messages aren't available for this server yet. Switch them back to Classic to save."
)

func hasPaidPremium(ctx context.Context, guildId uint64, botContext *botcontext.BotContext) (bool, error) {
	tier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		return false, err
	}

	return tier > premium.None, nil
}

func componentsV2BuilderEnabled(ctx context.Context, userId, guildId uint64, tier premium.PremiumTier) bool {
	attributes := utils.DashboardFlagAttributes(ctx, userId).WithGuild(guildId).WithPremiumTier(int8(tier))
	return utils.FeatureFlags.IsEnabled(ctx, "202608_COMPONENTS_V2_BUILDER", attributes)
}

func componentsV2Gate(c *gin.Context, userId, guildId uint64, botContext *botcontext.BotContext, entering, usesV2 bool, votingTier, paidTier *premium.PremiumTier, internalMessage string) (hasPaid, ok bool) {
	if entering {
		// A paid tier is also the voting-inclusive one: voting only counts without paid premium.
		if votingTier == nil && paidTier != nil && *paidTier > premium.None {
			votingTier = paidTier
		}

		if votingTier == nil {
			tier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, true, botContext.Token, botContext.RateLimiter)
			if err != nil {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, internalMessage))
				return false, false
			}

			votingTier = &tier
		}

		if !componentsV2BuilderEnabled(c, userId, guildId, *votingTier) {
			c.JSON(403, utils.ErrorStr(componentsV2UnavailableMessage))
			return false, false
		}
	}

	if paidTier != nil {
		hasPaid = *paidTier > premium.None
	} else if usesV2 {
		paid, err := hasPaidPremium(c, guildId, botContext)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, internalMessage))
			return false, false
		}

		hasPaid = paid
	}

	if usesV2 && !hasPaid {
		c.JSON(402, utils.ErrorStr(componentsV2PremiumMessage))
		return false, false
	}

	return hasPaid, true
}

func (p *panelBody) entersComponentsV2(stored database.Panel) bool {
	return (p.MessageUsesComponentsV2 && !stored.MessageUsesComponentsV2) ||
		(p.WelcomeMessageUsesComponentsV2 && !stored.WelcomeMessageUsesComponentsV2)
}

func (p *panelBody) usesComponentsV2() bool {
	return p.MessageUsesComponentsV2 || p.WelcomeMessageUsesComponentsV2
}

func (d *multiPanelCreateData) entersComponentsV2(stored database.MultiPanel) bool {
	return d.UsesComponentsV2 && !stored.UsesComponentsV2
}
