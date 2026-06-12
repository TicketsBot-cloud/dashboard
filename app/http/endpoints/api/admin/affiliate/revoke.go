package affiliate

import (
	"context"
	"fmt"
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/notify"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func RevokeHandler(ctx *gin.Context) {
	adminUserId := ctx.Keys["userid"].(uint64)

	affiliateId, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid affiliate ID."))
		return
	}

	// Find the affiliate code
	affiliateCode, err := dbclient.Client.AffiliateCodes.GetById(ctx, affiliateId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if affiliateCode == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Affiliate code not found."))
		return
	}

	if affiliateCode.Status == "revoked" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("This affiliate code is already revoked."))
		return
	}

	oldStatus := affiliateCode.Status

	// Revoke the affiliate code
	if err := dbclient.Client.AffiliateCodes.UpdateStatus(ctx, affiliateId, "revoked", nil); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to revoke affiliate code. Please try again."))
		return
	}

	// Delete the Polar discount if one exists
	if affiliateCode.PolarDiscountId != nil {
		if err := deletePolarDiscount(ctx, *affiliateCode.PolarDiscountId); err != nil {
			// Non-fatal: the code is already revoked in our system
			// Log but don't fail the request
			_ = err
		}
	}

	audit.Log(audit.LogEntry{
		UserId:       adminUserId,
		ActionType:   database.AuditActionAffiliateRevoke,
		ResourceType: database.AuditResourceAffiliate,
		ResourceId:   audit.StringPtr(affiliateId.String()),
		OldData: map[string]any{
			"status": oldStatus,
		},
		NewData: map[string]any{
			"status": "revoked",
		},
	})

	go notify.Send(
		context.Background(),
		affiliateCode.UserId,
		notify.CategoryAffiliate,
		"Your Affiliate Code Has Been Revoked",
		fmt.Sprintf("Your affiliate code **`%s`** has been deactivated by an administrator. Any credits you have already earned remain available for redemption. If you believe this was done in error, please contact support.", affiliateCode.Code),
		"/affiliate",
	)

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
