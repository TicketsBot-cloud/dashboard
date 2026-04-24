package automations

import (
	"context"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
)

// syncCronSchedule reconciles automation_cron_schedules with the current state
// of `auto`. Called after publish/enable/disable/revert — any transition that
// can change whether the scheduler should be firing this automation.
//
// Rules:
//
//	- Delete the schedule row if the automation isn't enabled, or hasn't been
//	  published, or its published trigger isn't cron.
//	- Otherwise upsert with the published trigger's expression and timezone.
//
// Errors are logged by the caller; this function returns them verbatim so the
// caller can choose to bail or soldier on.
func syncCronSchedule(ctx context.Context, auto database.Automation) error {
	shouldSchedule := auto.Enabled && auto.PublishedGraph != nil
	if shouldSchedule {
		trigger := findTriggerNode(*auto.PublishedGraph)
		if trigger == nil || trigger.Kind != "cron" {
			shouldSchedule = false
		}
	}

	if !shouldSchedule {
		return dbclient.Client.AutomationCronSchedules.Delete(ctx, auto.Id)
	}

	trigger := findTriggerNode(*auto.PublishedGraph)
	expression, _ := trigger.Config["cron_expression"].(string)
	timezone, _ := trigger.Config["timezone"].(string)
	if timezone == "" {
		timezone = "UTC"
	}
	return dbclient.Client.AutomationCronSchedules.Upsert(ctx, auto.Id, auto.GuildId, expression, timezone)
}

func findTriggerNode(g database.AutomationGraph) *database.AutomationNode {
	for i := range g.Nodes {
		if g.Nodes[i].Type == "trigger" {
			return &g.Nodes[i]
		}
	}
	return nil
}
