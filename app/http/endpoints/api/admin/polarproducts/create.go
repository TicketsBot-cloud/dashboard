package polarproducts

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v4"
)

type createBody struct {
	PolarProductId   string   `json:"polar_product_id"`
	SkuId            string   `json:"sku_id"`
	Name             string   `json:"name"`
	Description      string   `json:"description"`
	Interval         string   `json:"interval"`
	Price            int      `json:"price"`
	Currency         string   `json:"currency"`
	Features         []string `json:"features"`
	Highlighted      bool     `json:"highlighted"`
	SortOrder        int      `json:"sort_order"`
	Tier             string   `json:"tier"`
	ServersPermitted *int     `json:"servers_permitted,omitempty"`
}

// CreateHandler creates a new polar product.
func CreateHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body createBody
	if err := ctx.BindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Failed to process request body."))
		return
	}

	if body.PolarProductId == "" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Polar product ID must not be empty."))
		return
	}

	if body.Name == "" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Name must not be empty."))
		return
	}

	if body.Price <= 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Price must be greater than zero."))
		return
	}

	validCurrencies := map[string]bool{
		"aud": true, "brl": true, "cad": true, "chf": true, "eur": true,
		"inr": true, "gbp": true, "jpy": true, "sek": true, "usd": true,
	}
	if !validCurrencies[body.Currency] {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Currency must be a valid Polar currency code."))
		return
	}

	if body.Interval != "month" && body.Interval != "year" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Interval must be \"month\" or \"year\"."))
		return
	}

	if body.Tier != "premium" && body.Tier != "whitelabel" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Tier must be \"premium\" or \"whitelabel\"."))
		return
	}

	skuId, err := uuid.Parse(body.SkuId)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid SKU ID provided."))
		return
	}

	if body.Features == nil {
		body.Features = make([]string, 0)
	}

	product := dbmodel.PolarProduct{
		PolarProductId:   body.PolarProductId,
		SkuId:            skuId,
		Name:             body.Name,
		Description:      body.Description,
		Interval:         body.Interval,
		Price:            body.Price,
		Currency:         body.Currency,
		Features:         body.Features,
		Highlighted:      body.Highlighted,
		SortOrder:        body.SortOrder,
		Tier:             body.Tier,
		ServersPermitted: body.ServersPermitted,
	}

	var created dbmodel.PolarProduct
	if err := database.Client.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = database.Client.PolarProducts.Create(ctx, tx, product)
		return err
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to create polar product."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionPolarProductCreate,
		ResourceType: dbmodel.AuditResourcePolarProduct,
		ResourceId:   audit.StringPtr(created.Id.String()),
		NewData:      created,
	})

	ctx.JSON(http.StatusCreated, created)
}
