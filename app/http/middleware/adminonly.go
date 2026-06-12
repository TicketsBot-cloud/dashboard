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

		if !tierSatisfies(userTier, minimumTier) {
			ctx.JSON(401, utils.ErrorStr("Unauthorised"))
			ctx.Abort()
			return
		}

		ctx.Keys["admin_tier"] = string(userTier)
	}
}

func tierSatisfies(userTier, minimumTier admin.AdminTier) bool {
	return tierRank(userTier) >= tierRank(minimumTier)
}

func tierRank(tier admin.AdminTier) int {
	switch tier {
	case admin.AdminTierOwner:
		return 3
	case admin.AdminTierAdmin:
		return 2
	case admin.AdminTierHelper:
		return 1
	default:
		return 0
	}
}

var AdminOnly = RequireAdminTier(admin.AdminTierAdmin)
