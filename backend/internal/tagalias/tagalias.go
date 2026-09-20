package tagalias

import (
	"fmt"
	"regexp"
	"strings"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/interaction"
	"github.com/TicketsBot-cloud/gdl/rest"
)

const descriptionPrefix = "Alias for /tag "

var commandNameRegex = regexp.MustCompile(`^[-_a-z0-9]{1,32}$`)

func description(tagId string) string {
	return fmt.Sprintf("%s%s", descriptionPrefix, tagId)
}

// Must match what CreateTag registers.
func Command(tagId string) rest.CreateCommandData {
	return rest.CreateCommandData{
		Name:        tagId,
		Description: description(tagId),
		Options:     nil,
		Type:        interaction.ApplicationCommandTypeChatInput,
	}
}

// Only commands matching this are ever deleted.
func isAlias(cmd interaction.ApplicationCommand) bool {
	return len(cmd.Options) == 0 && strings.HasPrefix(cmd.Description, descriptionPrefix)
}

func isValidCommandName(tagId string) bool {
	return commandNameRegex.MatchString(tagId)
}

func aliasTags(tags map[string]dbmodel.Tag) map[string]dbmodel.Tag {
	aliases := make(map[string]dbmodel.Tag, len(tags))
	for id, tag := range tags {
		if tag.ApplicationCommandId != nil {
			aliases[strings.ToLower(id)] = tag
		}
	}

	return aliases
}

func Commands(tags map[string]dbmodel.Tag) []rest.CreateCommandData {
	commands := make([]rest.CreateCommandData, 0, len(tags))
	for _, tag := range aliasTags(tags) {
		commands = append(commands, Command(tag.Id))
	}

	return commands
}
