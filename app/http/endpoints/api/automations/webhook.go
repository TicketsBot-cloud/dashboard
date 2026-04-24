package automations

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/workflowbus"
	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
)

// webhookProducer is the package-level Kafka producer used by HandleWebhook.
// Set once at server startup via SetWebhookProducer.
var webhookProducer *workflowbus.Producer

// SetWebhookProducer wires the signed Kafka producer into the webhook handler.
// Must be called before the HTTP server starts accepting requests.
func SetWebhookProducer(p *workflowbus.Producer) {
	webhookProducer = p
}

const (
	webhookSecretBytes = 32 // 256-bit random
	webhookMaxBodyBytes = 64 * 1024
)

// HandleWebhook is the public, unauthenticated endpoint that external callers
// POST to in order to trigger a webhook-type automation. The URL encodes the
// guild id and a per-automation secret; both are validated before producing.
//
// POST /api/webhook/automation/:guildId/:secret
//
// Returns:
//   - 202 on successful enqueue
//   - 400 on bad request (missing body, oversized)
//   - 404 on wrong/expired secret
//   - 500 on internal error
//   - 503 if the Kafka producer is unconfigured
func HandleWebhook(c *gin.Context) {
	if webhookProducer == nil {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Webhook processing is not available"))
		return
	}

	guildIdStr := c.Param("guildId")
	secret := c.Param("secret")

	guildId, err := strconv.ParseUint(guildIdStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Not found"))
		return
	}

	// Look up the automation by webhook secret. Returns (Automation, bool, error).
	auto, ok, err := dbclient.Client.Automations.GetByWebhookSecret(c, secret)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Webhook lookup failed"))
		return
	}
	if !ok || auto.GuildId != guildId {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Not found"))
		return
	}
	if !auto.Enabled || auto.PublishedGraph == nil {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Automation is not enabled"))
		return
	}

	// Read the caller's body (optional; may be empty for signal-only webhooks).
	var bodyJSON json.RawMessage
	if c.Request.Body != nil {
		raw, err := io.ReadAll(io.LimitReader(c.Request.Body, webhookMaxBodyBytes+1))
		if err != nil {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("Failed to read request body"))
			return
		}
		if len(raw) > webhookMaxBodyBytes {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("Request body exceeds 64 KB limit"))
			return
		}
		if len(raw) > 0 {
			if json.Valid(raw) {
				bodyJSON = raw
			} else {
				bodyJSON, _ = json.Marshal(string(raw))
			}
		}
	}
	if bodyJSON == nil {
		bodyJSON = json.RawMessage("{}")
	}

	payload := workflowbus.WebhookPayload{
		AutomationId: auto.Id,
		Body:         bodyJSON,
	}

	workflowbus.Emit(c, workflowbus.TriggerWebhook, guildId, "", payload)
	c.JSON(http.StatusAccepted, gin.H{"status": "accepted"})
}

// GenerateWebhookSecret returns a fresh cryptographic secret for webhook URLs.
func GenerateWebhookSecret() (string, error) {
	b := make([]byte, webhookSecretBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
