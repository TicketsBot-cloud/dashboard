package polarproducts

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
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
