package api

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/common/permission"
	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type setActiveGuildsBody struct {
	SelectedGuilds types.UInt64StringSlice `json:"selected_guilds"`
}

func SetActiveGuilds(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body setActiveGuildsBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	legacyEntitlement, err := dbclient.Client.LegacyPremiumEntitlements.GetUserTier(ctx, userId, premium.PatreonGracePeriod)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if legacyEntitlement == nil || legacyEntitlement.IsLegacy {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Not a premium user"))
		return
	}

	tx, err := dbclient.Client.BeginTx(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to start database transaction. Please try again."))
		return
	}

	defer tx.Rollback(ctx)

	// Validate under the limit
	limit, ok, err := dbclient.Client.MultiServerSkus.GetPermittedServerCount(ctx, tx, legacyEntitlement.SkuId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if !ok {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Not a multi-server subscription"))
		return
	}

	if len(body.SelectedGuilds) > limit {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Too many guilds selected"))
		return
	}

	existingGuildEntitlements, err := dbclient.Client.LegacyPremiumEntitlementGuilds.ListForUser(ctx, tx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	// Build list of existing guild IDs for quick lookup
	existingGuildIds := make([]uint64, len(existingGuildEntitlements))
	for i, existingEntitlement := range existingGuildEntitlements {
		existingGuildIds[i] = existingEntitlement.GuildId
	}

	// Users can remove subscriptions from servers they no longer have admin in
	for _, guildId := range body.SelectedGuilds {
		// Skip validation if this guild already has a subscription
		if utils.Contains(existingGuildIds, guildId) {
			continue
		}

		// For new guilds being added, validate admin permissions
		permissionLevel, err := utils.GetPermissionLevel(ctx, guildId, userId)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
			return
		}

		if permissionLevel < permission.Admin {
			ctx.JSON(http.StatusForbidden, utils.ErrorStr("Missing permissions in guild %d", guildId))
			return
		}
	}

	// Remove entitlements from guilds that are no longer selected
	for _, existingEntitlement := range existingGuildEntitlements {
		if !utils.Contains(body.SelectedGuilds, existingEntitlement.GuildId) {
			if err := dbclient.Client.LegacyPremiumEntitlementGuilds.DeleteByEntitlement(ctx, tx, existingEntitlement.EntitlementId); err != nil {
				ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to delete database record. Please try again."))
				return
			}

			if err := dbclient.Client.Entitlements.DeleteById(ctx, tx, existingEntitlement.EntitlementId); err != nil {
				ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to delete database record. Please try again."))
				return
			}
		}
	}

	// Create entitlements for guilds that were not previously selected, but now are
	for _, guildId := range body.SelectedGuilds {
		if !utils.Contains(existingGuildIds, guildId) {
			created, err := dbclient.Client.Entitlements.Create(ctx, tx, &guildId, &userId, legacyEntitlement.SkuId, model.EntitlementSourcePatreon, nil)
			if err != nil {
				ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to create database record. Please try again."))
				return
			}

			if err := dbclient.Client.LegacyPremiumEntitlementGuilds.Insert(ctx, tx, userId, guildId, created.Id); err != nil {
				ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to create database record. Please try again."))
				return
			}
		}
	}

	// Update entitlements for guilds that were previously selected and still are. This may involve recreating the
	// entitlement if the SKU has changed.
	for _, existingEntitlement := range existingGuildEntitlements {
		if utils.Contains(body.SelectedGuilds, existingEntitlement.GuildId) {
			entitlement, err := dbclient.Client.Entitlements.GetById(ctx, tx, existingEntitlement.EntitlementId)
			if err != nil {
				ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
				return
			}

			if entitlement == nil {
				ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Entitlement %s not found", existingEntitlement.EntitlementId.String()))
				return
			}

			if entitlement.SkuId == legacyEntitlement.SkuId {
				continue
			} else {
				// If we need to switch the SKU, then delete and recreate the entitlement
				if err := dbclient.Client.LegacyPremiumEntitlementGuilds.DeleteByEntitlement(ctx, tx, existingEntitlement.EntitlementId); err != nil {
					ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to delete database record. Please try again."))
					return
				}

				if err := dbclient.Client.Entitlements.DeleteById(ctx, tx, existingEntitlement.EntitlementId); err != nil {
					ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to delete database record. Please try again."))
					return
				}

				if _, err := dbclient.Client.Entitlements.Create(ctx, tx, &existingEntitlement.GuildId, &userId, legacyEntitlement.SkuId, model.EntitlementSourcePatreon, entitlement.ExpiresAt); err != nil {
					ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to create database record. Please try again."))
					return
				}
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to commit database transaction. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionPremiumSetActiveGuilds,
		ResourceType: dbmodel.AuditResourcePremium,
		NewData:      body,
	})
	ctx.Status(http.StatusNoContent)
}
