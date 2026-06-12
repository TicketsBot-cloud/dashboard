package affiliate

import (
	"net/http"
	"strconv"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

type flaggedReferralEntry struct {
	Id                  string  `json:"id"`
	AffiliateCodeId     string  `json:"affiliate_code_id"`
	AffiliateUserId     string  `json:"affiliate_user_id"`
	ReferredUserId      string  `json:"referred_user_id"`
	PolarSubscriptionId string  `json:"polar_subscription_id"`
	ReferredTier        string  `json:"referred_tier"`
	PurchasedDays       int     `json:"purchased_days"`
	CreditDays          int     `json:"credit_days"`
	Status              string  `json:"status"`
	CreatedAt           string  `json:"created_at"`
	VoidedReason        *string `json:"voided_reason"`
}

type flaggedResponse struct {
	Referrals []flaggedReferralEntry `json:"referrals"`
	Total     int                    `json:"total"`
	Page      int                    `json:"page"`
	PerPage   int                    `json:"per_page"`
}

func FlaggedHandler(ctx *gin.Context) {
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

	var entries []flaggedReferralEntry
	var total int

	group.Go(func() error {
		results, err := dbclient.Client.AffiliateReferrals.ListFlagged(groupCtx, perPage, offset)
		if err != nil {
			return err
		}

		entries = make([]flaggedReferralEntry, len(results))
		for i, r := range results {
			entries[i] = flaggedReferralEntry{
				Id:                  r.Id.String(),
				AffiliateCodeId:     r.AffiliateCodeId.String(),
				AffiliateUserId:     strconv.FormatUint(r.AffiliateUserId, 10),
				ReferredUserId:      strconv.FormatUint(r.ReferredUserId, 10),
				PolarSubscriptionId: r.PolarSubscriptionId,
				ReferredTier:        r.ReferredTier,
				PurchasedDays:       r.PurchasedDays,
				CreditDays:          r.CreditDays,
				Status:              r.Status,
				CreatedAt:           r.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				VoidedReason:        r.VoidedReason,
			}
		}

		return nil
	})

	group.Go(func() error {
		var err error
		total, err = dbclient.Client.AffiliateReferrals.CountFlagged(groupCtx)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch flagged referrals. Please try again."))
		return
	}

	if entries == nil {
		entries = make([]flaggedReferralEntry, 0)
	}

	ctx.JSON(http.StatusOK, flaggedResponse{
		Referrals: entries,
		Total:     total,
		Page:      page,
		PerPage:   perPage,
	})
}
