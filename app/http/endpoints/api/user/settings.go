package user

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/email"
	"github.com/TicketsBot-cloud/dashboard/notify"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const (
	verificationCodeLength = 6
	verificationCodeExpiry = 15 * time.Minute
	maxVerificationAttempts = 5
)

func hmacCode(code string) string {
	h := hmac.New(sha256.New, []byte(config.Conf.Security.VerificationHmacSecret))
	h.Write([]byte(code))
	return hex.EncodeToString(h.Sum(nil))
}

type settingsResponse struct {
	Email         *string                            `json:"email"`
	EmailVerified bool                               `json:"email_verified"`
	Preferences   []notificationPreferenceResponse   `json:"notification_preferences"`
	Categories    []notify.CategoryInfo              `json:"notification_categories"`
}

type notificationPreferenceResponse struct {
	Category  string `json:"category"`
	DiscordDm bool   `json:"discord_dm"`
	Email     bool   `json:"email"`
	InApp     bool   `json:"in_app"`
}

// GetSettings handles GET /user/settings
func GetSettings(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	group, groupCtx := errgroup.WithContext(ctx)

	var emailPtr *string
	var emailVerified bool
	var prefs []database.NotificationPreference

	group.Go(func() error {
		userEmail, err := dbclient.Client.UserEmails.GetByUserId(groupCtx, userId)
		if err != nil {
			return err
		}
		if userEmail != nil {
			emailPtr = &userEmail.Email
			emailVerified = userEmail.Verified
		}
		return nil
	})

	group.Go(func() error {
		var err error
		prefs, err = dbclient.Client.NotificationPreferences.GetByUserId(groupCtx, userId)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	savedPrefs := make(map[string]database.NotificationPreference, len(prefs))
	for _, p := range prefs {
		savedPrefs[p.Category] = p
	}

	prefResponses := make([]notificationPreferenceResponse, 0, len(notify.AllCategories))
	for _, cat := range notify.AllCategories {
		if saved, ok := savedPrefs[cat.Key]; ok {
			prefResponses = append(prefResponses, notificationPreferenceResponse{
				Category:  cat.Key,
				DiscordDm: saved.DiscordDm,
				Email:     saved.Email,
				InApp:     saved.InApp,
			})
		} else {
			prefResponses = append(prefResponses, notificationPreferenceResponse{
				Category:  cat.Key,
				DiscordDm: notify.DefaultPreferences.DiscordDm,
				Email:     notify.DefaultPreferences.Email,
				InApp:     notify.DefaultPreferences.InApp,
			})
		}
	}

	ctx.JSON(http.StatusOK, settingsResponse{
		Email:         emailPtr,
		EmailVerified: emailVerified,
		Preferences:   prefResponses,
		Categories:    notify.AllCategories,
	})
}

type updateEmailBody struct {
	Email string `json:"email" binding:"required"`
}

// UpdateEmail handles PUT /user/settings/email
func UpdateEmail(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body updateEmailBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Please provide an email address."))
		return
	}

	normalisedEmail := strings.ToLower(strings.TrimSpace(body.Email))
	if !isValidEmail(normalisedEmail) {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Please provide a valid email address."))
		return
	}

	// Get old email for audit log
	oldEmail, _ := dbclient.Client.UserEmails.GetByUserId(ctx, userId)

	if err := dbclient.Client.UserEmails.Upsert(ctx, userId, normalisedEmail); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to save email address. Please try again."))
		return
	}

	// Reset verified status when changing email
	if err := dbclient.Client.UserEmails.SetVerified(ctx, userId, false); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update email. Please try again."))
		return
	}

	if err := sendVerificationCode(ctx, userId, normalisedEmail); err != nil {
		log.Printf("Failed to send verification email to user %d: %v", userId, err)
		// Non-fatal - email was saved, verification just failed
	}

	var oldData map[string]any
	if oldEmail != nil {
		oldData = map[string]any{"email": oldEmail.Email}
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionUserEmailUpdate,
		ResourceType: database.AuditResourceUserEmail,
		NewData: map[string]any{
			"email": normalisedEmail,
		},
		OldData: oldData,
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}

// DeleteEmail handles DELETE /user/settings/email
func DeleteEmail(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	oldEmail, _ := dbclient.Client.UserEmails.GetByUserId(ctx, userId)
	if oldEmail == nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("No email address on file."))
		return
	}

	if err := dbclient.Client.UserEmails.Delete(ctx, userId); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to delete email. Please try again."))
		return
	}

	if err := dbclient.Client.EmailVerificationCodes.Delete(ctx, userId); err != nil {
		log.Printf("Failed to delete verification code for user %d: %v", userId, err)
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionUserEmailDelete,
		ResourceType: database.AuditResourceUserEmail,
		OldData: map[string]any{
			"email": oldEmail.Email,
		},
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}

// GetNotificationPreferences handles GET /user/settings/notifications
func GetNotificationPreferences(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	prefs, err := dbclient.Client.NotificationPreferences.GetByUserId(ctx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	prefResponses := make([]notificationPreferenceResponse, 0, len(prefs))
	for _, p := range prefs {
		prefResponses = append(prefResponses, notificationPreferenceResponse{
			Category:  p.Category,
			DiscordDm: p.DiscordDm,
			Email:     p.Email,
			InApp:     p.InApp,
		})
	}

	ctx.JSON(http.StatusOK, prefResponses)
}

type updatePreferenceBody struct {
	Category  string `json:"category" binding:"required"`
	DiscordDm bool   `json:"discord_dm"`
	Email     bool   `json:"email"`
	InApp     bool   `json:"in_app"`
}

// UpdateNotificationPreferences handles PUT /user/settings/notifications
func UpdateNotificationPreferences(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body []updatePreferenceBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body."))
		return
	}

	if len(body) == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("At least one preference is required."))
		return
	}

	if len(body) > 50 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Too many preferences in a single request."))
		return
	}

	allowedCategories := map[string]bool{
		notify.CategoryAffiliate:         true,
		notify.CategoryIntegrations:      true,
		notify.CategoryAdminGallery:      true,
		notify.CategoryAdminAffiliates:   true,
		notify.CategoryAdminIntegrations: true,
	}

	for _, p := range body {
		if !allowedCategories[p.Category] {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid notification category."))
			return
		}
	}

	// Get old preferences for audit log
	oldPrefs, _ := dbclient.Client.NotificationPreferences.GetByUserId(ctx, userId)

	for _, p := range body {
		if err := dbclient.Client.NotificationPreferences.Upsert(ctx, userId, p.Category, p.DiscordDm, p.Email, p.InApp); err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to save preferences. Please try again."))
			return
		}
	}

	var oldData []map[string]any
	for _, p := range oldPrefs {
		oldData = append(oldData, map[string]any{
			"category":   p.Category,
			"discord_dm": p.DiscordDm,
			"email":      p.Email,
			"in_app":     p.InApp,
		})
	}

	var newData []map[string]any
	for _, p := range body {
		newData = append(newData, map[string]any{
			"category":   p.Category,
			"discord_dm": p.DiscordDm,
			"email":      p.Email,
			"in_app":     p.InApp,
		})
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionNotificationPreferencesUpdate,
		ResourceType: database.AuditResourceNotificationPrefs,
		OldData:      oldData,
		NewData:      newData,
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}

type verifyEmailBody struct {
	Code string `json:"code" binding:"required"`
}

// VerifyEmail handles POST /user/settings/verify-email
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
		if err := dbclient.Client.EmailVerificationCodes.Delete(ctx, userId); err != nil {
			log.Printf("Failed to delete verification code for user %d: %v", userId, err)
		}
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Verification code has expired. Please request a new one."))
		return
	}

	hashedInput := hmacCode(body.Code)
	if subtle.ConstantTimeCompare([]byte(stored.Code), []byte(hashedInput)) != 1 {
		attempts, err := dbclient.Client.EmailVerificationCodes.IncrementAttempts(ctx, userId)
		if err != nil {
			log.Printf("Failed to increment verification attempts for user %d: %v", userId, err)
		}
		if attempts >= maxVerificationAttempts {
			if err := dbclient.Client.EmailVerificationCodes.Delete(ctx, userId); err != nil {
				log.Printf("Failed to delete verification code for user %d: %v", userId, err)
			}
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Too many failed attempts. Please request a new code."))
			return
		}
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Incorrect verification code."))
		return
	}

	if err := dbclient.Client.UserEmails.SetVerified(ctx, userId, true); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to verify email. Please try again."))
		return
	}

	if err := dbclient.Client.EmailVerificationCodes.Delete(ctx, userId); err != nil {
		log.Printf("Failed to delete verification code for user %d: %v", userId, err)
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionEmailVerify,
		ResourceType: database.AuditResourceUserEmailVerification,
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}

// ResendVerification handles POST /user/settings/resend-verification
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

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionEmailResendVerification,
		ResourceType: database.AuditResourceUserEmailVerification,
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}

func sendVerificationCode(ctx *gin.Context, userId uint64, emailAddr string) error {
	code, err := generateVerificationCode()
	if err != nil {
		return err
	}

	hashedCode := hmacCode(code)
	expiresAt := time.Now().Add(verificationCodeExpiry)
	if err := dbclient.Client.EmailVerificationCodes.Upsert(ctx, userId, hashedCode, expiresAt); err != nil {
		return err
	}

	if email.DefaultClient != nil {
		verifyUrl := fmt.Sprintf("https://dashboard.tickets.bot/settings?verify=%s", url.QueryEscape(code))
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

func isValidEmail(addr string) bool {
	if len(addr) < 3 || len(addr) > 254 {
		return false
	}
	if strings.ContainsAny(addr, "\r\n\t") {
		return false
	}
	_, err := mail.ParseAddress(addr)
	return err == nil
}
