package api

import (
	"context"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

func ListPanels(c *gin.Context) {
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
	}

	guildId := c.Keys["guildid"].(uint64)

	panels, err := dbclient.Client.Panel.GetByGuildWithWelcomeMessage(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewServerError(err))
		return
	}

	accessControlLists, err := dbclient.Client.PanelAccessControlRules.GetAllForGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewServerError(err))
		return
	}

	allFields, err := dbclient.Client.EmbedFields.GetAllFieldsForPanels(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewServerError(err))
		return
	}

	wrapped := make([]panelResponse, len(panels))

	// we will need to lookup role mentions
	group, _ := errgroup.WithContext(context.Background())

	for i, p := range panels {
		i := i
		p := p

		group.Go(func() error {
			var mentions []string

			// get if we should mention the ticket opener
			shouldMention, err := dbclient.Client.PanelUserMention.ShouldMentionUser(c, p.PanelId)
			if err != nil {
				return err
			}

			if shouldMention {
				mentions = append(mentions, "user")
			}

			// get if we should mention @here
			shouldHereMention, err := dbclient.Client.PanelHereMention.ShouldMentionHere(c, p.PanelId)
			if err != nil {
				return err
			}

			if shouldHereMention {
				mentions = append(mentions, "here")
			}

			// get role mentions
			roles, err := dbclient.Client.PanelRoleMentions.GetRoles(c, p.PanelId)
			if err != nil {
				return err
			}

			// convert to strings
			for _, roleId := range roles {
				mentions = append(mentions, strconv.FormatUint(roleId, 10))
			}

			teamIds, err := dbclient.Client.PanelTeams.GetTeamIds(c, p.PanelId)
			if err != nil {
				return err
			}

			// Don't serve null
			if teamIds == nil {
				teamIds = make([]int, 0)
			}

			var welcomeMessage *types.CustomEmbed
			if p.WelcomeMessage != nil {
				fields := allFields[p.WelcomeMessage.Id]
				welcomeMessage = types.NewCustomEmbed(p.WelcomeMessage, fields)
			}

			accessControlList := accessControlLists[p.PanelId]
			if accessControlList == nil {
				accessControlList = make([]database.PanelAccessControlRule, 0)
			}

			// Check if panel has support hours configured
			supportHours, err := dbclient.Client.PanelSupportHours.GetByPanelId(c, p.PanelId)
			if err != nil {
				return err
			}

			hasSupportHours := len(supportHours) > 0
			isCurrentlyActive := true // Default to active if no hours configured

			if hasSupportHours {
				isCurrentlyActive, err = dbclient.Client.PanelSupportHours.IsActiveNow(c, p.PanelId)
				if err != nil {
					return err
				}
			}

			wrapped[i] = panelResponse{
				Panel:                        p.Panel,
				WelcomeMessage:               welcomeMessage,
				UseCustomEmoji:               p.EmojiId != nil,
				Emoji:                        types.NewEmoji(p.EmojiName, p.EmojiId),
				Mentions:                     mentions,
				Teams:                        teamIds,
				UseServerDefaultNamingScheme: p.NamingScheme == nil,
				AccessControlList:            accessControlList,
				HasSupportHours:              hasSupportHours,
				IsCurrentlyActive:            isCurrentlyActive,
			}

			return nil
		})
	}

	if err := group.Wait(); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewServerError(err))
		return
	}

	c.JSON(200, wrapped)
}
