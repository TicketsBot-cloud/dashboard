package affiliate

import (
	"net/http"
	"strconv"
	"time"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
)

type adminReferralEntry struct {
	Id           string  `json:"id"`
	ReferredTier string  `json:"referred_tier"`
	PurchasedDays int    `json:"purchased_days"`
	CreditDays   int     `json:"credit_days"`
	Status       string  `json:"status"`
	CreatedAt    string  `json:"created_at"`
	RedeemableAt string  `json:"redeemable_at"`
	RedeemedAt   *string `json:"redeemed_at"`
}

type adminReferralsResponse struct {
	Referrals []adminReferralEntry `json:"referrals"`
	Total     int                  `json:"total"`
	Page      int                  `json:"page"`
	PerPage   int                  `json:"per_page"`
}

func ReferralsHandler(ctx *gin.Context) {
	codeIdStr := ctx.Param("id")
	codeId, err := uuid.Parse(codeIdStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid affiliate code ID."))
		return
	}

	affiliateCode, err := dbclient.Client.AffiliateCodes.GetById(ctx, codeId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	if affiliateCode == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Affiliate code not found."))
		return
	}

	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}

	perPage, _ := strconv.Atoi(ctx.DefaultQuery("per_page", strconv.Itoa(defaultPageSize)))
	if perPage < 1 || perPage > maxPageSize {
		perPage = defaultPageSize
	}

	offset := (page - 1) * perPage

	group, groupCtx := errgroup.WithContext(ctx)

	var entries []adminReferralEntry
	var total int

	group.Go(func() error {
		results, err := dbclient.Client.AffiliateReferrals.ListByAffiliateUserId(groupCtx, affiliateCode.UserId, perPage, offset)
		if err != nil {
			return err
		}

		entries = make([]adminReferralEntry, len(results))
		for i, r := range results {
			status := r.Status
			if status == "pending" && !r.RedeemableAt.After(time.Now()) {
				status = "redeemable"
			}

			entry := adminReferralEntry{
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

			entries[i] = entry
		}

		return nil
	})

	group.Go(func() error {
		var err error
		total, err = dbclient.Client.AffiliateReferrals.CountByAffiliateUserId(groupCtx, affiliateCode.UserId)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch referrals. Please try again."))
		return
	}

	if entries == nil {
		entries = make([]adminReferralEntry, 0)
	}

	ctx.JSON(http.StatusOK, adminReferralsResponse{
		Referrals: entries,
		Total:     total,
		Page:      page,
		PerPage:   perPage,
	})
}
