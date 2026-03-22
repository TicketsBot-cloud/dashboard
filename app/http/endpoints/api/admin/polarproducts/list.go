package polarproducts

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

// ListHandler returns all polar products.
func ListHandler(ctx *gin.Context) {
	products, err := database.Client.PolarProducts.ListAll(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch polar products."))
		return
	}

	ctx.JSON(http.StatusOK, products)
}
