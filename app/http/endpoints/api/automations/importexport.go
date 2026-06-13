package automations

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type exportedAutomation struct {
	SchemaVersion int                      `json:"_schema_version"`
	Name          string                   `json:"name"`
	Description   string                   `json:"description,omitempty"`
	Graph         database.AutomationGraph `json:"graph"`
}

// ExportAutomation returns the published graph (or draft if never published)
// stripped of ids, guild context, and secrets — safe to share publicly.
func ExportAutomation(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	auto, ok := resolveAutomation(c, guildId)
	if !ok {
		return
	}

	graph := auto.DraftGraph
	if auto.PublishedGraph != nil {
		graph = *auto.PublishedGraph
	}

	c.JSON(200, exportedAutomation{
		SchemaVersion: 1,
		Name:          auto.Name,
		Description:   stringVal(auto.Description),
		Graph:         graph,
	})
}

// ImportAutomation creates a new draft automation from an uploaded JSON blob.
// Node IDs are rewritten to fresh values so there's no collision with existing
// automations. The import always creates in draft (never auto-publishes) and
// enforces the guild's tier quota.
func ImportAutomation(c *gin.Context) {
	guildId, tier, ok := loadTierAndGuildId(c)
	if !ok {
		return
	}
	userId := c.Keys["userid"].(uint64)

	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 256*1024))
	if err != nil {
		c.JSON(400, utils.ErrorStr("Failed to read request body"))
		return
	}
	if len(raw) > 256*1024 {
		c.JSON(400, utils.ErrorStr("Import file exceeds 256 KB limit"))
		return
	}

	var imported exportedAutomation
	if err := json.Unmarshal(raw, &imported); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid JSON: %s", err.Error()))
		return
	}

	if imported.Name == "" {
		c.JSON(400, utils.ErrorStr("Imported automation must have a name"))
		return
	}
	if len(imported.Graph.Nodes) == 0 {
		c.JSON(400, utils.ErrorStr("Imported automation has no nodes"))
		return
	}

	maxAutomations, maxSteps := limitsForTier(tier)
	if msg := ValidateGraph(imported.Graph, maxSteps, tier); msg != "" {
		c.JSON(400, utils.ErrorStr("Imported graph is invalid: %s", msg))
		return
	}

	database.RewriteAutomationNodeIds(&imported.Graph)

	desc := imported.Description
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}

	id, err := dbclient.Client.Automations.CreateWithLimit(c, guildId, maxAutomations, imported.Name, descPtr, imported.Graph, userId)
	if err != nil {
		if err == database.ErrAutomationQuotaExceeded {
			c.JSON(402, utils.ErrorStr("Automation quota reached"))
			return
		}
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to import automation"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionAutomationImport,
		ResourceType: database.AuditResourceAutomation,
		ResourceId:   audit.StringPtr(stringFromInt64(id)),
		NewData:      imported,
	})

	c.JSON(200, gin.H{"id": id})
}

func stringVal(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func stringFromInt64(n int64) string {
	return strconv.FormatInt(n, 10)
}
