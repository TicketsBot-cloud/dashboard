package polar

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
	"github.com/polarsource/polar-go/models/operations"
)

type orderResponse struct {
	Id             string  `json:"id"`
	CreatedAt      string  `json:"created_at"`
	Status         string  `json:"status"`
	Paid           bool    `json:"paid"`
	TotalAmount    int64   `json:"total_amount"`
	TaxAmount      int64   `json:"tax_amount"`
	Currency       string  `json:"currency"`
	BillingReason  string  `json:"billing_reason"`
	InvoiceNumber  string  `json:"invoice_number"`
	ProductName    *string `json:"product_name"`
	HasInvoice     bool    `json:"has_invoice"`
	RefundedAmount int64   `json:"refunded_amount"`
}

// GetOrders returns the authenticated user's Polar order/receipt history.
func GetOrders(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)
	userIdStr := strconv.FormatUint(userId, 10)

	page := int64(1)
	limit := int64(50)

	if p, err := strconv.ParseInt(ctx.DefaultQuery("page", "1"), 10, 64); err == nil && p > 0 {
		page = p
	}

	externalIdFilter := operations.CreateOrdersListQueryParamExternalCustomerIDFilterStr(userIdStr)

	res, err := getPolarClient().Orders.List(ctx, operations.OrdersListRequest{
		ExternalCustomerID: &externalIdFilter,
		Page:               &page,
		Limit:              &limit,
	})
	if err != nil {
		ctx.JSON(http.StatusBadGateway, utils.ErrorStr("Failed to fetch order history from payment provider."))
		return
	}

	if res.ListResourceOrder == nil {
		ctx.JSON(http.StatusOK, gin.H{
			"orders": []orderResponse{},
			"total":  0,
			"page":   page,
		})
		return
	}

	orders := make([]orderResponse, 0, len(res.ListResourceOrder.Items))
	for _, o := range res.ListResourceOrder.Items {
		var productName *string
		if o.Product != nil {
			productName = &o.Product.Name
		}

		orders = append(orders, orderResponse{
			Id:             o.ID,
			CreatedAt:      o.CreatedAt.Format("2006-01-02T15:04:05Z"),
			Status:         string(o.Status),
			Paid:           o.Paid,
			TotalAmount:    o.TotalAmount,
			TaxAmount:      o.TaxAmount,
			Currency:       o.Currency,
			BillingReason:  string(o.BillingReason),
			InvoiceNumber:  o.InvoiceNumber,
			ProductName:    productName,
			HasInvoice:     o.IsInvoiceGenerated,
			RefundedAmount: o.RefundedAmount,
		})
	}

	ctx.JSON(http.StatusOK, gin.H{
		"orders": orders,
		"total":  res.ListResourceOrder.Pagination.TotalCount,
		"page":   page,
	})
}

// GetOrderInvoice returns the invoice URL for a specific order, after verifying
// the order belongs to the authenticated user.
func GetOrderInvoice(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)
	userIdStr := strconv.FormatUint(userId, 10)
	orderId := ctx.Param("orderid")

	// Verify the order belongs to this user by fetching it and checking the customer.
	orderRes, err := getPolarClient().Orders.Get(ctx, orderId)
	if err != nil || orderRes.Order == nil {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Order not found"))
		return
	}

	if orderRes.Order.Customer.ExternalID == nil || *orderRes.Order.Customer.ExternalID != userIdStr {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Order not found"))
		return
	}

	invoiceRes, err := getPolarClient().Orders.Invoice(ctx, orderId)
	if err != nil || invoiceRes.OrderInvoice == nil {
		ctx.JSON(http.StatusBadGateway, utils.ErrorStr("Failed to fetch invoice from payment provider."))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"invoice_url": invoiceRes.OrderInvoice.URL,
	})
}
