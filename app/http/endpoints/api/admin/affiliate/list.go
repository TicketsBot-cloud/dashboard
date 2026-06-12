package affiliate

import (
	"errors"
	"net/http"
	"strconv"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const (
	defaultPageSize = 25
	maxPageSize     = 100
)

type affiliateCodeEntry struct {
	Id                  string         `json:"id"`
	UserId              string         `json:"user_id"`
	Username            string         `json:"username"`
	AvatarUrl           string         `json:"avatar_url,omitempty"`
	Code                string         `json:"code"`
	PolarDiscountId     *string        `json:"polar_discount_id"`
	Status              string         `json:"status"`
	DiscountBasisPoints int            `json:"discount_basis_points"`
	CreditPercentage    *int           `json:"credit_percentage"`
	CreatedAt           string         `json:"created_at"`
	ApprovedAt          *string        `json:"approved_at"`
	ApprovedBy          *string        `json:"approved_by"`
	RevokedAt           *string        `json:"revoked_at"`
	TotalReferrals      int `json:"total_referrals"`
	RedeemedCredits     int `json:"redeemed_credits"`
}

type listResponse struct {
	Codes   []affiliateCodeEntry `json:"codes"`
	Total   int                  `json:"total"`
	Page    int                  `json:"page"`
	PerPage int                  `json:"per_page"`
}

func ListHandler(ctx *gin.Context) {
	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}

	perPage, _ := strconv.Atoi(ctx.DefaultQuery("per_page", strconv.Itoa(defaultPageSize)))
	if perPage < 1 || perPage > maxPageSize {
		perPage = defaultPageSize
	}

	offset := (page - 1) * perPage

	var status *string
	if s := ctx.Query("status"); s != "" {
		status = &s
	}

	group, groupCtx := errgroup.WithContext(ctx)

	var entries []affiliateCodeEntry
	var total int

	group.Go(func() error {
		results, err := dbclient.Client.AffiliateCodes.ListAll(groupCtx, status, perPage, offset)
		if err != nil {
			return err
		}

		entries = make([]affiliateCodeEntry, len(results))

		userGroup, userCtx := errgroup.WithContext(groupCtx)
		for i, r := range results {
			i := i
			r := r

			entry := affiliateCodeEntry{
				Id:                  r.Id.String(),
				UserId:              strconv.FormatUint(r.UserId, 10),
				Username:            "Unknown User",
				Code:                r.Code,
				PolarDiscountId:     r.PolarDiscountId,
				Status:              r.Status,
				DiscountBasisPoints: r.DiscountBasisPoints,
				CreditPercentage:    r.CreditPercentage,
				CreatedAt:           r.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			}

			if r.ApprovedAt != nil {
				formatted := r.ApprovedAt.Format("2006-01-02T15:04:05Z07:00")
				entry.ApprovedAt = &formatted
			}

			if r.ApprovedBy != nil {
				s := strconv.FormatUint(*r.ApprovedBy, 10)
				entry.ApprovedBy = &s
			}

			if r.RevokedAt != nil {
				formatted := r.RevokedAt.Format("2006-01-02T15:04:05Z07:00")
				entry.RevokedAt = &formatted
			}

			entries[i] = entry

			userGroup.Go(func() error {
				user, err := cache.Instance.GetUser(userCtx, r.UserId)
				if err == nil {
					entries[i].Username = user.Username
					entries[i].AvatarUrl = user.AvatarUrl(256)
				} else if !errors.Is(err, cache2.ErrNotFound) {
					return err
				}

				count, err := dbclient.Client.AffiliateReferrals.CountByAffiliateUserId(userCtx, r.UserId)
				if err != nil {
					return err
				}
				entries[i].TotalReferrals = count

				redeemed, _ := dbclient.Client.AffiliateReferrals.SumRedeemedByUser(userCtx, r.UserId)
				entries[i].RedeemedCredits = redeemed

				return nil
			})
		}

		return userGroup.Wait()
	})

	group.Go(func() error {
		var err error
		total, err = dbclient.Client.AffiliateCodes.CountAll(groupCtx, status)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch affiliate codes. Please try again."))
		return
	}

	if entries == nil {
		entries = make([]affiliateCodeEntry, 0)
	}

	ctx.JSON(http.StatusOK, listResponse{
		Codes:   entries,
		Total:   total,
		Page:    page,
		PerPage: perPage,
	})
}
