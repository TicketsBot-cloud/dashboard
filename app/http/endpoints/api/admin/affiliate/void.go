package affiliate

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v4"
)

type voidBody struct {
	Reason string `json:"reason"`
}

func VoidHandler(ctx *gin.Context) {
	adminUserId := ctx.Keys["userid"].(uint64)

	referralId, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid referral ID."))
		return
	}

	var body voidBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		// Reason is optional
		body = voidBody{}
	}

	// Find the referral
	referral, err := dbclient.Client.AffiliateReferrals.GetById(ctx, referralId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if referral == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Referral not found."))
		return
	}

	if referral.Status == "voided" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("This referral is already voided."))
		return
	}

	oldStatus := referral.Status

	// Void the referral in a transaction
	if err := dbclient.Client.WithTx(ctx, func(tx pgx.Tx) error {
		return dbclient.Client.AffiliateReferrals.UpdateStatus(ctx, tx, referralId, "voided")
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to void referral. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       adminUserId,
		ActionType:   database.AuditActionAffiliateVoid,
		ResourceType: database.AuditResourceAffiliateReferral,
		ResourceId:   audit.StringPtr(referralId.String()),
		OldData: map[string]any{
			"status": oldStatus,
		},
		NewData: map[string]any{
			"status": "voided",
			"reason": body.Reason,
		},
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
