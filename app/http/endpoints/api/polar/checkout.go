package polar

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/polarsource/polar-go/models/components"
)

type createCheckoutBody struct {
	ProductId string `json:"product_id" binding:"required"`
}

func CreateCheckout(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body createCheckoutBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
		return
	}

	// Look up the selected product and find its sibling variants (same name,
	// different billing interval) so the customer can switch between them on the
	// checkout page.
	selected, err := dbclient.Client.PolarProducts.GetByPolarProductId(ctx, body.ProductId)
	if err != nil || selected == nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid product ID"))
		return
	}

	allProducts, err := dbclient.Client.PolarProducts.ListAll(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to load products. Please try again."))
		return
	}

	// Build the products list: selected product first, then siblings with the
	// same name but a different interval.
	productIds := []string{body.ProductId}
	for _, p := range allProducts {
		if p.Name == selected.Name && p.PolarProductId != body.ProductId {
			productIds = append(productIds, p.PolarProductId)
		}
	}

	userIdStr := strconv.FormatUint(userId, 10)
	successUrl := config.Conf.Polar.CheckoutSuccessUrl
	gbp := components.PresentmentCurrencyGbp

	res, err := getPolarClient().Checkouts.Create(ctx, components.CheckoutCreate{
		Products:           productIds,
		ExternalCustomerID: &userIdStr,
		SuccessURL:         &successUrl,
		Currency:           &gbp,
		Metadata: map[string]components.CheckoutCreateMetadata{
			"discord_user_id": components.CreateCheckoutCreateMetadataStr(userIdStr),
		},
	})
	if err != nil {
		ctx.JSON(http.StatusBadGateway, utils.ErrorStr("Failed to create checkout session with payment provider."))
		return
	}

	if res.Checkout == nil || res.Checkout.URL == "" {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("No checkout URL returned from payment provider."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionPolarCheckoutCreate,
		ResourceType: database.AuditResourcePolarSubscription,
		NewData: map[string]string{
			"product_id": body.ProductId,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"checkout_url": res.Checkout.URL,
	})
}
