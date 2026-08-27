package polarproducts

import (
	"net/http"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v4"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

// DeleteHandler deletes a polar product by its internal UUID.
func DeleteHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	productId, err := uuid.Parse(ctx.Param("productid"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid product ID."))
		return
	}

	if err := database.Client.WithTx(ctx, func(tx pgx.Tx) error {
		return database.Client.PolarProducts.Delete(ctx, tx, productId)
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to delete polar product."))
		return
	}

	audit.LogStaff(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionPolarProductDelete,
		ResourceType: dbmodel.AuditResourcePolarProduct,
		ResourceId:   audit.StringPtr(productId.String()),
	})

	ctx.Status(http.StatusNoContent)
}
