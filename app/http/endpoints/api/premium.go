package api

import (
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func PremiumHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// If error, will default to false
	includeVoting, _ := strconv.ParseBool(ctx.Query("include_voting"))

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, includeVoting, botContext.Token, botContext.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorJson(err))
		return
	}

	ctx.JSON(200, gin.H{
		"premium": premiumTier >= premium.Premium,
		"tier":    premiumTier,
	})
}
