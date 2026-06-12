package affiliate

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type createBody struct {
	UserId              string `json:"user_id" binding:"required"`
	Code                string `json:"code" binding:"required"`
	DiscountBasisPoints int    `json:"discount_basis_points" binding:"required"`
	CreditPercentage    *int   `json:"credit_percentage"`
}

func CreateHandler(ctx *gin.Context) {
	adminUserId := ctx.Keys["userid"].(uint64)

	var body createBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body."))
		return
	}

	targetUserId, err := strconv.ParseUint(body.UserId, 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid user ID."))
		return
	}

	body.Code = strings.ToUpper(strings.TrimSpace(body.Code))
	codeRegex := regexp.MustCompile(`^[A-Z0-9]+$`)
	if len(body.Code) < 3 || len(body.Code) > 6 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Code must be between 3 and 6 characters."))
		return
	}
	if !codeRegex.MatchString(body.Code) {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Code must contain only alphanumeric characters."))
		return
	}

	// Validate basis points (0-10000 = 0-100%)
	if body.DiscountBasisPoints < 0 || body.DiscountBasisPoints > 10000 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Discount basis points must be between 0 and 10000."))
		return
	}

	// Validate credit percentage if provided (0-100); nil means use tier-based default
	if body.CreditPercentage != nil && (*body.CreditPercentage < 0 || *body.CreditPercentage > 100) {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Credit percentage must be between 0 and 100."))
		return
	}

	// Check user does not already have an affiliate code
	existing, err := dbclient.Client.AffiliateCodes.GetByUserId(ctx, targetUserId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if existing != nil {
		ctx.JSON(http.StatusConflict, utils.ErrorStr("This user already has an affiliate code."))
		return
	}

	// Check code uniqueness
	existingCode, err := dbclient.Client.AffiliateCodes.GetByCode(ctx, body.Code)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if existingCode != nil {
		ctx.JSON(http.StatusConflict, utils.ErrorStr("That affiliate code is already in use."))
		return
	}

	// Create the affiliate code with active status (admin-created codes are pre-approved)
	affiliateCode, err := dbclient.Client.AffiliateCodes.Create(
		ctx,
		targetUserId,
		body.Code,
		"active",
		body.DiscountBasisPoints,
		body.CreditPercentage,
	)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to create affiliate code. Please try again."))
		return
	}

	// Set approved_by to the admin user
	if err := dbclient.Client.AffiliateCodes.UpdateStatus(ctx, affiliateCode.Id, "active", &adminUserId); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update affiliate code status. Please try again."))
		return
	}

	// Create Polar discount
	polarDiscountId, err := createPolarDiscount(ctx, body.Code, body.DiscountBasisPoints)
	if err != nil {
		// Non-fatal: log but continue - the code is still usable, just without the Polar discount
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Affiliate code created, but failed to create Polar discount: %v", err))
		return
	}

	// Save the Polar discount ID
	if err := dbclient.Client.AffiliateCodes.SetPolarDiscountId(ctx, affiliateCode.Id, polarDiscountId); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to save Polar discount ID. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       adminUserId,
		ActionType:   database.AuditActionAffiliateCreate,
		ResourceType: database.AuditResourceAffiliate,
		ResourceId:   audit.StringPtr(affiliateCode.Id.String()),
		NewData: map[string]any{
			"target_user_id":       body.UserId,
			"code":                 body.Code,
			"discount_basis_points": body.DiscountBasisPoints,
			"credit_percentage":    body.CreditPercentage,
			"polar_discount_id":   polarDiscountId,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"id":                affiliateCode.Id.String(),
		"code":              body.Code,
		"polar_discount_id": polarDiscountId,
	})
}
