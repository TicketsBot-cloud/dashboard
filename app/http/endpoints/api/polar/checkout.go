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
	ProductId     string  `json:"product_id" binding:"required"`
	AffiliateCode *string `json:"affiliate_code,omitempty"`
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

	var discountId *string
	metadata := map[string]components.CheckoutCreateMetadata{
		"discord_user_id": components.CreateCheckoutCreateMetadataStr(strconv.FormatUint(userId, 10)),
	}

	if body.AffiliateCode != nil && *body.AffiliateCode != "" {
		affiliateCode, err := dbclient.Client.AffiliateCodes.GetByCode(ctx, *body.AffiliateCode)
		if err != nil || affiliateCode == nil || affiliateCode.Status != "active" {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid or inactive affiliate code."))
			return
		}

		if affiliateCode.UserId == userId {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("You cannot use your own affiliate code."))
			return
		}

		if affiliateCode.PolarDiscountId != nil {
			discountId = affiliateCode.PolarDiscountId
		}

		metadata["affiliate_code"] = components.CreateCheckoutCreateMetadataStr(affiliateCode.Code)
		metadata["affiliate_code_id"] = components.CreateCheckoutCreateMetadataStr(affiliateCode.Id.String())
		metadata["affiliate_user_id"] = components.CreateCheckoutCreateMetadataStr(strconv.FormatUint(affiliateCode.UserId, 10))
	}

	userIdStr := strconv.FormatUint(userId, 10)
	successUrl := config.Conf.Polar.CheckoutSuccessUrl
	currency := components.PresentmentCurrency(selected.Currency)

	res, err := GetPolarClient().Checkouts.Create(ctx, components.CheckoutCreate{
		Products:           productIds,
		ExternalCustomerID: &userIdStr,
		SuccessURL:         &successUrl,
		Currency:           &currency,
		DiscountID:         discountId,
		Metadata:           metadata,
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
