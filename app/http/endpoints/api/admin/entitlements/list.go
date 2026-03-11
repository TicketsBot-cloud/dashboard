package entitlements

import (
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const (
	defaultPageSize = 50
	maxPageSize     = 200
	gracePeriod     = 24 * time.Hour
)

type entitlementsResponse struct {
	Entitlements []entitlementEntry `json:"entitlements"`
	Total        int                `json:"total"`
	Page         int                `json:"page"`
	PerPage      int                `json:"per_page"`
}

type entitlementEntry struct {
	Id          string  `json:"id"`
	UserId      *uint64 `json:"user_id,string,omitempty"`
	Source      string  `json:"source"`
	ExpiresAt   *string `json:"expires_at,omitempty"`
	SkuId       string  `json:"sku_id"`
	SkuLabel    string  `json:"sku_label"`
	Tier        string  `json:"tier"`
	SkuPriority int32   `json:"sku_priority"`
}

func ListEntitlementsHandler(ctx *gin.Context) {
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

	var entries []entitlementEntry
	var total int

	group.Go(func() error {
		results, err := database.Client.Entitlements.ListAllUserSubscriptionsPaginated(groupCtx, gracePeriod, perPage, offset)
		if err != nil {
			return err
		}

		entries = make([]entitlementEntry, len(results))
		for i, r := range results {
			entry := entitlementEntry{
				Id:          r.Id.String(),
				UserId:      r.UserId,
				Source:      string(r.Source),
				SkuId:       r.SkuId.String(),
				SkuLabel:    r.SkuLabel,
				Tier:        string(r.Tier),
				SkuPriority: r.SkuPriority,
			}

			if r.ExpiresAt != nil {
				formatted := r.ExpiresAt.Format(time.RFC3339)
				entry.ExpiresAt = &formatted
			}

			entries[i] = entry
		}

		return nil
	})

	group.Go(func() error {
		var err error
		total, err = database.Client.Entitlements.CountAllUserSubscriptions(groupCtx, gracePeriod)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch entitlements. Please try again."))
		return
	}

	ctx.JSON(200, entitlementsResponse{
		Entitlements: entries,
		Total:        total,
		Page:         page,
		PerPage:      perPage,
	})
}
