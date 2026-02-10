package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

func GetEntitlements(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	entitlements, err := dbclient.Client.Entitlements.ListUserSubscriptions(ctx, userId, premium.GracePeriod)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to query database. Please try again."))
		return
	}

	legacyEntitlement, err := dbclient.Client.LegacyPremiumEntitlements.GetUserTier(ctx, userId, premium.GracePeriod)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to query database. Please try again."))
		return
	}

	res := gin.H{
		"entitlements":       entitlements,
		"legacy_entitlement": legacyEntitlement,
	}

	if legacyEntitlement == nil || legacyEntitlement.IsLegacy {
		ctx.JSON(http.StatusOK, res)
		return
	}

	// If it's a multi-server subscription, fetch more data
	var permitted *int
	guildIds := make([]uint64, 0)
	if err := dbclient.Client.WithTx(ctx, func(tx pgx.Tx) error {
		tmp, ok, err := dbclient.Client.MultiServerSkus.GetPermittedServerCount(ctx, tx, legacyEntitlement.SkuId)
		if err != nil {
			return err
		}

		if ok {
			permitted = &tmp
		}

		activeEntitlements, err := dbclient.Client.LegacyPremiumEntitlementGuilds.ListForUser(ctx, tx, userId)
		if err != nil {
			return err
		}

		for _, entitlement := range activeEntitlements {
			guildIds = append(guildIds, entitlement.GuildId)
		}

		return nil
	}); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to query database. Please try again."))
		return
	}

	res["permitted_server_count"] = permitted
	res["selected_guilds"] = types.UInt64StringSlice(guildIds)

	ctx.JSON(http.StatusOK, res)
}
