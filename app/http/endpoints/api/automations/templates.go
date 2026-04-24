package automations

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type automationTemplate struct {
	Id          string                   `json:"id"`
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	Category    string                   `json:"category"`
	Premium     bool                     `json:"premium"`
	Graph       database.AutomationGraph `json:"graph"`
}

// builtInTemplates is the in-memory gallery. Kept as Go structs rather than
// JSON files so the compiler catches schema drift against AutomationGraph.
var builtInTemplates = []automationTemplate{
	{
		Id:          "vip-auto-route",
		Name:        "VIP auto-route",
		Description: "When a VIP opens a ticket, send a welcome message and apply the VIP label.",
		Category:    "Routing",
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "ticket.created", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "c1", Type: "condition", Kind: "and", Mode: "AND",
					Clauses:  []database.AutomationClause{{Left: "%opener:id%", Op: "neq", Right: ""}},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
				{Id: "a1", Type: "action", Kind: "send_message",
					Config:   map[string]any{"content": "Hello %user%, a specialist will be with you shortly."},
					Position: database.AutomationNodePosition{X: 640, Y: -70}},
				{Id: "a2", Type: "action", Kind: "add_label",
					Config:   map[string]any{"label_id": 0},
					Position: database.AutomationNodePosition{X: 960, Y: -70}},
			},
			Edges: []database.AutomationEdge{
				{From: "t1", FromPort: "next", To: "c1"},
				{From: "c1", FromPort: "true", To: "a1"},
				{From: "a1", FromPort: "next", To: "a2"},
			},
		},
	},
	{
		Id:          "dm-on-close",
		Name:        "Follow-up DM on close",
		Description: "DM the ticket opener when their ticket is closed.",
		Category:    "Messaging",
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "ticket.closed", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "a1", Type: "action", Kind: "dm_user",
					Config:   map[string]any{"content": "Your ticket #%ticket_id% has been resolved. If you need further help, open a new ticket."},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
			},
			Edges: []database.AutomationEdge{
				{From: "t1", FromPort: "next", To: "a1"},
			},
		},
	},
	{
		Id:          "daily-log",
		Name:        "Daily summary to log channel",
		Description: "Post a daily summary message at 09:00 UTC. Customise the content to include stats or reminders.",
		Category:    "Scheduled",
		Premium:     true,
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "cron",
					Config:   map[string]any{"cron_expression": "0 0 9 * * *", "timezone": "UTC"},
					Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "a1", Type: "action", Kind: "send_message",
					Config:   map[string]any{"content": "Good morning! Here's your daily ticket summary."},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
			},
			Edges: []database.AutomationEdge{
				{From: "t1", FromPort: "next", To: "a1"},
			},
		},
	},
	{
		Id:          "crm-sync",
		Name:        "CRM sync on ticket create",
		Description: "POST ticket data to your CRM API when a ticket is created.",
		Category:    "External",
		Premium:     true,
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "ticket.created", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "a1", Type: "action", Kind: "http_request",
					Config: map[string]any{
						"method":  "POST",
						"url":     "https://api.example.com/tickets",
						"headers": map[string]any{"Authorization": "Bearer YOUR_API_KEY"},
						"body":    `{"ticket_id": %ticket_id%, "opener": "%opener_id%", "guild": "%guild_id%"}`,
					},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
			},
			Edges: []database.AutomationEdge{
				{From: "t1", FromPort: "next", To: "a1"},
			},
		},
	},
	{
		Id:          "auto-label-claimed",
		Name:        "Label on claim",
		Description: "Automatically apply an 'In Progress' label when a ticket is claimed.",
		Category:    "Organisation",
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "ticket.claimed", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "a1", Type: "action", Kind: "add_label",
					Config:   map[string]any{"label_id": 0},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
			},
			Edges: []database.AutomationEdge{
				{From: "t1", FromPort: "next", To: "a1"},
			},
		},
	},
}

// ListTemplates returns the built-in template gallery. No auth required beyond
// admin guild access (already enforced by the route group).
func ListTemplates(c *gin.Context) {
	c.JSON(200, builtInTemplates)
}

// CloneTemplate creates a new draft automation from a template. Node IDs are
// rewritten so two clones of the same template don't share IDs.
func CloneTemplate(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	templateId := c.Param("templateId")
	var tpl *automationTemplate
	for i := range builtInTemplates {
		if builtInTemplates[i].Id == templateId {
			tpl = &builtInTemplates[i]
			break
		}
	}
	if tpl == nil {
		c.JSON(404, gin.H{"error": "Template not found"})
		return
	}

	// Deep-copy the graph so node-id rewriting doesn't mutate the template.
	raw, err := json.Marshal(tpl.Graph)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to clone template"))
		return
	}
	var graph database.AutomationGraph
	if err := json.Unmarshal(raw, &graph); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to clone template"))
		return
	}

	rewriteNodeIds(&graph)

	desc := tpl.Description
	id, err := dbclient.Client.Automations.Create(c, guildId, tpl.Name, &desc, graph, userId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create automation from template"))
		return
	}

	c.JSON(200, gin.H{"id": id})
}

func rewriteNodeIds(g *database.AutomationGraph) {
	idMap := make(map[string]string, len(g.Nodes))
	for i, n := range g.Nodes {
		newId := newNodeId()
		idMap[n.Id] = newId
		g.Nodes[i].Id = newId
	}
	for i, e := range g.Edges {
		if mapped, ok := idMap[e.From]; ok {
			g.Edges[i].From = mapped
		}
		if mapped, ok := idMap[e.To]; ok {
			g.Edges[i].To = mapped
		}
	}
}

func newNodeId() string {
	return fmt.Sprintf("n-%d-%d", time.Now().UnixMilli(), time.Now().UnixNano()%10000)
}
