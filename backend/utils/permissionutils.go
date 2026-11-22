package utils

import (
	"context"
	"net/http"
	"slices"

	"github.com/TicketsBot-cloud/common/permission"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/member"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/internal/admin"
	"github.com/ticketsbot-cloud/dashboard/backend/internal/api"
)

func GetPermissionLevel(ctx context.Context, guildId, userId uint64) (permission.PermissionLevel, error) {
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return permission.Everyone, err
	}

	// do this check here before trying to get the member
	if botContext.IsBotAdmin(ctx, userId) {
		return permission.Admin, nil
	}

	// Check staff override
	staffOverride, err := dbclient.Client.StaffOverride.HasActiveOverride(ctx, guildId)
	if err != nil {
		return permission.Everyone, err
	}

	// If staff override enabled and the user is bot staff, grant admin permissions
	if staffOverride {
		isBotStaff, err := dbclient.Client.BotStaff.IsStaff(ctx, userId)
		if err != nil {
			return permission.Everyone, err
		}

		if isBotStaff {
			return permission.Admin, nil
		}
	}

	// get member
	member, err := botContext.GetGuildMember(ctx, guildId, userId)
	if err != nil {
		return permission.Everyone, err
	}

	return permission.GetPermissionLevel(ctx, botContext, member, guildId)
}

func GetPermissionLevelWithSource(ctx context.Context, guildId, userId uint64) (permission.PermissionLevel, permission.PermissionSource, error) {
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return permission.Everyone, permission.SourceNone, err
	}

	// do this check here before trying to get the member
	if botContext.IsBotAdmin(ctx, userId) {
		return permission.Admin, permission.SourceBotAdmin, nil
	}

	// Check staff override
	staffOverride, err := dbclient.Client.StaffOverride.HasActiveOverride(ctx, guildId)
	if err != nil {
		return permission.Everyone, permission.SourceNone, err
	}

	// If staff override enabled and the user is bot staff, grant admin permissions
	if staffOverride {
		isBotStaff, err := dbclient.Client.BotStaff.IsStaff(ctx, userId)
		if err != nil {
			return permission.Everyone, permission.SourceNone, err
		}

		if isBotStaff {
			return permission.Admin, permission.SourceBotStaff, nil
		}
	}

	// get member
	member, err := botContext.GetGuildMember(ctx, guildId, userId)
	if err != nil {
		return permission.Everyone, permission.SourceNone, err
	}

	return permission.GetPermissionLevelWithSource(ctx, botContext, member, guildId)
}

func HasPermissionToViewTicket(ctx context.Context, guildId, userId uint64, ticket database.Ticket) (bool, *api.RequestError) {
	// If user opened the ticket, they will always have permission
	if ticket.UserId == userId && ticket.GuildId == guildId {
		return true, nil
	}

	// Admin override
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return false, api.NewInternalServerError(err, "Unable to connect to Discord. Please try again later.")
	}

	if botContext.IsBotAdmin(ctx, userId) {
		return true, nil
	}

	// Check staff override
	staffOverride, err := dbclient.Client.StaffOverride.HasActiveOverride(ctx, guildId)
	if err != nil {
		return false, api.NewDatabaseError(err)
	}

	// If staff override enabled and the user is bot staff, grant admin permissions
	if staffOverride {
		isBotStaff, err := dbclient.Client.BotStaff.IsStaff(ctx, userId)
		if err != nil {
			return false, api.NewDatabaseError(err)
		}

		if isBotStaff {
			return true, nil
		}
	}

	// Check if server owner
	guild, err := botContext.GetGuild(ctx, guildId)
	if err != nil {
		return false, api.NewInternalServerError(err, "Error retrieving guild object")
	}

	if guild.OwnerId == userId {
		return true, nil
	}

	member, err := botContext.GetGuildMember(ctx, guildId, userId)
	if err != nil {
		return false, api.NewErrorWithMessage(http.StatusForbidden, err, "User not in server: are you logged into the correct account?")
	}

	// Admins should have access to all tickets
	isAdmin, err := dbclient.Client.Permissions.IsAdmin(ctx, guildId, userId)
	if err != nil {
		return false, api.NewDatabaseError(err)
	}

	if isAdmin {
		return true, nil
	}

	// TODO: Check in db
	adminRoles, err := dbclient.Client.RolePermissions.GetAdminRoles(ctx, guildId)
	if err != nil {
		return false, api.NewDatabaseError(err)
	}

	for _, roleId := range adminRoles {
		if member.HasRole(roleId) {
			return true, nil
		}
	}

	// If ticket is not from a panel, we can use default team perms
	if ticket.PanelId == nil {
		canView, apiErr := isOnDefaultTeam(ctx, guildId, member)
		if apiErr != nil {
			return false, apiErr
		}

		return canView, nil
	} else {
		panel, err := dbclient.Client.Panel.GetById(ctx, *ticket.PanelId)
		if err != nil {
			return false, api.NewDatabaseError(err)
		}

		if panel.WithDefaultTeam {
			canView, apiErr := isOnDefaultTeam(ctx, guildId, member)
			if apiErr != nil {
				return false, apiErr
			}

			if canView {
				return true, nil
			}
		}

		// If panel does not use the default team, or the user is not assigned to it, check support teams
		supportTeams, err := dbclient.Client.PanelTeams.GetTeams(ctx, *ticket.PanelId)
		if err != nil {
			return false, api.NewDatabaseError(err)
		}

		if len(supportTeams) > 0 {
			var supportTeamIds []int
			for _, team := range supportTeams {
				supportTeamIds = append(supportTeamIds, team.Id)
			}

			// Check if user is added to support team directly
			isSupport, err := dbclient.Client.SupportTeamMembers.IsSupportSubset(ctx, guildId, userId, supportTeamIds)
			if err != nil {
				return false, api.NewDatabaseError(err)
			}

			if isSupport {
				return true, nil
			}

			// Check if user is added to support team via a role
			isSupport, err = dbclient.Client.SupportTeamRoles.IsSupportAnySubset(ctx, guildId, member.Roles, supportTeamIds)
			if err != nil {
				return false, api.NewDatabaseError(err)
			}

			if isSupport {
				return true, nil
			}
		}

		return false, nil
	}
}

// GetPanelAccess reports which tickets a user may list: all for admins and the default team,
// otherwise only panelIds. An empty panelIds means nothing, never unfiltered.
func GetPanelAccess(ctx context.Context, guildId, userId uint64) (bool, []int, error) {
	level, err := GetPermissionLevel(ctx, guildId, userId)
	if err != nil {
		return false, nil, err
	}

	if level >= permission.Admin {
		return true, nil, nil
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return false, nil, err
	}

	member, err := botContext.GetGuildMember(ctx, guildId, userId)
	if err != nil {
		return false, nil, err
	}

	onDefaultTeam, apiErr := isOnDefaultTeam(ctx, guildId, member)
	if apiErr != nil {
		// apiErr.Error() is only the generic user message
		return false, nil, apiErr.Err
	}

	if onDefaultTeam {
		return true, nil, nil
	}

	directTeamIds, err := dbclient.Client.SupportTeamMembers.GetAllTeamsForUser(ctx, guildId, userId)
	if err != nil {
		return false, nil, err
	}

	roleTeamIds, err := dbclient.Client.SupportTeamRoles.GetAllTeamsForRoles(ctx, guildId, member.Roles)
	if err != nil {
		return false, nil, err
	}

	teamIdSet := make(map[int]struct{})
	for _, id := range directTeamIds {
		teamIdSet[id] = struct{}{}
	}
	for _, id := range roleTeamIds {
		teamIdSet[id] = struct{}{}
	}

	if len(teamIdSet) == 0 {
		return false, nil, nil
	}

	var allTeamIds []int
	for id := range teamIdSet {
		allTeamIds = append(allTeamIds, id)
	}

	panelIds, err := dbclient.Client.PanelTeams.GetPanelsByTeams(ctx, allTeamIds)
	if err != nil {
		return false, nil, err
	}

	return false, panelIds, nil
}

// ScopePanelFilter narrows filter to the accessible panels, never to "every panel".
func ScopePanelFilter(filter *database.PanelFilter, accessible []int) *database.PanelFilter {
	var ids []int
	if filter == nil {
		ids = slices.Clone(accessible)
	} else {
		for _, id := range filter.PanelIds {
			if slices.Contains(accessible, id) {
				ids = append(ids, id)
			}
		}
	}

	// Panel IDs start at 1, so {0} matches nothing, whereas an empty list means no filter
	if len(ids) == 0 {
		ids = []int{0}
	}

	slices.Sort(ids)
	return &database.PanelFilter{PanelIds: ids}
}

// HasPermissionToViewTicketContent checks whether a user may view the actual
// message content of a ticket (live messages or archived transcript). Unlike
// HasPermissionToViewTicket, bot-admin-tier staff and staff-override-elevated
// users are denied content access. Only the bot owner and admins the owner has
// granted global view bypass this restriction. All other checks (ticket opener,
// guild admin/support roles, panel team membership) are identical to
// HasPermissionToViewTicket.
func HasPermissionToViewTicketContent(ctx context.Context, guildId, userId uint64, ticket database.Ticket) (bool, *api.RequestError) {
	// Ticket opener always has permission
	if ticket.UserId == userId && ticket.GuildId == guildId {
		return true, nil
	}

	if admin.HasGlobalView(ctx, userId) {
		return true, nil
	}

	// Staff override intentionally omitted: it must not grant content access

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return false, api.NewInternalServerError(err, "Unable to connect to Discord. Please try again later.")
	}

	// Check if server owner
	guild, err := botContext.GetGuild(ctx, guildId)
	if err != nil {
		return false, api.NewInternalServerError(err, "Error retrieving guild object")
	}

	if guild.OwnerId == userId {
		return true, nil
	}

	member, err := botContext.GetGuildMember(ctx, guildId, userId)
	if err != nil {
		return false, api.NewErrorWithMessage(http.StatusForbidden, err, "User not in server: are you logged into the correct account?")
	}

	// Admins should have access to all tickets
	isAdmin, err := dbclient.Client.Permissions.IsAdmin(ctx, guildId, userId)
	if err != nil {
		return false, api.NewDatabaseError(err)
	}

	if isAdmin {
		return true, nil
	}

	adminRoles, err := dbclient.Client.RolePermissions.GetAdminRoles(ctx, guildId)
	if err != nil {
		return false, api.NewDatabaseError(err)
	}

	for _, roleId := range adminRoles {
		if member.HasRole(roleId) {
			return true, nil
		}
	}

	if ticket.PanelId == nil {
		canView, apiErr := isOnDefaultTeam(ctx, guildId, member)
		if apiErr != nil {
			return false, apiErr
		}

		return canView, nil
	} else {
		panel, err := dbclient.Client.Panel.GetById(ctx, *ticket.PanelId)
		if err != nil {
			return false, api.NewDatabaseError(err)
		}

		if panel.WithDefaultTeam {
			canView, apiErr := isOnDefaultTeam(ctx, guildId, member)
			if apiErr != nil {
				return false, apiErr
			}

			if canView {
				return true, nil
			}
		}

		supportTeams, err := dbclient.Client.PanelTeams.GetTeams(ctx, *ticket.PanelId)
		if err != nil {
			return false, api.NewDatabaseError(err)
		}

		if len(supportTeams) > 0 {
			var supportTeamIds []int
			for _, team := range supportTeams {
				supportTeamIds = append(supportTeamIds, team.Id)
			}

			isSupport, err := dbclient.Client.SupportTeamMembers.IsSupportSubset(ctx, guildId, userId, supportTeamIds)
			if err != nil {
				return false, api.NewDatabaseError(err)
			}

			if isSupport {
				return true, nil
			}

			isSupport, err = dbclient.Client.SupportTeamRoles.IsSupportAnySubset(ctx, guildId, member.Roles, supportTeamIds)
			if err != nil {
				return false, api.NewDatabaseError(err)
			}

			if isSupport {
				return true, nil
			}
		}

		return false, nil
	}
}

func isOnDefaultTeam(ctx context.Context, guildId uint64, member member.Member) (bool, *api.RequestError) {
	// Admin perms are already checked straight away, so we don't need to check for them here
	// Check user perms for support
	if isSupport, err := dbclient.Client.Permissions.IsSupport(ctx, guildId, member.User.Id); err == nil {
		if isSupport {
			return true, nil
		}
	} else {
		return false, api.NewDatabaseError(err)
	}

	// Check DB for support roles
	supportRoles, err := dbclient.Client.RolePermissions.GetSupportRoles(ctx, guildId)
	if err != nil {
		return false, api.NewDatabaseError(err)
	}

	for _, supportRoleId := range supportRoles {
		if member.HasRole(supportRoleId) {
			return true, nil
		}
	}

	return false, nil
}
