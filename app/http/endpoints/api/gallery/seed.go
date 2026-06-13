package gallery

import (
	"context"
	stdjson "encoding/json"

	"github.com/TicketsBot-cloud/database"
	"go.uber.org/zap"
)

type seedTemplate struct {
	Name        string
	Description string
	Category    string
	Premium     bool
	Graph       database.AutomationGraph
}

var seedTemplates = []seedTemplate{
	{
		Name:        "VIP auto-route",
		Description: "When a VIP opens a ticket, send a welcome message and apply the VIP label.",
		Category:    "support",
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
		Name:        "Follow-up DM on close",
		Description: "DM the ticket opener when their ticket is closed.",
		Category:    "support",
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
		Name:        "Daily summary to log channel",
		Description: "Post a daily summary message at 09:00 UTC. Customise the content to include stats or reminders.",
		Category:    "other",
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
		Name:        "CRM sync on ticket create",
		Description: "POST ticket data to your CRM API when a ticket is created.",
		Category:    "other",
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
		Name:        "Label on claim",
		Description: "Automatically apply an 'In Progress' label when a ticket is claimed.",
		Category:    "support",
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
	{
		Name:        "Keyword escalation",
		Description: "When a message in a ticket contains urgent language, assign the ticket to your escalation team and log an alert.",
		Category:    "support",
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "message.sent", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "c1", Type: "condition", Kind: "and", Mode: "OR",
					Clauses: []database.AutomationClause{
						{Left: "%trigger:content%", Op: "contains", Right: "urgent"},
						{Left: "%trigger:content%", Op: "contains", Right: "emergency"},
						{Left: "%trigger:content%", Op: "contains", Right: "critical"},
					},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
				{Id: "a1", Type: "action", Kind: "assign_team",
					Config:   map[string]any{"team_id": "0"},
					Position: database.AutomationNodePosition{X: 640, Y: -70}},
				{Id: "a2", Type: "action", Kind: "log_to_channel",
					Config:   map[string]any{"channel_id": "", "content": "Ticket #%ticket_id% flagged as urgent by %user%. Message: %trigger:content%"},
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
		Name:        "Low rating follow-up",
		Description: "When a ticket receives a 1 or 2 star rating, DM the user with an apology and alert your staff channel.",
		Category:    "feedback",
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "rating.submitted", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "c1", Type: "condition", Kind: "and", Mode: "OR",
					Clauses: []database.AutomationClause{
						{Left: "%ticket:rating%", Op: "eq", Right: "1"},
						{Left: "%ticket:rating%", Op: "eq", Right: "2"},
					},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
				{Id: "a1", Type: "action", Kind: "dm_user",
					Config:   map[string]any{"content": "We noticed your recent support experience was not up to standard. We take all feedback seriously and a manager will review your case. Thank you for letting us know."},
					Position: database.AutomationNodePosition{X: 640, Y: -70}},
				{Id: "a2", Type: "action", Kind: "log_to_channel",
					Config:   map[string]any{"channel_id": "", "content": "Low rating alert: Ticket #%ticket_id% received %ticket:rating% stars. Opener: %user%"},
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
		Name:        "Welcome message with embed",
		Description: "Send a professional welcome embed when a new ticket is created.",
		Category:    "support",
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "ticket.created", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "a1", Type: "action", Kind: "send_embed",
					Config: map[string]any{
						"title":       "Welcome to Support",
						"description": "Hello %user%, thank you for opening a ticket. A member of our team will be with you shortly.\n\nPlease describe your issue in detail so we can help you as quickly as possible.",
						"colour":      5814783,
						"footer_text": "Ticket #%ticket_id%",
						"fields":      []any{},
					},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
			},
			Edges: []database.AutomationEdge{
				{From: "t1", FromPort: "next", To: "a1"},
			},
		},
	},
	{
		Name:        "Escalation after delay",
		Description: "Wait one hour after a ticket is created. If no staff has claimed it, send an alert to your escalation channel.",
		Category:    "support",
		Premium:     true,
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "ticket.created", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "a1", Type: "action", Kind: "delay",
					Config:   map[string]any{"duration_seconds": float64(3600), "duration_unit": "hours"},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
				{Id: "c1", Type: "condition", Kind: "and", Mode: "AND",
					Clauses: []database.AutomationClause{
						{Left: "%claimer:id%", Op: "is_empty"},
					},
					Position: database.AutomationNodePosition{X: 640, Y: 0}},
				{Id: "a2", Type: "action", Kind: "log_to_channel",
					Config:   map[string]any{"channel_id": "", "content": "Ticket #%ticket_id% has been waiting over an hour with no response. Opener: %user%"},
					Position: database.AutomationNodePosition{X: 960, Y: -70}},
			},
			Edges: []database.AutomationEdge{
				{From: "t1", FromPort: "next", To: "a1"},
				{From: "a1", FromPort: "next", To: "c1"},
				{From: "c1", FromPort: "true", To: "a2"},
			},
		},
	},
	{
		Name:        "Transfer notification",
		Description: "When a ticket is transferred, notify the new assignee via DM and send an embed update in the ticket channel.",
		Category:    "support",
		Graph: database.AutomationGraph{
			Version: 1,
			Nodes: []database.AutomationNode{
				{Id: "t1", Type: "trigger", Kind: "ticket.transferred", Position: database.AutomationNodePosition{X: 0, Y: 0}},
				{Id: "a1", Type: "action", Kind: "send_embed",
					Config: map[string]any{
						"title":       "Ticket Transferred",
						"description": "This ticket has been transferred to a new team member. They will continue assisting you shortly.",
						"colour":      3447003,
						"footer_text": "Ticket #%ticket_id%",
						"fields":      []any{},
					},
					Position: database.AutomationNodePosition{X: 320, Y: 0}},
			},
			Edges: []database.AutomationEdge{
				{From: "t1", FromPort: "next", To: "a1"},
			},
		},
	},
}

// SeedAutomationTemplates creates the built-in automation templates as approved,
// featured gallery listings if they don't already exist. Called at startup; idempotent.
// System seeds use submitter_user_id=0 as a sentinel.
func SeedAutomationTemplates(ctx context.Context, db *database.Database, logger *zap.Logger) {
	existing, err := db.GalleryListings.CountByTypeAndSubmitter(ctx, database.GalleryListingTypeAutomation, 0)
	if err != nil {
		logger.Error("failed to check for seeded automation templates", zap.Error(err))
		return
	}
	if existing > 0 {
		return
	}

	for _, tpl := range seedTemplates {
		triggerKind := ""
		for _, node := range tpl.Graph.Nodes {
			if node.Type == "trigger" {
				triggerKind = node.Kind
				break
			}
		}

		snapshot := database.GalleryAutomationSnapshot{
			Graph:       tpl.Graph,
			TriggerKind: triggerKind,
			Premium:     tpl.Premium,
		}

		snapshotJSON, err := stdjson.Marshal(snapshot)
		if err != nil {
			logger.Error("failed to serialise seed automation template", zap.String("name", tpl.Name), zap.Error(err))
			continue
		}

		listing := database.GalleryListing{
			SubmitterUserId: 0,
			SourceGuildId:   0,
			ListingType:     database.GalleryListingTypeAutomation,
			Name:            tpl.Name,
			Description:     tpl.Description,
			Category:        tpl.Category,
			Status:          database.GalleryListingStatusApproved,
			SnapshotData:    snapshotJSON,
			Title:           "",
			Content:         "",
			Colour:          0,
			ButtonLabel:     "",
		}

		listingId, err := db.GalleryListings.Create(ctx, listing)
		if err != nil {
			logger.Error("failed to seed automation template", zap.String("name", tpl.Name), zap.Error(err))
			continue
		}

		// Mark as featured
		featured := true
		if err := db.GalleryListings.Update(ctx, listingId, nil, &featured); err != nil {
			logger.Error("failed to feature seeded automation template", zap.String("name", tpl.Name), zap.Error(err))
		}

		logger.Info("seeded automation template", zap.String("name", tpl.Name), zap.Int("listing_id", listingId))
	}
}
