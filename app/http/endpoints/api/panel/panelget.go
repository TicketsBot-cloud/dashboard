package api

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func GetPanel(c *gin.Context) {
	type panelResponse struct {
		database.Panel
		WelcomeMessage               *types.CustomEmbed                `json:"welcome_message"`
		UseCustomEmoji               bool                              `json:"use_custom_emoji"`
		Emoji                        types.Emoji                       `json:"emote"`
		Mentions                     []string                          `json:"mentions"`
		Teams                        []int                             `json:"teams"`
		UseServerDefaultNamingScheme bool                              `json:"use_server_default_naming_scheme"`
		AccessControlList            []database.PanelAccessControlRule `json:"access_control_list"`
		HasSupportHours              bool                              `json:"has_support_hours"`
		IsCurrentlyActive            bool                              `json:"is_currently_active"`
		TicketPermissions            database.TicketPermissions        `json:"ticket_permissions"`
	}

	guildId := c.Keys["guildid"].(uint64)

	panelId, err := strconv.Atoi(c.Param("panelid"))
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid panel ID"})
		return
	}

	panel, err := dbclient.Client.Panel.GetByIdWithWelcomeMessage(c, guildId, panelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
		return
	}

	if panel == nil {
		c.JSON(404, gin.H{"error": "Panel not found"})
		return
	}

	if panel.GuildId != guildId {
		c.JSON(404, gin.H{"error": "Panel not found"})
		return
	}

	// Get mentions
	var mentions []string

	shouldMention, err := dbclient.Client.PanelUserMention.ShouldMentionUser(c, panel.PanelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
		return
	}

	if shouldMention {
		mentions = append(mentions, "user")
	}

	shouldHereMention, err := dbclient.Client.PanelHereMention.ShouldMentionHere(c, panel.PanelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
		return
	}

	if shouldHereMention {
		mentions = append(mentions, "here")
	}

	roles, err := dbclient.Client.PanelRoleMentions.GetRoles(c, panel.PanelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
		return
	}

	for _, roleId := range roles {
		mentions = append(mentions, strconv.FormatUint(roleId, 10))
	}

	// Get team IDs
	teamIds, err := dbclient.Client.PanelTeams.GetTeamIds(c, panel.PanelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
		return
	}

	if teamIds == nil {
		teamIds = make([]int, 0)
	}

	// Get welcome message
	var welcomeMessage *types.CustomEmbed
	if panel.WelcomeMessage != nil {
		fields, err := dbclient.Client.EmbedFields.GetFieldsForEmbed(c, panel.WelcomeMessage.Id)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
			return
		}

		welcomeMessage = types.NewCustomEmbed(panel.WelcomeMessage, fields)
	}

	// Get access control list
	accessControlLists, err := dbclient.Client.PanelAccessControlRules.GetAllForGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
		return
	}

	accessControlList := accessControlLists[panel.PanelId]
	if accessControlList == nil {
		accessControlList = make([]database.PanelAccessControlRule, 0)
	}

	// Get ticket permissions
	ticketPerms, err := dbclient.Client.PanelTicketPermissions.Get(c, panel.PanelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
		return
	}

	// Get support hours
	supportHours, err := dbclient.Client.PanelSupportHours.GetByPanelId(c, panel.PanelId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
		return
	}

	hasSupportHours := len(supportHours) > 0
	isCurrentlyActive := true

	if hasSupportHours {
		isCurrentlyActive, err = dbclient.Client.PanelSupportHours.IsActiveNow(c, panel.PanelId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load panel"))
			return
		}
	}

	c.JSON(200, panelResponse{
		Panel:                        panel.Panel,
		WelcomeMessage:               welcomeMessage,
		UseCustomEmoji:               panel.EmojiId != nil,
		Emoji:                        types.NewEmoji(panel.EmojiName, panel.EmojiId),
		Mentions:                     mentions,
		Teams:                        teamIds,
		UseServerDefaultNamingScheme: panel.NamingScheme == nil,
		AccessControlList:            accessControlList,
		HasSupportHours:              hasSupportHours,
		IsCurrentlyActive:            isCurrentlyActive,
		TicketPermissions:            ticketPerms,
	})
}
