package affiliate

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type updateRatesBody struct {
	DiscountBasisPoints int  `json:"discount_basis_points" binding:"required"`
	CreditPercentage    *int `json:"credit_percentage"`
}

func UpdateRatesHandler(ctx *gin.Context) {
	adminUserId := ctx.Keys["userid"].(uint64)

	affiliateId, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid affiliate ID."))
		return
	}

	var body updateRatesBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body."))
		return
	}

	// Validate basis points (0-10000 = 0-100%)
	if body.DiscountBasisPoints < 0 || body.DiscountBasisPoints > 10000 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Discount basis points must be between 0 and 10000."))
		return
	}

	// Validate credit percentage if provided (nil = reset to tier-based default)
	if body.CreditPercentage != nil && (*body.CreditPercentage < 0 || *body.CreditPercentage > 100) {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Credit percentage must be between 0 and 100."))
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

	oldBasisPoints := affiliateCode.DiscountBasisPoints
	oldCreditPercentage := affiliateCode.CreditPercentage

	// Update rates in the database
	if err := dbclient.Client.AffiliateCodes.UpdateRates(ctx, affiliateId, body.DiscountBasisPoints, body.CreditPercentage); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update rates. Please try again."))
		return
	}

	// If the discount basis points changed and there is a Polar discount, recreate it
	// (DiscountUpdate does not support changing BasisPoints, so we delete and recreate)
	if oldBasisPoints != body.DiscountBasisPoints && affiliateCode.PolarDiscountId != nil {
		// Delete old discount
		if err := deletePolarDiscount(ctx, *affiliateCode.PolarDiscountId); err != nil {
			// Non-fatal: continue with the new discount creation
			_ = err
		}

		// Create new discount with updated basis points
		newDiscountId, err := createPolarDiscount(ctx, affiliateCode.Code, body.DiscountBasisPoints)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Rates updated, but failed to update Polar discount: %v", err))
			return
		}

		if err := dbclient.Client.AffiliateCodes.SetPolarDiscountId(ctx, affiliateId, newDiscountId); err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to save updated Polar discount ID. Please try again."))
			return
		}
	}

	audit.Log(audit.LogEntry{
		UserId:       adminUserId,
		ActionType:   database.AuditActionAffiliateUpdateRate,
		ResourceType: database.AuditResourceAffiliate,
		ResourceId:   audit.StringPtr(affiliateId.String()),
		OldData: map[string]any{
			"discount_basis_points": oldBasisPoints,
			"credit_percentage":    oldCreditPercentage,
		},
		NewData: map[string]any{
			"discount_basis_points": body.DiscountBasisPoints,
			"credit_percentage":    body.CreditPercentage,
		},
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
