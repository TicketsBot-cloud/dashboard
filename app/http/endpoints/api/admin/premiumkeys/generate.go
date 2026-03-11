package premiumkeys

import (
	"time"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type generateBody struct {
	SkuId  string `json:"sku_id"`
	Length int    `json:"length"`
	Amount int    `json:"amount"`
}

func GenerateHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var body generateBody
	if err := ctx.BindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Failed to process request body. Please try again."))
		return
	}

	skuId, err := uuid.Parse(body.SkuId)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid SKU ID provided."))
		return
	}

	if body.Length <= 0 {
		ctx.JSON(400, utils.ErrorStr("Length must be greater than zero."))
		return
	}

	if body.Amount <= 0 {
		body.Amount = 1
	}

	if body.Amount > 50 {
		ctx.JSON(400, utils.ErrorStr("Amount must not exceed 50."))
		return
	}

	// Validate SKU exists
	tx, err := database.Client.BeginTx(ctx)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}
	defer tx.Rollback(ctx)

	sku, err := database.Client.SubscriptionSkus.GetSku(ctx, tx, skuId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to validate SKU. Please try again."))
		return
	}

	if sku == nil {
		ctx.JSON(400, utils.ErrorStr("The specified SKU does not exist."))
		return
	}

	if err := tx.Commit(ctx); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	// Generate keys
	keys := make([]uuid.UUID, body.Amount)
	keyStrings := make([]string, body.Amount)
	for i := 0; i < body.Amount; i++ {
		key := uuid.New()
		keys[i] = key
		keyStrings[i] = key.String()

		if err := database.Client.PremiumKeys.Create(ctx, key, time.Hour*24*time.Duration(body.Length), skuId); err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to generate premium keys. Please try again."))
			return
		}
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionPremiumKeyGenerate,
		ResourceType: dbmodel.AuditResourcePremiumKey,
		NewData:      map[string]any{"sku_id": skuId.String(), "length_days": body.Length, "amount": body.Amount, "keys": keyStrings},
	})

	ctx.JSON(200, gin.H{"keys": keyStrings})
}
