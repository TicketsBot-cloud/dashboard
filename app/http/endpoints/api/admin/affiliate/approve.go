package affiliate

import (
	"context"
	"fmt"
	"net/http"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/notify"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func ApproveHandler(ctx *gin.Context) {
	adminUserId := ctx.Keys["userid"].(uint64)

	affiliateId, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid affiliate ID."))
		return
	}

	affiliateCode, err := dbclient.Client.AffiliateCodes.GetById(ctx, affiliateId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if affiliateCode == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Affiliate code not found."))
		return
	}

	if affiliateCode.Status != "pending" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Only pending affiliate codes can be approved."))
		return
	}

	// Re-verify that the user still has an active subscription
	entitlements, err := dbclient.Client.Entitlements.ListUserSubscriptions(ctx, affiliateCode.UserId, premium.GracePeriod)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to verify subscription status. Please try again."))
		return
	}

	if len(entitlements) == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("The user no longer has an active subscription."))
		return
	}

	// Create Polar discount
	polarDiscountId, err := createPolarDiscount(ctx, affiliateCode.Code, affiliateCode.DiscountBasisPoints)
	if err != nil {
		fmt.Printf("Polar discount creation failed for code %s: %v\n", affiliateCode.Code, err)
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to create discount with payment provider. Please try again."))
		return
	}

	// Update status to active
	if err := dbclient.Client.AffiliateCodes.UpdateStatus(ctx, affiliateId, "active", &adminUserId); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update affiliate code status. Please try again."))
		return
	}

	// Save the Polar discount ID
	if err := dbclient.Client.AffiliateCodes.SetPolarDiscountId(ctx, affiliateId, polarDiscountId); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to save Polar discount ID. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       adminUserId,
		ActionType:   database.AuditActionAffiliateApprove,
		ResourceType: database.AuditResourceAffiliate,
		ResourceId:   audit.StringPtr(affiliateId.String()),
		OldData: map[string]any{
			"status": "pending",
		},
		NewData: map[string]any{
			"status":            "active",
			"approved_by":       adminUserId,
			"polar_discount_id": polarDiscountId,
		},
	})

	go notify.Send(
		context.Background(),
		affiliateCode.UserId,
		notify.CategoryAffiliate,
		"Your Affiliate Code is Active",
		fmt.Sprintf("Your affiliate code **`%s`** has been approved and is now live. Share it with others - when someone subscribes using your code, they get a discount and you earn credits towards premium time.", affiliateCode.Code),
		"/affiliate",
	)

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
