package middleware

import (
	"github.com/TicketsBot-cloud/dashboard/internal/admin"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

func RequireAdminTier(minimumTier admin.AdminTier) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		userId := ctx.Keys["userid"].(uint64)
		userTier := admin.GetAdminTier(ctx.Request.Context(), userId)

		if !admin.TierSatisfies(userTier, minimumTier) {
			ctx.JSON(401, utils.ErrorStr("Unauthorised"))
			ctx.Abort()
			return
		}

		ctx.Keys["admin_tier"] = string(userTier)
	}
}

var AdminOnly = RequireAdminTier(admin.AdminTierAdmin)
