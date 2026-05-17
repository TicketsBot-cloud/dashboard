package affiliate

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v4"
	polargo "github.com/polarsource/polar-go"
	"github.com/polarsource/polar-go/models/components"
)

var (
	redeemPolarClient *polargo.Polar
	redeemPolarOnce   sync.Once
)

func getRedeemPolarClient() *polargo.Polar {
	redeemPolarOnce.Do(func() {
		server := polargo.ServerProduction
		if config.Conf.Polar.IsSandbox {
			server = polargo.ServerSandbox
		}
		redeemPolarClient = polargo.New(
			polargo.WithServer(server),
			polargo.WithSecurity(config.Conf.Polar.ApiKey),
		)
	})
	return redeemPolarClient
}

func Redeem(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	affiliateCode, err := dbclient.Client.AffiliateCodes.GetByUserId(ctx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if affiliateCode == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("You do not have an affiliate code."))
		return
	}

	if affiliateCode.Status != "active" {
		ctx.JSON(http.StatusForbidden, utils.ErrorStr("Your affiliate code is not active."))
		return
	}

	// Find the user's active Polar subscription for extension
	var activePolarSub *database.PolarEntitlementWithDetails
	var isWhitelabel bool
	if err := dbclient.Client.WithTx(ctx, func(tx pgx.Tx) error {
		subs, err := dbclient.Client.PolarEntitlements.ListByUser(ctx, tx, userId)
		if err != nil {
			return err
		}
		for _, s := range subs {
			if s.Status == "active" && s.ExpiresAt != nil && s.ExpiresAt.After(time.Now()) {
				sub := s
				activePolarSub = &sub
				if s.Tier == "whitelabel" {
					isWhitelabel = true
				}
				// Prefer Whitelabel if available
				if isWhitelabel {
					break
				}
			}
		}
		return nil
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	type redeemResult struct {
		redeemedCount int
		totalCredits  int
		totalDays     int
		referralIds   []string
		method        string
		tier          string
	}

	var result redeemResult

	if err := dbclient.Client.WithTx(ctx, func(tx pgx.Tx) error {
		redeemable, err := dbclient.Client.AffiliateReferrals.ListRedeemable(ctx, tx, userId)
		if err != nil {
			return err
		}

		if len(redeemable) == 0 {
			return nil
		}

		// Sum all available credits
		totalCredits := 0
		for _, r := range redeemable {
			totalCredits += r.CreditDays
		}

		// Check single 365 lifetime cap
		alreadyRedeemed, err := dbclient.Client.AffiliateReferrals.SumRedeemedByUserTx(ctx, tx, userId)
		if err != nil {
			return err
		}

		remaining := maxLifetimeCredits - alreadyRedeemed
		if remaining <= 0 {
			return nil
		}

		if totalCredits > remaining {
			totalCredits = remaining
		}

		// Mark referrals as redeemed up to the cap
		creditsUsed := 0
		for _, r := range redeemable {
			if creditsUsed >= totalCredits {
				break
			}

			if err := dbclient.Client.AffiliateReferrals.UpdateStatus(ctx, tx, r.Id, "redeemed"); err != nil {
				return fmt.Errorf("failed to update referral status: %w", err)
			}

			creditsUsed += r.CreditDays
			result.redeemedCount++
			result.referralIds = append(result.referralIds, r.Id.String())
		}

		// Cap creditsUsed to what we're allowed
		if creditsUsed > totalCredits {
			creditsUsed = totalCredits
		}

		result.totalCredits = creditsUsed

		// Determine redemption rate based on active subscription
		creditsPerDay := 1
		result.tier = "premium"
		if isWhitelabel {
			creditsPerDay = 2
			result.tier = "whitelabel"
		}

		days := creditsUsed / creditsPerDay
		if days < 1 && creditsUsed > 0 {
			days = 1
		}
		result.totalDays = days

		// Try to extend the active Polar subscription
		if activePolarSub != nil {
			newEnd := activePolarSub.ExpiresAt.Add(time.Duration(days) * 24 * time.Hour)

			_, err := getRedeemPolarClient().Subscriptions.Update(ctx,
				activePolarSub.PolarSubscriptionId,
				components.CreateSubscriptionUpdateSubscriptionUpdateBillingPeriod(
					components.SubscriptionUpdateBillingPeriod{
						CurrentBillingPeriodEnd: newEnd,
					},
				),
			)
			if err == nil {
				result.method = "subscription_extended"
				return nil
			}
			fmt.Printf("Polar subscription extension failed, falling back to entitlement: %v\n", err)
		}

		// Fallback: create/extend affiliate entitlement
		var skuId uuid.UUID
		for _, r := range redeemable {
			skuId = r.ReferredSkuId
			break
		}

		duration := time.Duration(days) * 24 * time.Hour
		if err := dbclient.Client.Entitlements.IncreaseExpiry(
			ctx, tx,
			nil,
			&userId,
			skuId,
			model.EntitlementSource("affiliate"),
			duration,
		); err != nil {
			return fmt.Errorf("failed to increase entitlement expiry: %w", err)
		}

		result.method = "entitlement"
		return nil
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to redeem affiliate credits. Please try again."))
		return
	}

	if result.redeemedCount == 0 {
		ctx.JSON(http.StatusOK, gin.H{
			"redeemed_count": 0,
			"message":        "No redeemable credits found.",
		})
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionAffiliateRedeem,
		ResourceType: database.AuditResourceAffiliateReferral,
		ResourceId:   audit.StringPtr(affiliateCode.Id.String()),
		NewData: map[string]any{
			"redeemed_count":  result.redeemedCount,
			"total_credits":   result.totalCredits,
			"total_days":      result.totalDays,
			"tier":            result.tier,
			"method":          result.method,
			"referral_ids":    result.referralIds,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"redeemed_count": result.redeemedCount,
		"total_credits":  result.totalCredits,
		"total_days":     result.totalDays,
		"tier":           result.tier,
		"method":         result.method,
	})
}
