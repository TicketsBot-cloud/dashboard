package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/gdl/objects/member"
	"github.com/TicketsBot-cloud/gdl/objects/user"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

type ticketMember struct {
	Id       uint64 `json:"id,string"`
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
}

func GetTicketMembers(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	ticketId, err := strconv.Atoi(c.Param("ticketId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid ticket ID provided: %s", c.Param("ticketId")))
		return
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	ticket, err := dbclient.Client.Tickets.Get(c, ticketId, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, fmt.Sprintf("Failed to load ticket #%d", ticketId)))
		return
	}

	if ticket.GuildId != guildId {
		c.JSON(http.StatusForbidden, utils.ErrorStr("Ticket #%d does not belong to guild %d", ticketId, guildId))
		return
	}

	if !ticket.Open {
		c.JSON(http.StatusNotFound, utils.ErrorStr("Ticket #%d has been closed and is no longer accessible", ticketId))
		return
	}

	hasPermission, requestErr := utils.HasPermissionToViewTicket(c, guildId, userId, ticket)
	if requestErr != nil {
		c.JSON(requestErr.StatusCode, app.NewError(requestErr, fmt.Sprintf("Failed to verify permissions for user %d to view ticket #%d", userId, ticketId)))
		return
	}

	if !hasPermission {
		c.JSON(http.StatusForbidden, utils.ErrorStr("User %d does not have permission to view ticket #%d", userId, ticketId))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(c, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, fmt.Sprintf("Failed to verify premium status for guild %d", guildId)))
		return
	}

	if premiumTier == premium.None {
		c.JSON(http.StatusPaymentRequired, utils.ErrorStr("This feature requires a premium subscription. Guild %d is not premium.", guildId))
		return
	}

	// Collect user IDs from multiple sources in parallel
	var claimedBy uint64
	var ticketMemberIds []uint64
	var participants []uint64
	var guildStaff []uint64
	var panelTeamMembers []uint64
	var adminRoles []uint64
	var supportRoles []uint64
	var panelTeamRoles []uint64
	var cachedMembers []member.Member

	group, groupCtx := errgroup.WithContext(c)

	group.Go(func() error {
		var err error
		claimedBy, err = dbclient.Client.TicketClaims.Get(groupCtx, guildId, ticketId)
		return err
	})

	group.Go(func() error {
		var err error
		ticketMemberIds, err = dbclient.Client.TicketMembers.Get(groupCtx, guildId, ticketId)
		return err
	})

	group.Go(func() error {
		var err error
		participants, err = dbclient.Client.Participants.GetParticipants(groupCtx, guildId, ticketId)
		return err
	})

	// Fetch guild-wide admins and support staff (direct user assignments)
	group.Go(func() error {
		var err error
		guildStaff, err = dbclient.Client.Permissions.GetSupport(groupCtx, guildId)
		return err
	})

	// Fetch support team members with access to this ticket's panel (direct user assignments)
	if ticket.PanelId != nil {
		group.Go(func() error {
			var err error
			panelTeamMembers, err = dbclient.Client.SupportTeamMembers.GetAllSupportMembersForPanel(groupCtx, *ticket.PanelId)
			if err != nil {
				return err
			}

			// If the panel uses the default team, also include all guild-wide support team members
			panel, err := dbclient.Client.Panel.GetById(groupCtx, *ticket.PanelId)
			if err != nil {
				return err
			}

			if panel.WithDefaultTeam {
				defaultTeamMembers, err := dbclient.Client.SupportTeamMembers.GetAllSupportMembers(groupCtx, guildId)
				if err != nil {
					return err
				}
				panelTeamMembers = append(panelTeamMembers, defaultTeamMembers...)
			}

			return nil
		})

		// Fetch panel team role IDs
		group.Go(func() error {
			var err error
			panelTeamRoles, err = dbclient.Client.SupportTeamRoles.GetAllSupportRolesForPanel(groupCtx, *ticket.PanelId)
			return err
		})
	} else {
		// Non-panel ticket: include all guild-wide support team members
		group.Go(func() error {
			var err error
			panelTeamMembers, err = dbclient.Client.SupportTeamMembers.GetAllSupportMembers(groupCtx, guildId)
			return err
		})
	}

	// Fetch admin and support role IDs
	group.Go(func() error {
		var err error
		adminRoles, err = dbclient.Client.RolePermissions.GetAdminRoles(groupCtx, guildId)
		return err
	})

	group.Go(func() error {
		var err error
		supportRoles, err = dbclient.Client.RolePermissions.GetSupportRoles(groupCtx, guildId)
		return err
	})

	// Fetch cached guild members (roles only, no user data) for role-based matching
	group.Go(func() error {
		var err error
		cachedMembers, err = cache.Instance.GetGuildMembers(groupCtx, guildId, false)
		return err
	})

	if err := group.Wait(); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, fmt.Sprintf("Failed to load members for ticket #%d", ticketId)))
		return
	}

	// Deduplicate user IDs
	seen := make(map[uint64]bool)
	seen[ticket.UserId] = true

	if claimedBy != 0 {
		seen[claimedBy] = true
	}

	for _, id := range ticketMemberIds {
		seen[id] = true
	}

	for _, id := range participants {
		seen[id] = true
	}

	for _, id := range guildStaff {
		seen[id] = true
	}

	for _, id := range panelTeamMembers {
		seen[id] = true
	}

	// Build a set of role IDs that grant access to this ticket
	staffRoles := make(map[uint64]bool)
	for _, roleId := range adminRoles {
		staffRoles[roleId] = true
	}
	for _, roleId := range supportRoles {
		staffRoles[roleId] = true
	}
	for _, roleId := range panelTeamRoles {
		staffRoles[roleId] = true
	}

	// Match cached guild members who have any of the staff roles
	if len(staffRoles) > 0 {
		for _, m := range cachedMembers {
			if seen[m.User.Id] {
				continue
			}
			for _, roleId := range m.Roles {
				if staffRoles[roleId] {
					seen[m.User.Id] = true
					break
				}
			}
		}
	}

	userIds := make([]uint64, 0, len(seen))
	for id := range seen {
		userIds = append(userIds, id)
	}

	// Resolve users from cache
	resolvedUsers, err := cache.Instance.GetUsers(c, userIds)
	if err != nil {
		resolvedUsers = map[uint64]user.User{}
	}

	// Build response
	result := make([]ticketMember, 0, len(userIds))
	for _, id := range userIds {
		if u, ok := resolvedUsers[id]; ok {
			result = append(result, ticketMember{
				Id:       id,
				Username: u.EffectiveName(),
				Avatar:   u.AvatarUrl(64),
			})
		} else {
			result = append(result, ticketMember{
				Id:       id,
				Username: strconv.FormatUint(id, 10),
				Avatar:   "",
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"members": result,
	})
}
