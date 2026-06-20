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

func CancelSubscription(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)
	subId := ctx.Param("subid")

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

	// Request cancellation at period end via Polar SDK
	_, err := GetPolarClient().Subscriptions.Update(ctx, subId,
		components.CreateSubscriptionUpdateSubscriptionCancel(components.SubscriptionCancel{
			CancelAtPeriodEnd: true,
		}),
	)
	if err != nil {
		ctx.JSON(http.StatusBadGateway, utils.ErrorStr("Failed to cancel subscription with payment provider."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionPolarSubscriptionCancel,
		ResourceType: database.AuditResourcePolarSubscription,
		ResourceId:   audit.StringPtr(subId),
		OldData: map[string]interface{}{
			"cancel_at_period_end": false,
		},
		NewData: map[string]interface{}{
			"cancel_at_period_end": true,
		},
	})

	ctx.Status(http.StatusNoContent)
}
