package tagalias

import (
	"fmt"
	"sort"
	"strings"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/interaction"
)

// The tag limit is 200, so a guild can want more aliases than Discord allows.
const guildCommandLimit = 100

const (
	skipInvalidName  = "invalid_name"
	skipNameConflict = "name_conflict"
	skipCommandLimit = "command_limit"
)

type Removal struct {
	Id   uint64
	Name string
}

type Rebind struct {
	TagId     string
	CommandId uint64
}

type Skip struct {
	TagId  string
	Reason string
}

type Plan struct {
	Create []string
	// Aliases whose stored id no longer matches Discord
	Rebind  []Rebind
	Remove  []Removal
	Skipped []Skip
	InSync  int
}

func (p Plan) Total() int {
	return len(p.Create) + len(p.Remove)
}

// BuildPlan diffs the guild's alias tags against what Discord has registered. A command counts as
// ours if it looks like an alias or its id is one we stored.
func BuildPlan(tags map[string]dbmodel.Tag, existing []interaction.ApplicationCommand) Plan {
	aliases := aliasTags(tags)

	storedIds := make(map[uint64]struct{}, len(aliases))
	for _, tag := range aliases {
		storedIds[*tag.ApplicationCommandId] = struct{}{}
	}

	liveAliases := make(map[string]interaction.ApplicationCommand, len(existing))
	foreignNames := make(map[string]struct{}, len(existing))
	foreignCount := 0

	for _, cmd := range existing {
		name := strings.ToLower(cmd.Name)
		if _, stored := storedIds[cmd.Id]; stored || isAlias(cmd) {
			liveAliases[name] = cmd
			continue
		}

		foreignNames[name] = struct{}{}
		foreignCount++
	}

	var plan Plan

	// Sorted so the same aliases get dropped when over the limit
	ids := make([]string, 0, len(aliases))
	for id := range aliases {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	kept := 0
	var pending []string

	for _, id := range ids {
		tag := aliases[id]

		if !isValidCommandName(id) {
			plan.Skipped = append(plan.Skipped, Skip{TagId: tag.Id, Reason: skipInvalidName})
			continue
		}

		if live, ok := liveAliases[id]; ok {
			kept++
			if live.Id != *tag.ApplicationCommandId {
				plan.Rebind = append(plan.Rebind, Rebind{TagId: tag.Id, CommandId: live.Id})
			} else {
				plan.InSync++
			}
			continue
		}

		// Creating would overwrite a command we did not register
		if _, taken := foreignNames[id]; taken {
			plan.Skipped = append(plan.Skipped, Skip{TagId: tag.Id, Reason: skipNameConflict})
			continue
		}

		pending = append(pending, tag.Id)
	}

	for name, cmd := range liveAliases {
		if _, wanted := aliases[name]; !wanted {
			plan.Remove = append(plan.Remove, Removal{Id: cmd.Id, Name: cmd.Name})
		}
	}
	sort.Slice(plan.Remove, func(i, j int) bool { return plan.Remove[i].Name < plan.Remove[j].Name })

	budget := guildCommandLimit - foreignCount - kept
	for i, id := range pending {
		if i >= budget {
			plan.Skipped = append(plan.Skipped, Skip{TagId: id, Reason: skipCommandLimit})
			continue
		}

		plan.Create = append(plan.Create, id)
	}

	return plan
}

var skipMessages = map[string]string{
	skipInvalidName:  "cannot be used as a slash command name",
	skipNameConflict: "share a name with a command the bot already has",
	skipCommandLimit: fmt.Sprintf("exceed Discord's limit of %d commands per server", guildCommandLimit),
}

// SkipWarnings turns the skip reasons into messages for the user.
func SkipWarnings(plan Plan) []string {
	byReason := make(map[string][]string)
	for _, skip := range plan.Skipped {
		byReason[skip.Reason] = append(byReason[skip.Reason], skip.TagId)
	}

	warnings := make([]string, 0, len(byReason))
	for _, reason := range []string{skipInvalidName, skipNameConflict, skipCommandLimit} {
		ids, ok := byReason[reason]
		if !ok {
			continue
		}

		sort.Strings(ids)
		listed := ids
		suffix := ""
		if len(listed) > 5 {
			listed, suffix = listed[:5], fmt.Sprintf(" and %d more", len(ids)-5)
		}

		warnings = append(warnings, fmt.Sprintf("Skipped %d tag(s) that %s: %s%s.",
			len(ids), skipMessages[reason], strings.Join(listed, ", "), suffix))
	}

	return warnings
}
