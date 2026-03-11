package premiumkeys

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
)

type premiumKeysResponse struct {
	Keys    []premiumKeyEntry `json:"keys"`
	Total   int               `json:"total"`
	Page    int               `json:"page"`
	PerPage int               `json:"per_page"`
}

type premiumKeyEntry struct {
	Key         string  `json:"key"`
	Length      *int64  `json:"length,omitempty"`
	SkuId       *string `json:"sku_id,omitempty"`
	GeneratedAt *string `json:"generated_at,omitempty"`
	SkuLabel    *string `json:"sku_label,omitempty"`
	Tier        *string `json:"tier,omitempty"`
	GuildId     *uint64 `json:"guild_id,string,omitempty"`
	ActivatedBy *uint64 `json:"activated_by,string,omitempty"`
	IsUsed      bool    `json:"is_used"`
}

func ListPremiumKeysHandler(ctx *gin.Context) {
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

	var entries []premiumKeyEntry
	var total int

	group.Go(func() error {
		results, err := database.Client.PremiumKeys.ListAll(groupCtx, perPage, offset)
		if err != nil {
			return err
		}

		entries = make([]premiumKeyEntry, len(results))
		for i, r := range results {
			entry := premiumKeyEntry{
				Key:    r.Key.String(),
				IsUsed: r.IsUsed,
			}

			if r.Length != nil {
				ns := r.Length.Nanoseconds()
				entry.Length = &ns
			}

			if r.SkuId != nil {
				s := r.SkuId.String()
				entry.SkuId = &s
			}

			if r.GeneratedAt != nil {
				formatted := r.GeneratedAt.Format(time.RFC3339)
				entry.GeneratedAt = &formatted
			}

			entry.SkuLabel = r.SkuLabel
			entry.Tier = r.Tier
			entry.GuildId = r.GuildId
			entry.ActivatedBy = r.ActivatedBy

			entries[i] = entry
		}

		return nil
	})

	group.Go(func() error {
		var err error
		total, err = database.Client.PremiumKeys.CountAll(groupCtx)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch premium keys. Please try again."))
		return
	}

	ctx.JSON(200, premiumKeysResponse{
		Keys:    entries,
		Total:   total,
		Page:    page,
		PerPage: perPage,
	})
}
