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

type updateBody struct {
	PolarProductId   string   `json:"polar_product_id"`
	SkuId            string   `json:"sku_id"`
	Name             string   `json:"name"`
	Description      string   `json:"description"`
	Interval         string   `json:"interval"`
	PriceGbp         int      `json:"price_gbp"`
	Features         []string `json:"features"`
	Highlighted      bool     `json:"highlighted"`
	SortOrder        int      `json:"sort_order"`
	Tier             string   `json:"tier"`
	ServersPermitted *int     `json:"servers_permitted,omitempty"`
}

// UpdateHandler updates an existing polar product.
func UpdateHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	productId, err := uuid.Parse(ctx.Param("productid"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid product ID."))
		return
	}

	var body updateBody
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

	if body.PriceGbp <= 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Price must be greater than zero."))
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

	// Fetch existing product for audit logging.
	existing, err := database.Client.PolarProducts.GetByPolarProductId(ctx, body.PolarProductId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch existing product."))
		return
	}

	product := dbmodel.PolarProduct{
		Id:               productId,
		PolarProductId:   body.PolarProductId,
		SkuId:            skuId,
		Name:             body.Name,
		Description:      body.Description,
		Interval:         body.Interval,
		PriceGbp:         body.PriceGbp,
		Features:         body.Features,
		Highlighted:      body.Highlighted,
		SortOrder:        body.SortOrder,
		Tier:             body.Tier,
		ServersPermitted: body.ServersPermitted,
	}

	if err := database.Client.WithTx(ctx, func(tx pgx.Tx) error {
		return database.Client.PolarProducts.Update(ctx, tx, product)
	}); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update polar product."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionPolarProductUpdate,
		ResourceType: dbmodel.AuditResourcePolarProduct,
		ResourceId:   audit.StringPtr(productId.String()),
		OldData:      existing,
		NewData:      product,
	})

	ctx.JSON(http.StatusOK, product)
}
