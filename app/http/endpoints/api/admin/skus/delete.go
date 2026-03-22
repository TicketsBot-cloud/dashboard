package skus

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v4"
)

// DeleteHandler deletes a SKU and its related subscription/multi-server details by ID.
func DeleteHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	skuId, err := uuid.Parse(ctx.Param("skuid"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid SKU ID."))
		return
	}

	// Delete child rows first to avoid FK constraint violations.
	if err := database.Client.WithTx(ctx, func(tx pgx.Tx) error {
		if err := database.Client.SubscriptionSkus.DeleteBySku(ctx, tx, skuId); err != nil {
			return err
		}

		if err := database.Client.MultiServerSkus.DeleteBySku(ctx, tx, skuId); err != nil {
			return err
		}

		return database.Client.Skus.Delete(ctx, tx, skuId)
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to delete SKU."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionSkuDelete,
		ResourceType: dbmodel.AuditResourceSku,
		ResourceId:   audit.StringPtr(skuId.String()),
	})

	ctx.Status(http.StatusNoContent)
}
