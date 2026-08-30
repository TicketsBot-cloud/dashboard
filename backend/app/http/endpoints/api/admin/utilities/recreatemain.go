package utilities

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/interaction"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/worker/bot/command/manager"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

type recreateMainBody struct {
	AdminOnly bool `json:"admin_only"`
}

// RecreateMainCommands re-registers the main bot's slash commands with Discord, overwriting
// whatever is currently registered. Mirrors the registercommands CLI: by default it re-creates the
// global (public) commands and, if an admin guild is configured (ADMIN_GUILD_ID), the admin/helper
// commands in that guild. With admin_only set it re-creates only the admin commands, which requires
// ADMIN_GUILD_ID. Owner-only.
func RecreateMainCommands() func(*gin.Context) {
	cm := new(manager.CommandManager)
	cm.RegisterCommands()

	return func(c *gin.Context) {
		var body recreateMainBody
		_ = c.ShouldBindJSON(&body) // empty/missing body is fine — defaults to a full recreate

		adminGuildId := config.Conf.Bot.AdminGuildId
		if body.AdminOnly && adminGuildId == 0 {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("No admin guild is configured (ADMIN_GUILD_ID is not set)"))
			return
		}

		botCtx := botcontext.PublicContext()

		globalCount := 0
		if !body.AdminOnly {
			data, _ := cm.BuildCreatePayload(false, nil)
			if _, err := rest.ModifyGlobalCommands(context.Background(), config.Conf.Bot.Token, botCtx.RateLimiter, config.Conf.Bot.Id, data); err != nil {
				c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to re-create the main bot's global slash commands"))
				return
			}
			globalCount = countLeafCommands(data)
		}

		adminCount := 0
		adminSkipped := false
		if adminGuildId != 0 {
			_, adminCommands := cm.BuildCreatePayload(false, &adminGuildId)
			adminCount = countLeafCommands(adminCommands)

			// This is a replace-everything PUT, so the guild's tag aliases have to be part of the
			// payload or they are deleted.
			tags, err := database.Client.Tag.GetByGuild(c, adminGuildId)
			if err != nil {
				c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to load the admin guild's tag command aliases"))
				return
			}

			adminCommands = append(adminCommands, tagAliasCommands(tags)...)

			existing, err := rest.GetGuildCommands(context.Background(), config.Conf.Bot.Token, botCtx.RateLimiter, config.Conf.Bot.Id, adminGuildId)
			if err != nil {
				c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to read the main bot's existing admin slash commands"))
				return
			}

			adminCommands = mergeExisting(existing, adminCommands)

			registered, err := rest.ModifyGuildCommands(context.Background(), config.Conf.Bot.Token, botCtx.RateLimiter, config.Conf.Bot.Id, adminGuildId, adminCommands)
			if err != nil {
				c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to re-create the main bot's admin slash commands"))
				return
			}

			if err := reconcileTagAliasIds(c, adminGuildId, tags, registered); err != nil {
				c.JSON(http.StatusInternalServerError, utils.ErrorStr("Admin slash commands were re-created, but the tag alias command IDs could not be updated"))
				return
			}
		} else if !body.AdminOnly {
			// Global-only run because no admin guild is configured — report it so the UI can say so.
			adminSkipped = true
		}

		c.JSON(http.StatusOK, gin.H{
			"success":       true,
			"admin_only":    body.AdminOnly,
			"global_count":  globalCount,
			"admin_count":   adminCount,
			"admin_skipped": adminSkipped,
		})
	}
}

// Must match what CreateTag registers when an alias is first enabled.
func tagAliasCommands(tags map[string]dbmodel.Tag) []rest.CreateCommandData {
	commands := make([]rest.CreateCommandData, 0, len(tags))
	for _, tag := range tags {
		if tag.ApplicationCommandId == nil {
			continue
		}

		commands = append(commands, rest.CreateCommandData{
			Name:        tag.Id,
			Description: fmt.Sprintf("Alias for /tag %s", tag.Id),
			Options:     nil,
			Type:        interaction.ApplicationCommandTypeChatInput,
		})
	}

	return commands
}

// Carries over commands this endpoint did not build, which the overwrite would otherwise delete.
func mergeExisting(existing []interaction.ApplicationCommand, target []rest.CreateCommandData) []rest.CreateCommandData {
	for _, cmd := range existing {
		var found bool
		for _, newCmd := range target {
			if cmd.Name == newCmd.Name {
				found = true
				break
			}
		}

		if found {
			continue
		}

		// ApplicationCommand.Type is tagged "application_command_type", which Discord never sends,
		// so it always decodes as 0 and cannot be carried over.
		target = append(target, rest.CreateCommandData{
			Id:          cmd.Id,
			Name:        cmd.Name,
			Description: cmd.Description,
			Options:     cmd.Options,
			Type:        interaction.ApplicationCommandTypeChatInput,
			Contexts:    cmd.Contexts,
		})
	}

	return target
}

// CreateCommandData.Id is not serialised as a string, so a command carried through the overwrite is
// not guaranteed to keep its snowflake, and the worker resolves aliases by ID.
func reconcileTagAliasIds(
	ctx context.Context,
	guildId uint64,
	tags map[string]dbmodel.Tag,
	registered []interaction.ApplicationCommand,
) error {
	query := `UPDATE tags SET "application_command_id" = $1 WHERE "guild_id" = $2 AND LOWER("tag_id") = LOWER($3);`

	for _, cmd := range registered {
		tag, ok := tags[strings.ToLower(cmd.Name)]
		if !ok || tag.ApplicationCommandId == nil || *tag.ApplicationCommandId == cmd.Id {
			continue
		}

		if _, err := database.Client.Tag.Exec(ctx, query, cmd.Id, guildId, tag.Id); err != nil {
			return err
		}
	}

	return nil
}

// countLeafCommands counts the invocable "leaf" commands across the given command set. Commands
// may nest subcommand groups and subcommands (e.g. the admin command, or `/autoclose configure`),
// so counting the leaves is more meaningful than counting top-level commands. A command with no
// subcommands counts as one leaf itself.
func countLeafCommands(commands []rest.CreateCommandData) int {
	total := 0
	for _, cmd := range commands {
		leaves := countSubCommandLeaves(cmd.Options)
		if leaves == 0 {
			leaves = 1
		}
		total += leaves
	}
	return total
}

func countSubCommandLeaves(options []interaction.ApplicationCommandOption) int {
	leaves := 0
	for _, opt := range options {
		switch opt.Type {
		case interaction.OptionTypeSubCommand:
			leaves++
		case interaction.OptionTypeSubCommandGroup:
			leaves += countSubCommandLeaves(opt.Options)
		}
	}
	return leaves
}
