package polar

import (
	"net/http"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func GetSubscriptions(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var polarSubs []database.PolarEntitlementWithDetails
	if err := dbclient.Client.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		polarSubs, err = dbclient.Client.PolarEntitlements.ListByUser(ctx, tx, userId)
		return err
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if polarSubs == nil {
		polarSubs = make([]database.PolarEntitlementWithDetails, 0)
	}

	ctx.JSON(http.StatusOK, polarSubs)
}
