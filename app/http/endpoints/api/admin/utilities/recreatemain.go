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

// RecreateMainCommands re-registers the main bot's global (public) slash commands with Discord,
// overwriting whatever is currently registered. Owner-only.
func RecreateMainCommands() func(*gin.Context) {
	cm := new(manager.CommandManager)
	cm.RegisterCommands()

	return func(c *gin.Context) {
		botCtx := botcontext.PublicContext()
		commands, _ := cm.BuildCreatePayload(false, nil)

		if _, err := rest.ModifyGlobalCommands(context.Background(), config.Conf.Bot.Token, botCtx.RateLimiter, config.Conf.Bot.Id, commands); err != nil {
			c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to re-create the main bot's slash commands"))
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "count": countLeafCommands(commands)})
	}
}

// RecreateMainAdminCommands re-registers the main bot's helper/admin slash commands in the
// configured admin guild (ADMIN_GUILD_ID), overwriting the guild command set. Owner-only.
func RecreateMainAdminCommands() func(*gin.Context) {
	cm := new(manager.CommandManager)
	cm.RegisterCommands()

	return func(c *gin.Context) {
		adminGuildId := config.Conf.Bot.AdminGuildId
		if adminGuildId == 0 {
			c.JSON(http.StatusBadRequest, utils.ErrorStr("No admin guild is configured (ADMIN_GUILD_ID is not set)"))
			return
		}

		botCtx := botcontext.PublicContext()
		_, adminCommands := cm.BuildCreatePayload(false, &adminGuildId)

		if _, err := rest.ModifyGuildCommands(context.Background(), config.Conf.Bot.Token, botCtx.RateLimiter, config.Conf.Bot.Id, adminGuildId, adminCommands); err != nil {
			c.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to re-create the main bot's admin slash commands"))
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "count": countLeafCommands(adminCommands)})
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
