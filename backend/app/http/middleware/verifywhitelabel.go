package middleware

import (
	"fmt"
	"net/http"
	"slices"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
)

func VerifyWhitelabel(isApi bool) func(ctx *gin.Context) {
	return func(ctx *gin.Context) {
		userId := ctx.Keys["userid"].(uint64)

		tier, err := rpc.PremiumClient.GetTierByUser(ctx, userId, false)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to verify premium status. Please try again."))
			return
		}

		if tier < premium.Whitelabel {
			var isForced bool
			if slices.Contains(config.Conf.ForceWhitelabel, userId) {
				isForced = true
			}

			if !isForced {
				if isApi {
					ctx.AbortWithStatusJSON(402, gin.H{
						"success": false,
						"error":   "You must have the whitelabel premium tier",
					})
				} else {
					ctx.Redirect(302, fmt.Sprintf("%s/premium", config.Conf.Server.MainSite))
					ctx.Abort()
				}
				return
			}
		}
	}
}
