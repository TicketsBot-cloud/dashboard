package skus

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// ListHandler returns all SKUs with their subscription and multi-server details.
func ListHandler(ctx *gin.Context) {
	skus, err := database.Client.Skus.ListAll(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch SKUs. Please try again."))
		return
	}

	if skus == nil {
		skus = make([]dbmodel.SkuWithDetails, 0)
	}

	ctx.JSON(http.StatusOK, skus)
}
