package api

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/botpermissions"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/TicketsBot-cloud/gdl/permission"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

type channelCheckResult struct {
	ChannelId   string   `json:"channel_id"`
	ChannelName string   `json:"channel_name"`
	Role        string   `json:"role"`
	Required    []string `json:"required"`
	Missing     []string `json:"missing"`
	Deleted     bool     `json:"deleted"`
	Ok          bool     `json:"ok"`
}

type panelPermResult struct {
	PanelId    int                  `json:"panel_id"`
	PanelTitle string               `json:"panel_title"`
	UseThreads bool                 `json:"use_threads"`
	Channels   []channelCheckResult `json:"channels"`
	Ok         bool                 `json:"ok"`
}

type permCheckResponse struct {
	Panels []panelPermResult `json:"panels"`
}

// PermCheckHandler checks whether the bot has the required Discord permissions in every
// channel/category used by the guild's panels and returns a structured report.
func PermCheckHandler(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)

	// --- Phase 1: load DB data in parallel ---
	var panels []database.Panel
	var settings database.Settings
	var defaultCategoryId uint64

	g1, ctx1 := errgroup.WithContext(c)

	g1.Go(func() error {
		var err error
		panels, err = dbclient.Client.Panel.GetByGuild(ctx1, guildId)
		return err
	})

	g1.Go(func() error {
		var err error
		settings, err = dbclient.Client.Settings.Get(ctx1, guildId)
		return err
	})

	g1.Go(func() error {
		var err error
		defaultCategoryId, err = dbclient.Client.ChannelCategory.Get(ctx1, guildId)
		return err
	})

	if err := g1.Wait(); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load guild data"))
		return
	}

	// --- Phase 2: load Discord data in parallel ---
	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to get bot context"))
		return
	}

	var botRoles []uint64
	var roleMap map[uint64]guild.Role
	var channelMap map[uint64]channel.Channel

	g2, ctx2 := errgroup.WithContext(c)

	g2.Go(func() error {
		m, err := botCtx.GetGuildMember(ctx2, guildId, botCtx.BotId)
		if err != nil {
			return err
		}
		botRoles = []uint64(m.Roles)
		return nil
	})

	g2.Go(func() error {
		roles, err := botCtx.GetGuildRoles(ctx2, guildId)
		if err != nil {
			return err
		}
		roleMap = make(map[uint64]guild.Role, len(roles))
		for _, r := range roles {
			roleMap[r.Id] = r
		}
		return nil
	})

	g2.Go(func() error {
		channels, err := botCtx.GetGuildChannels(ctx2, guildId)
		if err != nil {
			return err
		}
		channelMap = make(map[uint64]channel.Channel, len(channels))
		for _, ch := range channels {
			channelMap[ch.Id] = ch
		}
		return nil
	})

	if err := g2.Wait(); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load Discord data"))
		return
	}

	// --- Phase 3: compute per-panel permission results ---
	result := permCheckResponse{
		Panels: make([]panelPermResult, 0, len(panels)),
	}

	for _, panel := range panels {
		useThreads := settings.UseThreads || panel.UseThreads

		pr := panelPermResult{
			PanelId:    panel.PanelId,
			PanelTitle: panel.Title,
			UseThreads: useThreads,
			Channels:   make([]channelCheckResult, 0, 3),
		}

		// 1. Primary location
		if useThreads {
			// Thread mode: check permissions on the panel channel
			if panel.ChannelId != 0 {
				pr.Channels = append(pr.Channels, checkChannel(
					botCtx.BotId, guildId, panel.ChannelId, "panel_channel",
					botpermissions.ThreadModeRequired, channelMap, roleMap, botRoles,
				))
			}
		} else {
			// Channel mode: check permissions on the ticket category
			categoryId := panel.TargetCategory
			if categoryId == 0 {
				categoryId = defaultCategoryId
			}
			if categoryId != 0 {
				pr.Channels = append(pr.Channels, checkChannel(
					botCtx.BotId, guildId, categoryId, "ticket_category",
					botpermissions.ChannelModeRequired, channelMap, roleMap, botRoles,
				))
			}
		}

		// 2. Notification channel (thread mode only)
		if useThreads {
			notifId := settings.TicketNotificationChannel
			if panel.TicketNotificationChannel != nil {
				notifId = panel.TicketNotificationChannel
			}
			if notifId != nil {
				pr.Channels = append(pr.Channels, checkChannel(
					botCtx.BotId, guildId, *notifId, "notification_channel",
					botpermissions.NotifChannelRequired, channelMap, roleMap, botRoles,
				))
			}
		}

		// 3. Transcript channel (any mode)
		if panel.TranscriptChannelId != nil {
			pr.Channels = append(pr.Channels, checkChannel(
				botCtx.BotId, guildId, *panel.TranscriptChannelId, "transcript_channel",
				botpermissions.TranscriptChannelRequired, channelMap, roleMap, botRoles,
			))
		}

		pr.Ok = allOk(pr.Channels)
		result.Panels = append(result.Panels, pr)
	}

	c.JSON(200, result)
}

// checkChannel resolves the bot's effective Discord permissions in the given channel,
// then returns which of the required permissions are present and which are missing.
func checkChannel(
	botId, guildId, channelId uint64,
	role string,
	required []permission.Permission,
	channelMap map[uint64]channel.Channel,
	roleMap map[uint64]guild.Role,
	botRoles []uint64,
) channelCheckResult {
	ch, exists := channelMap[channelId]

	result := channelCheckResult{
		ChannelId: strconv.FormatUint(channelId, 10),
		Role:      role,
		Required:  permissionNames(required),
		Missing:   []string{},
	}

	if !exists {
		// Channel not found in the guild's channel list — it has been deleted.
		result.Deleted = true
		result.Ok = false
		return result
	}

	result.ChannelName = ch.Name

	missing := botpermissions.MissingPermissions(guildId, botId, botRoles, ch.PermissionOverwrites, roleMap, required)
	for _, p := range missing {
		result.Missing = append(result.Missing, p.String())
	}

	result.Ok = len(result.Missing) == 0
	return result
}

func permissionNames(perms []permission.Permission) []string {
	names := make([]string, len(perms))
	for i, p := range perms {
		names[i] = p.String()
	}
	return names
}

func allOk(checks []channelCheckResult) bool {
	for _, ch := range checks {
		if !ch.Ok {
			return false
		}
	}
	return true
}
