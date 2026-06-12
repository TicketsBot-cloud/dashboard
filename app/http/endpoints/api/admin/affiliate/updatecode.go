package affiliate

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type updateCodeBody struct {
	Code string `json:"code" binding:"required"`
}

func UpdateCodeHandler(ctx *gin.Context) {
	adminUserId := ctx.Keys["userid"].(uint64)

	affiliateId, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid affiliate ID."))
		return
	}

	var body updateCodeBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body."))
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

	affiliateCode, err := dbclient.Client.AffiliateCodes.GetById(ctx, affiliateId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if affiliateCode == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Affiliate code not found."))
		return
	}

	if affiliateCode.Code == body.Code {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("New code is the same as the current code."))
		return
	}

	existingCode, err := dbclient.Client.AffiliateCodes.GetByCode(ctx, body.Code)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if existingCode != nil {
		ctx.JSON(http.StatusConflict, utils.ErrorStr("That affiliate code is already in use."))
		return
	}

	oldCode := affiliateCode.Code

	if err := dbclient.Client.AffiliateCodes.UpdateCode(ctx, affiliateId, body.Code); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update affiliate code. Please try again."))
		return
	}

	if affiliateCode.PolarDiscountId != nil {
		if err := deletePolarDiscount(ctx, *affiliateCode.PolarDiscountId); err != nil {
			_ = err
		}

		newDiscountId, err := createPolarDiscount(ctx, body.Code, affiliateCode.DiscountBasisPoints)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Code updated, but failed to recreate Polar discount: %v", err))
			return
		}

		if err := dbclient.Client.AffiliateCodes.SetPolarDiscountId(ctx, affiliateId, newDiscountId); err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to save updated Polar discount ID. Please try again."))
			return
		}
	}

	audit.Log(audit.LogEntry{
		UserId:       adminUserId,
		ActionType:   database.AuditActionAffiliateUpdateCode,
		ResourceType: database.AuditResourceAffiliate,
		ResourceId:   audit.StringPtr(affiliateId.String()),
		OldData: map[string]any{
			"code": oldCode,
		},
		NewData: map[string]any{
			"code": body.Code,
		},
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
