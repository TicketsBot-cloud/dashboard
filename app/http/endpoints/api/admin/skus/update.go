package skus

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v4"
)

type updateSkuBody struct {
	Label            string  `json:"label"`
	SkuType          string  `json:"sku_type"`
	Tier             *string `json:"tier"`
	Priority         *int32  `json:"priority"`
	IsGlobal         *bool   `json:"is_global"`
	ServersPermitted *int    `json:"servers_permitted"`
}

// UpdateHandler updates an existing SKU and its related subscription/multi-server details.
func UpdateHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	skuId, err := uuid.Parse(ctx.Param("skuid"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid SKU ID."))
		return
	}

	var body updateSkuBody
	if err := ctx.BindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Failed to process request body."))
		return
	}

	if body.Label == "" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Label must not be empty."))
		return
	}

	skuType := model.SkuType(body.SkuType)
	if skuType != model.SkuTypeSubscription && skuType != model.SkuTypeConsumable && skuType != model.SkuTypeDurable {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("SKU type must be \"subscription\", \"consumable\", or \"durable\"."))
		return
	}

	if skuType == model.SkuTypeSubscription {
		if body.Tier == nil || (*body.Tier != string(model.EntitlementTierPremium) && *body.Tier != string(model.EntitlementTierWhitelabel)) {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Tier is required for subscription SKUs and must be \"premium\" or \"whitelabel\"."))
			return
		}
	}

	// Fetch existing SKU for audit logging.
	existing, err := database.Client.Skus.GetById(ctx, skuId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch existing SKU."))
		return
	}

	if existing == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("SKU not found."))
		return
	}

	updated := dbmodel.SkuWithDetails{
		Sku: model.Sku{
			Id:      skuId,
			Label:   body.Label,
			SkuType: skuType,
		},
		Tier:             body.Tier,
		Priority:         body.Priority,
		IsGlobal:         body.IsGlobal,
		ServersPermitted: body.ServersPermitted,
	}

	if err := database.Client.WithTx(ctx, func(tx pgx.Tx) error {
		if err := database.Client.Skus.Update(ctx, tx, skuId, body.Label, skuType); err != nil {
			return err
		}

		// Remove existing subscription details; re-add if still a subscription type.
		if err := database.Client.SubscriptionSkus.DeleteBySku(ctx, tx, skuId); err != nil {
			return err
		}

		if skuType == model.SkuTypeSubscription && body.Tier != nil {
			tier := model.EntitlementTier(*body.Tier)
			priority := int32(0)
			if body.Priority != nil {
				priority = *body.Priority
			}
			isGlobal := false
			if body.IsGlobal != nil {
				isGlobal = *body.IsGlobal
			}

			if err := database.Client.SubscriptionSkus.Upsert(ctx, tx, skuId, tier, priority, isGlobal); err != nil {
				return err
			}
		}

		// Remove existing multi-server details; re-add if provided.
		if err := database.Client.MultiServerSkus.DeleteBySku(ctx, tx, skuId); err != nil {
			return err
		}

		if body.ServersPermitted != nil {
			if err := database.Client.MultiServerSkus.Upsert(ctx, tx, skuId, *body.ServersPermitted); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update SKU."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionSkuUpdate,
		ResourceType: dbmodel.AuditResourceSku,
		ResourceId:   audit.StringPtr(skuId.String()),
		OldData:      existing,
		NewData:      updated,
	})

	ctx.JSON(http.StatusOK, updated)
}
