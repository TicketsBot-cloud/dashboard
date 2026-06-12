package affiliate

import (
	"net/http"
	"strconv"
	"time"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const (
	defaultPerPage = 25
	maxPerPage     = 100
)

type referralResponse struct {
	Id           string  `json:"id"`
	ReferredTier string  `json:"referred_tier"`
	PurchasedDays int    `json:"purchased_days"`
	CreditDays   int     `json:"credit_days"`
	Status       string  `json:"status"`
	CreatedAt    string  `json:"created_at"`
	RedeemableAt string  `json:"redeemable_at"`
	RedeemedAt   *string `json:"redeemed_at"`
}

type referralsListResponse struct {
	Referrals []referralResponse `json:"referrals"`
	Total     int                `json:"total"`
	Page      int                `json:"page"`
	PerPage   int                `json:"per_page"`
}

func ListReferrals(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	// Verify user has an affiliate code
	affiliateCode, err := dbclient.Client.AffiliateCodes.GetByUserId(ctx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if affiliateCode == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("You do not have an affiliate code."))
		return
	}

	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}

	perPage, _ := strconv.Atoi(ctx.DefaultQuery("per_page", strconv.Itoa(defaultPerPage)))
	if perPage < 1 || perPage > maxPerPage {
		perPage = defaultPerPage
	}

	offset := (page - 1) * perPage

	group, groupCtx := errgroup.WithContext(ctx)

	var referrals []referralResponse
	var total int

	group.Go(func() error {
		results, err := dbclient.Client.AffiliateReferrals.ListByAffiliateUserId(groupCtx, userId, perPage, offset)
		if err != nil {
			return err
		}

		referrals = make([]referralResponse, len(results))
		for i, r := range results {
			status := r.Status
			if status == "pending" && !r.RedeemableAt.After(time.Now()) {
				status = "redeemable"
			}

			entry := referralResponse{
				Id:            r.Id.String(),
				ReferredTier:  r.ReferredTier,
				PurchasedDays: r.PurchasedDays,
				CreditDays:    r.CreditDays,
				Status:        status,
				CreatedAt:     r.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				RedeemableAt:  r.RedeemableAt.Format("2006-01-02T15:04:05Z07:00"),
			}

			if r.RedeemedAt != nil {
				formatted := r.RedeemedAt.Format("2006-01-02T15:04:05Z07:00")
				entry.RedeemedAt = &formatted
			}

			// DO NOT expose referred_user_id
			referrals[i] = entry
		}

		return nil
	})

	group.Go(func() error {
		var err error
		total, err = dbclient.Client.AffiliateReferrals.CountByAffiliateUserId(groupCtx, userId)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if referrals == nil {
		referrals = make([]referralResponse, 0)
	}

	ctx.JSON(http.StatusOK, referralsListResponse{
		Referrals: referrals,
		Total:     total,
		Page:      page,
		PerPage:   perPage,
	})
}
