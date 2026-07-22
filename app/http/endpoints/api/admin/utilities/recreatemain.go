package utilities

import (
	"context"
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/gdl/objects/interaction"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/worker/bot/command/manager"
	"github.com/gin-gonic/gin"
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
			if _, err := rest.ModifyGuildCommands(context.Background(), config.Conf.Bot.Token, botCtx.RateLimiter, config.Conf.Bot.Id, adminGuildId, adminCommands); err != nil {
				c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to re-create the main bot's admin slash commands"))
				return
			}
			adminCount = countLeafCommands(adminCommands)
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
