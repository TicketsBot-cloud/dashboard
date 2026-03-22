package polar

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
	"github.com/polarsource/polar-go/models/components"
)

type changeSubscriptionBody struct {
	NewProductId string `json:"new_product_id" binding:"required"`
}

func ChangeSubscription(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)
	subId := ctx.Param("subid")

	var body changeSubscriptionBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
		return
	}

	if !isValidPolarProduct(ctx, body.NewProductId) {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid product ID"))
		return
	}

	// Verify the subscription belongs to the requesting user
	var ent *database.PolarEntitlement
	if err := dbclient.Client.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		ent, err = dbclient.Client.PolarEntitlements.GetBySubscriptionId(ctx, tx, subId)
		return err
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if ent == nil || ent.UserId != userId {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Subscription not found"))
		return
	}

	// Request plan change via Polar SDK
	_, err := getPolarClient().Subscriptions.Update(ctx, subId,
		components.CreateSubscriptionUpdateSubscriptionUpdateProduct(components.SubscriptionUpdateProduct{
			ProductID: body.NewProductId,
		}),
	)
	if err != nil {
		ctx.JSON(http.StatusBadGateway, utils.ErrorStr("Failed to change subscription with payment provider."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionPolarSubscriptionChange,
		ResourceType: database.AuditResourcePolarSubscription,
		ResourceId:   audit.StringPtr(subId),
		OldData: map[string]string{
			"product_id": ent.PolarProductId,
		},
		NewData: map[string]string{
			"product_id": body.NewProductId,
		},
	})

	ctx.Status(http.StatusNoContent)
}
