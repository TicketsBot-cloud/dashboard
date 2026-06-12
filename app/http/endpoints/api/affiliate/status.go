package affiliate

import (
	"net/http"
	"strings"

	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

func maskEmail(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 || len(parts[0]) == 0 {
		return "***"
	}
	local := parts[0]
	if len(local) <= 2 {
		return local[:1] + "***@" + parts[1]
	}
	return local[:1] + strings.Repeat("*", len(local)-2) + local[len(local)-1:] + "@" + parts[1]
}

const maxLifetimeCredits = 365

func effectiveCreditPercent(code *database.AffiliateCode, hasPremium bool) int {
	if code != nil && code.CreditPercentage != nil {
		return *code.CreditPercentage
	}
	if hasPremium {
		return config.Conf.Polar.DefaultCreditPercentage
	}
	return config.Conf.Polar.DefaultNonPremiumCreditPercent
}

type statusResponse struct {
	Code                   *affiliateCodeResponse `json:"code"`
	TotalReferrals         int                    `json:"total_referrals"`
	PendingReferrals       int                    `json:"pending_referrals"`
	RedeemableCredits      int                    `json:"redeemable_credits"`
	RedeemedCredits        int                    `json:"redeemed_credits"`
	CapRemaining           int                    `json:"cap_remaining"`
	HasEntitlement         bool                   `json:"has_entitlement"`
	HasWhitelabel          bool                   `json:"has_whitelabel"`
	EffectiveCreditPercent int                    `json:"effective_credit_percent"`
	Email                  *string                `json:"email"`
	EmailVerified          bool                   `json:"email_verified"`
}

type affiliateCodeResponse struct {
	Id                  string `json:"id"`
	Code                string `json:"code"`
	Status              string `json:"status"`
	DiscountBasisPoints int    `json:"discount_basis_points"`
	CreditPercentage    *int   `json:"credit_percentage"`
	CreatedAt           string `json:"created_at"`
	ApprovedAt          *string `json:"approved_at"`
}

func GetStatus(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	affiliateCode, err := dbclient.Client.AffiliateCodes.GetByUserId(ctx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	entitlements, err := dbclient.Client.Entitlements.ListUserSubscriptions(ctx, userId, premium.GracePeriod)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	userEmail, _ := dbclient.Client.UserEmails.GetByUserId(ctx, userId)
	var emailPtr *string
	emailVerified := false
	if userEmail != nil {
		masked := maskEmail(userEmail.Email)
		emailPtr = &masked
		emailVerified = userEmail.Verified
	}

	hasPremium := len(entitlements) > 0
	hasWhitelabel := false
	for _, e := range entitlements {
		if e.Tier == model.EntitlementTierWhitelabel {
			hasWhitelabel = true
			break
		}
	}

	if affiliateCode == nil {
		ctx.JSON(http.StatusOK, statusResponse{
			Code:                   nil,
			TotalReferrals:         0,
			PendingReferrals:       0,
			RedeemableCredits:      0,
			RedeemedCredits:        0,
			CapRemaining:           maxLifetimeCredits,
			HasEntitlement:         hasPremium,
			HasWhitelabel:          hasWhitelabel,
			EffectiveCreditPercent: effectiveCreditPercent(nil, hasPremium),
			Email:                  emailPtr,
			EmailVerified:          emailVerified,
		})
		return
	}

	group, groupCtx := errgroup.WithContext(ctx)

	var totalReferrals, pendingReferrals int
	var redeemedCredits, redeemableCredits int

	group.Go(func() error {
		var err error
		totalReferrals, err = dbclient.Client.AffiliateReferrals.CountByAffiliateUserId(groupCtx, userId)
		return err
	})

	group.Go(func() error {
		var err error
		pendingReferrals, err = dbclient.Client.AffiliateReferrals.CountPending(groupCtx, userId)
		return err
	})

	group.Go(func() error {
		var err error
		redeemedCredits, err = dbclient.Client.AffiliateReferrals.SumRedeemedByUser(groupCtx, userId)
		return err
	})

	group.Go(func() error {
		var err error
		redeemableCredits, err = dbclient.Client.AffiliateReferrals.SumRedeemableByUser(groupCtx, userId)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	capRemaining := maxLifetimeCredits - redeemedCredits
	if capRemaining < 0 {
		capRemaining = 0
	}

	codeResp := &affiliateCodeResponse{
		Id:                  affiliateCode.Id.String(),
		Code:                affiliateCode.Code,
		Status:              affiliateCode.Status,
		DiscountBasisPoints: affiliateCode.DiscountBasisPoints,
		CreditPercentage:    affiliateCode.CreditPercentage,
		CreatedAt:           affiliateCode.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	if affiliateCode.ApprovedAt != nil {
		formatted := affiliateCode.ApprovedAt.Format("2006-01-02T15:04:05Z07:00")
		codeResp.ApprovedAt = &formatted
	}

	ctx.JSON(http.StatusOK, statusResponse{
		Code:                   codeResp,
		TotalReferrals:         totalReferrals,
		PendingReferrals:       pendingReferrals,
		RedeemableCredits:      redeemableCredits,
		RedeemedCredits:        redeemedCredits,
		CapRemaining:           capRemaining,
		HasEntitlement:         hasPremium,
		HasWhitelabel:          hasWhitelabel,
		EffectiveCreditPercent: effectiveCreditPercent(affiliateCode, hasPremium),
		Email:                  emailPtr,
		EmailVerified:          emailVerified,
	})
}
