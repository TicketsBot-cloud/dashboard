package affiliate

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"net/mail"
	"regexp"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/notify"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

const (
	codeLength    = 6
	codeAlphabet  = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No I, O, 0, 1 to avoid confusion
	maxCustomCode = 6
)

var codeRegex = regexp.MustCompile(`^[A-Za-z0-9]+$`)

type applyBody struct {
	Code  *string `json:"code"`
	Email *string `json:"email"`
}

func Apply(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body applyBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		body = applyBody{}
	}

	var normalisedEmail string
	if body.Email != nil && *body.Email != "" {
		normalisedEmail = strings.ToLower(strings.TrimSpace(*body.Email))
		if !isValidEmail(normalisedEmail) {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Please provide a valid email address."))
			return
		}
	}

	// Check that the user does not already have an affiliate code
	existing, err := dbclient.Client.AffiliateCodes.GetByUserId(ctx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if existing != nil {
		ctx.JSON(http.StatusConflict, utils.ErrorStr("You already have an affiliate code."))
		return
	}

	// Determine the code to use
	var code string
	if body.Code != nil && len(*body.Code) > 0 {
		// Custom code: validate length and format
		customCode := strings.ToUpper(strings.TrimSpace(*body.Code))

		if len(customCode) < 3 || len(customCode) > maxCustomCode {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Custom affiliate code must be between 3 and %d characters.", maxCustomCode))
			return
		}

		if !codeRegex.MatchString(customCode) {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Affiliate code must contain only alphanumeric characters."))
			return
		}

		// Check uniqueness
		existingCode, err := dbclient.Client.AffiliateCodes.GetByCode(ctx, customCode)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
			return
		}

		if existingCode != nil {
			ctx.JSON(http.StatusConflict, utils.ErrorStr("That affiliate code is already in use. Please choose another."))
			return
		}

		code = customCode
	} else {
		// Generate a random code
		generated, err := generateCode()
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to generate affiliate code. Please try again."))
			return
		}
		code = generated
	}

	// Create the affiliate code with pending status
	// credit_percentage is nil - rate is determined dynamically based on the affiliate's tier at referral time
	affiliateCode, err := dbclient.Client.AffiliateCodes.Create(
		ctx,
		userId,
		code,
		"pending",
		config.Conf.Polar.DefaultDiscountBasisPoints,
		nil,
	)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to create affiliate code. Please try again."))
		return
	}

	if normalisedEmail != "" {
		if err := dbclient.Client.UserEmails.Upsert(ctx, userId, normalisedEmail); err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to save email address. Please try again."))
			return
		}

		if err := sendVerificationCode(ctx, userId, normalisedEmail); err != nil {
			// Non-fatal: affiliate code was created, verification email just failed
			_ = err
		}
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionAffiliateApply,
		ResourceType: database.AuditResourceAffiliate,
		ResourceId:   audit.StringPtr(affiliateCode.Id.String()),
		NewData: map[string]any{
			"code":   code,
			"status": "pending",
		},
	})

	go notify.SendToAdmins(
		context.Background(),
		notify.CategoryAdminAffiliates,
		"New Affiliate Application",
		fmt.Sprintf("A new affiliate application has been submitted with code **`%s`**.", code),
		"/admin/affiliate",
	)

	ctx.JSON(http.StatusOK, gin.H{
		"code": affiliateCodeResponse{
			Id:                  affiliateCode.Id.String(),
			Code:                affiliateCode.Code,
			Status:              affiliateCode.Status,
			DiscountBasisPoints: affiliateCode.DiscountBasisPoints,
			CreditPercentage:    affiliateCode.CreditPercentage,
			CreatedAt:           affiliateCode.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		},
	})
}

func generateCode() (string, error) {
	b := make([]byte, codeLength)
	for i := range b {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeAlphabet))))
		if err != nil {
			return "", err
		}
		b[i] = codeAlphabet[idx.Int64()]
	}
	return string(b), nil
}

func isValidEmail(email string) bool {
	if len(email) < 3 || len(email) > 254 {
		return false
	}
	if strings.ContainsAny(email, "\r\n\t") {
		return false
	}
	_, err := mail.ParseAddress(email)
	return err == nil
}
