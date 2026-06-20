package polarproducts

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/polar"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

type lookupResponse struct {
	Name     string `json:"name"`
	Price    int64  `json:"price"`
	Currency string `json:"currency"`
	Interval string `json:"interval"`
}

// LookupHandler fetches a product's pricing details from the Polar API.
func LookupHandler(ctx *gin.Context) {
	polarProductId := ctx.Query("polar_product_id")
	if polarProductId == "" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Missing polar_product_id query parameter."))
		return
	}

	res, err := polar.GetPolarClient().Products.Get(ctx, polarProductId)
	if err != nil || res.Product == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Product not found on Polar."))
		return
	}

	product := res.Product

	var price int64
	var currency string
	for _, p := range product.Prices {
		if p.ProductPrice != nil && p.ProductPrice.ProductPriceFixed != nil {
			price = p.ProductPrice.ProductPriceFixed.PriceAmount
			currency = p.ProductPrice.ProductPriceFixed.PriceCurrency
			break
		}
		if p.LegacyRecurringProductPrice != nil && p.LegacyRecurringProductPrice.LegacyRecurringProductPriceFixed != nil {
			price = p.LegacyRecurringProductPrice.LegacyRecurringProductPriceFixed.PriceAmount
			currency = p.LegacyRecurringProductPrice.LegacyRecurringProductPriceFixed.PriceCurrency
			break
		}
	}

	interval := ""
	if product.RecurringInterval != nil {
		interval = string(*product.RecurringInterval)
	}

	ctx.JSON(http.StatusOK, lookupResponse{
		Name:     product.Name,
		Price:    price,
		Currency: currency,
		Interval: interval,
	})
}
