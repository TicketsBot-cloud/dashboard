package affiliate

import (
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"github.com/TicketsBot-cloud/dashboard/email"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

const (
	verificationCodeLength = 6
	verificationCodeExpiry = 15 * time.Minute
)

type verifyEmailBody struct {
	Code string `json:"code" binding:"required"`
}

func VerifyEmail(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body verifyEmailBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Please provide a verification code."))
		return
	}

	if matched, _ := regexp.MatchString(`^\d{6}$`, body.Code); !matched {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Verification code must be 6 digits."))
		return
	}

	stored, err := dbclient.Client.EmailVerificationCodes.GetByUserId(ctx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if stored == nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("No verification code found. Please request a new one."))
		return
	}

	if time.Now().After(stored.ExpiresAt) {
		_ = dbclient.Client.EmailVerificationCodes.Delete(ctx, userId)
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Verification code has expired. Please request a new one."))
		return
	}

	if subtle.ConstantTimeCompare([]byte(stored.Code), []byte(body.Code)) != 1 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Incorrect verification code."))
		return
	}

	if err := dbclient.Client.UserEmails.SetVerified(ctx, userId, true); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to verify email. Please try again."))
		return
	}

	_ = dbclient.Client.EmailVerificationCodes.Delete(ctx, userId)

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}

func ResendVerification(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	userEmail, err := dbclient.Client.UserEmails.GetByUserId(ctx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if userEmail == nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("No email address on file."))
		return
	}

	if userEmail.Verified {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Your email is already verified."))
		return
	}

	if err := sendVerificationCode(ctx, userId, userEmail.Email); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to send verification email. Please try again."))
		return
	}

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}

func sendVerificationCode(ctx *gin.Context, userId uint64, emailAddr string) error {
	code, err := generateVerificationCode()
	if err != nil {
		return err
	}

	expiresAt := time.Now().Add(verificationCodeExpiry)
	if err := dbclient.Client.EmailVerificationCodes.Upsert(ctx, userId, code, expiresAt); err != nil {
		return err
	}

	if email.DefaultClient != nil {
		verifyUrl := fmt.Sprintf("https://dashboard.tickets.bot/affiliate?verify=%s", url.QueryEscape(code))
		if err := email.DefaultClient.Send(ctx, emailAddr, "Verify Your Email Address", email.EmailVerification(code, verifyUrl)); err != nil {
			log.Printf("Failed to send verification email to user %d: %v", userId, err)
			return err
		}
	}

	return nil
}

func generateVerificationCode() (string, error) {
	b := make([]byte, verificationCodeLength)
	for i := range b {
		idx, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		b[i] = '0' + byte(idx.Int64())
	}
	return string(b), nil
}

