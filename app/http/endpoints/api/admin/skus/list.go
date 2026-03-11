package skus

import (
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

type skuResponse struct {
	Id       string `json:"id"`
	Label    string `json:"label"`
	Tier     string `json:"tier"`
	Priority int32  `json:"priority"`
	IsGlobal bool   `json:"is_global"`
}

func ListHandler(ctx *gin.Context) {
	skus, err := database.Client.SubscriptionSkus.Search(ctx, "", 100)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch SKUs. Please try again."))
		return
	}

	response := make([]skuResponse, len(skus))
	for i, sku := range skus {
		response[i] = skuResponse{
			Id:       sku.Id.String(),
			Label:    sku.Label,
			Tier:     string(sku.Tier),
			Priority: sku.Priority,
			IsGlobal: sku.IsGlobal,
		}
	}

	ctx.JSON(200, response)
}
