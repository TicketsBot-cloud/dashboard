package polar

import (
	"net/http"

	"github.com/gin-gonic/gin"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
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
