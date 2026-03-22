package polar

import (
	"net/http"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

// GetProducts returns the list of all available Polar products.
func GetProducts(ctx *gin.Context) {
	products, err := dbclient.Client.PolarProducts.ListAll(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to load products."))
		return
	}

	ctx.JSON(http.StatusOK, products)
}
