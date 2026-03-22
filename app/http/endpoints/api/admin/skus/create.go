package skus

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

type createSkuBody struct {
	Label            string  `json:"label"`
	SkuType          string  `json:"sku_type"`
	Tier             *string `json:"tier"`
	Priority         *int32  `json:"priority"`
	IsGlobal         *bool   `json:"is_global"`
	ServersPermitted *int    `json:"servers_permitted"`
}

// CreateHandler creates a new SKU with optional subscription and multi-server details.
func CreateHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body createSkuBody
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

	var created dbmodel.SkuWithDetails
	if err := database.Client.WithTx(ctx, func(tx pgx.Tx) error {
		sku, err := database.Client.Skus.Create(ctx, tx, body.Label, skuType)
		if err != nil {
			return err
		}

		created = dbmodel.SkuWithDetails{
			Sku:              sku,
			Tier:             body.Tier,
			Priority:         body.Priority,
			IsGlobal:         body.IsGlobal,
			ServersPermitted: body.ServersPermitted,
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

			if err := database.Client.SubscriptionSkus.Upsert(ctx, tx, sku.Id, tier, priority, isGlobal); err != nil {
				return err
			}
		}

		if body.ServersPermitted != nil {
			if err := database.Client.MultiServerSkus.Upsert(ctx, tx, sku.Id, *body.ServersPermitted); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to create SKU."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionSkuCreate,
		ResourceType: dbmodel.AuditResourceSku,
		ResourceId:   audit.StringPtr(created.Id.String()),
		NewData:      created,
	})

	ctx.JSON(http.StatusCreated, created)
}
