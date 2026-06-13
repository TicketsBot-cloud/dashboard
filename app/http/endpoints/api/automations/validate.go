package automations

import (
	"fmt"
	"strings"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/database"
	"github.com/robfig/cron/v3"
)

// Known trigger / action kinds. The dashboard validator is the gatekeeper — the
// executor is closed-world and will fail any graph referring to unknown kinds.
var (
	knownTriggerKinds = map[string]bool{
		"ticket.created":     true,
		"ticket.claimed":     true,
		"ticket.closed":      true,
		"ticket.reopened":    true,
		"ticket.transferred": true,
		"cron":               true,
		"webhook":            true,
		"message.sent":       true,
		"rating.submitted":   true,
	}

	knownActionKinds = map[string]bool{
		// Phase 1 baseline
		"send_message": true,
		"add_label":    true,
		"close_ticket": true,

		// Phase 2a additions — all executable
		"send_tag":         true,
		"dm_user":          true,
		"remove_label":     true,
		"assign_user":      true,
		"reply_to_trigger": true, // stub until Phase 3 message triggers

		// Phase 3 — validation-only until the executor ships them
		"assign_team":  true,
		"transfer":     true,
		"http_request": true,
		"send_embed":      true,
		"delay":           true,
		"log_to_channel":  true,
		"reopen_ticket":   true,
	}

	// Node kinds that require premium. The validator blocks them for free guilds.
	premiumOnlyKinds = map[string]bool{
		"cron":         true,
		"webhook":      true,
		"http_request": true,
	}

	knownConditionOps = map[string]bool{
		"eq": true, "neq": true,
		"contains": true, "not_contains": true,
		"starts_with": true, "ends_with": true,
		"in": true, "not_in": true,
		"gt": true, "lt": true, "gte": true, "lte": true,
		"is_empty": true, "is_not_empty": true,
	}
)

// ValidateGraph enforces structural invariants on a workflow graph.
// Returns a user-facing error message (suitable for 400 responses) or nil.
func ValidateGraph(g database.AutomationGraph, maxSteps int, tier premium.PremiumTier) string {
	if len(g.Nodes) == 0 {
		return "Automation must have at least a trigger node"
	}

	// Exactly one trigger.
	triggerCount := 0
	var triggerNode database.AutomationNode
	for _, n := range g.Nodes {
		if n.Type == "trigger" {
			triggerCount++
			triggerNode = n
		}
	}
	if triggerCount == 0 {
		return "Automation must have a trigger node"
	}
	if triggerCount > 1 {
		return "Automation must have exactly one trigger node"
	}
	if !knownTriggerKinds[triggerNode.Kind] {
		return fmt.Sprintf("Unknown trigger kind: %s", triggerNode.Kind)
	}
	if premiumOnlyKinds[triggerNode.Kind] && tier == premium.None {
		return fmt.Sprintf("Trigger %q requires premium", triggerNode.Kind)
	}
	if triggerNode.Kind == "cron" {
		if msg := validateCronTrigger(triggerNode); msg != "" {
			return msg
		}
	}

	// Unique node ids + kind validation + step budget.
	ids := make(map[string]struct{}, len(g.Nodes))
	actionSteps := 0
	for _, n := range g.Nodes {
		if n.Id == "" {
			return "Every node must have a non-empty id"
		}
		if _, exists := ids[n.Id]; exists {
			return fmt.Sprintf("Duplicate node id: %s", n.Id)
		}
		ids[n.Id] = struct{}{}

		switch n.Type {
		case "trigger":
			// already validated
		case "condition":
			if n.Mode != "" && n.Mode != "AND" && n.Mode != "OR" {
				return fmt.Sprintf("Condition node %q has invalid mode %q (expected AND or OR)", n.Id, n.Mode)
			}
			if len(n.Clauses) == 0 {
				return fmt.Sprintf("Condition node %q must have at least one clause", n.Id)
			}
			for ci, clause := range n.Clauses {
				if strings.TrimSpace(clause.Left) == "" {
					return fmt.Sprintf("Condition node %q clause %d has empty left operand", n.Id, ci+1)
				}
				if !knownConditionOps[clause.Op] {
					return fmt.Sprintf("Condition node %q clause %d has unknown operator %q", n.Id, ci+1, clause.Op)
				}
				if clause.Op != "is_empty" && clause.Op != "is_not_empty" {
					if strings.TrimSpace(clause.Right) == "" {
						return fmt.Sprintf("Condition node %q clause %d requires a non-empty right operand for operator %q", n.Id, ci+1, clause.Op)
					}
				}
			}
		case "switch":
			expr, _ := n.Config["expression"].(string)
			if strings.TrimSpace(expr) == "" {
				return fmt.Sprintf("Switch node %q requires an expression", n.Id)
			}
			rawCases, _ := n.Config["cases"].([]any)
			if len(rawCases) == 0 {
				return fmt.Sprintf("Switch node %q must have at least one case", n.Id)
			}
			actionSteps++ // counts against the step budget like conditions do
		case "action":
			if !knownActionKinds[n.Kind] {
				return fmt.Sprintf("Unknown action kind %q at node %q", n.Kind, n.Id)
			}
			if premiumOnlyKinds[n.Kind] && tier == premium.None {
				return fmt.Sprintf("Action %q requires premium", n.Kind)
			}
			if msg := validateActionConfig(n); msg != "" {
				return msg
			}

			// Enforce tier-specific delay duration caps.
			if n.Kind == "delay" {
				durRaw, _ := n.Config["duration_seconds"]
				dur, _ := toFloat64(durRaw)
				maxDelay := float64(5 * 60) // 5 minutes for free tier
				if tier >= premium.Whitelabel {
					maxDelay = float64(7 * 24 * 60 * 60) // 7 days for whitelabel
				} else if tier > premium.None {
					maxDelay = float64(24 * 60 * 60) // 24 hours for premium
				}
				if dur > maxDelay {
					return fmt.Sprintf("Delay at node %q exceeds the maximum for your tier (%d seconds)", n.Id, int(maxDelay))
				}
			}

			actionSteps++
		default:
			return fmt.Sprintf("Unsupported node type %q at node %q", n.Type, n.Id)
		}
	}

	if actionSteps > maxSteps {
		return fmt.Sprintf("Automation exceeds step limit (%d > %d)", actionSteps, maxSteps)
	}

	// Edge validation: endpoints reference known nodes.
	for _, e := range g.Edges {
		if _, ok := ids[e.From]; !ok {
			return fmt.Sprintf("Edge has unknown from-node: %s", e.From)
		}
		if _, ok := ids[e.To]; !ok {
			return fmt.Sprintf("Edge has unknown to-node: %s", e.To)
		}
	}

	// Cycle detection. Phase 1 allows only acyclic graphs; linear walker would loop forever otherwise.
	if hasCycle(g) {
		return "Automation graph contains a cycle"
	}

	// Reachability: every node must be reachable from the trigger.
	reachable := make(map[string]bool, len(g.Nodes))
	queue := []string{triggerNode.Id}
	reachable[triggerNode.Id] = true
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, e := range g.Edges {
			if e.From == cur && !reachable[e.To] {
				reachable[e.To] = true
				queue = append(queue, e.To)
			}
		}
	}
	for _, n := range g.Nodes {
		if !reachable[n.Id] {
			return fmt.Sprintf("Node %q is not reachable from the trigger", n.Id)
		}
	}

	return ""
}

// hasCycle runs DFS colouring (white/grey/black) starting from every node so
// unreachable subgraphs are also checked.
func hasCycle(g database.AutomationGraph) bool {
	adj := make(map[string][]string, len(g.Nodes))
	for _, e := range g.Edges {
		adj[e.From] = append(adj[e.From], e.To)
	}

	const (
		white = 0
		grey  = 1
		black = 2
	)
	colour := make(map[string]int, len(g.Nodes))

	var dfs func(id string) bool
	dfs = func(id string) bool {
		colour[id] = grey
		for _, next := range adj[id] {
			switch colour[next] {
			case grey:
				return true
			case white:
				if dfs(next) {
					return true
				}
			}
		}
		colour[id] = black
		return false
	}

	for _, n := range g.Nodes {
		if colour[n.Id] == white {
			if dfs(n.Id) {
				return true
			}
		}
	}
	return false
}

// cron parser matches the one used by the scheduler so the dashboard rejects
// expressions the scheduler would fail to parse at runtime.
var cronParser = cron.NewParser(
	cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
)

// validateCronTrigger inspects a cron trigger node's config and returns an
// empty string on success, or a user-facing reason on failure.
func validateCronTrigger(node database.AutomationNode) string {
	expression, _ := node.Config["cron_expression"].(string)
	expression = strings.TrimSpace(expression)
	if expression == "" {
		return "Cron trigger requires a cron expression"
	}
	// Limit expression length to bound what the scheduler parses each refresh.
	if len(expression) > 128 {
		return "Cron expression is too long (max 128 characters)"
	}

	timezone, _ := node.Config["timezone"].(string)
	timezone = strings.TrimSpace(timezone)
	spec := expression
	if timezone != "" {
		if len(timezone) > 64 {
			return "Cron timezone is too long (max 64 characters)"
		}
		spec = fmt.Sprintf("CRON_TZ=%s %s", timezone, expression)
	}

	if _, err := cronParser.Parse(spec); err != nil {
		return fmt.Sprintf("Invalid cron expression: %s", err.Error())
	}
	return ""
}

// validateActionConfig checks that the action's config map contains the fields
// required by its kind. Returns an empty string when valid.
func validateActionConfig(node database.AutomationNode) string {
	cfg := node.Config
	switch node.Kind {
	case "send_message":
		content, _ := cfg["content"].(string)
		if strings.TrimSpace(content) == "" {
			return fmt.Sprintf("Action %q at node %q requires non-empty content", node.Kind, node.Id)
		}
	case "dm_user":
		content, _ := cfg["content"].(string)
		if strings.TrimSpace(content) == "" {
			return fmt.Sprintf("Action %q at node %q requires non-empty content", node.Kind, node.Id)
		}
	case "add_label", "remove_label":
		labelIdRaw, ok := cfg["label_id"]
		if !ok {
			return fmt.Sprintf("Action %q at node %q requires a label_id", node.Kind, node.Id)
		}
		labelId, err := toFloat64(labelIdRaw)
		if err != nil || labelId <= 0 {
			return fmt.Sprintf("Action %q at node %q requires label_id > 0", node.Kind, node.Id)
		}
	case "send_tag":
		tagId, _ := cfg["tag_id"].(string)
		if strings.TrimSpace(tagId) == "" {
			return fmt.Sprintf("Action %q at node %q requires a non-empty tag_id", node.Kind, node.Id)
		}
	case "assign_user":
		userId, _ := cfg["user_id"].(string)
		if strings.TrimSpace(userId) == "" {
			return fmt.Sprintf("Action %q at node %q requires a non-empty user_id", node.Kind, node.Id)
		}
	case "close_ticket":
		// always valid; reason is optional
	case "http_request":
		url, _ := cfg["url"].(string)
		if strings.TrimSpace(url) == "" {
			return fmt.Sprintf("Action %q at node %q requires a non-empty url", node.Kind, node.Id)
		}
		method, _ := cfg["method"].(string)
		validMethods := map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true}
		if !validMethods[method] {
			return fmt.Sprintf("Action %q at node %q has unknown HTTP method %q", node.Kind, node.Id, method)
		}
	case "assign_team":
		teamId, _ := cfg["team_id"].(string)
		if strings.TrimSpace(teamId) == "" {
			return fmt.Sprintf("Action %q at node %q requires a non-empty team_id", node.Kind, node.Id)
		}
	case "transfer":
		toUserId, _ := cfg["to_user_id"].(string)
		if strings.TrimSpace(toUserId) == "" {
			return fmt.Sprintf("Action %q at node %q requires a non-empty to_user_id", node.Kind, node.Id)
		}
	case "reply_to_trigger":
		content, _ := cfg["content"].(string)
		if strings.TrimSpace(content) == "" {
			return fmt.Sprintf("Action %q at node %q requires non-empty content", node.Kind, node.Id)
		}
	case "send_embed":
		content, _ := cfg["content"].(string)
		title, _ := cfg["title"].(string)
		desc, _ := cfg["description"].(string)
		if strings.TrimSpace(content) == "" && strings.TrimSpace(title) == "" && strings.TrimSpace(desc) == "" {
			return fmt.Sprintf("Action %q at node %q requires at least one of content, title, or description", node.Kind, node.Id)
		}
	case "delay":
		durRaw, ok := cfg["duration_seconds"]
		if !ok {
			return fmt.Sprintf("Action %q at node %q requires duration_seconds", node.Kind, node.Id)
		}
		dur, err := toFloat64(durRaw)
		if err != nil || dur <= 0 {
			return fmt.Sprintf("Action %q at node %q requires a positive duration_seconds", node.Kind, node.Id)
		}
	case "log_to_channel":
		channelId, _ := cfg["channel_id"].(string)
		if strings.TrimSpace(channelId) == "" {
			return fmt.Sprintf("Action %q at node %q requires a non-empty channel_id", node.Kind, node.Id)
		}
		content, _ := cfg["content"].(string)
		if strings.TrimSpace(content) == "" {
			return fmt.Sprintf("Action %q at node %q requires non-empty content", node.Kind, node.Id)
		}
	case "reopen_ticket":
		// no config required
	}
	return ""
}

func toFloat64(v any) (float64, error) {
	switch n := v.(type) {
	case float64:
		return n, nil
	case int:
		return float64(n), nil
	case int64:
		return float64(n), nil
	default:
		return 0, fmt.Errorf("expected number, got %T", v)
	}
}
