package utils

import (
	"context"
	"net/http"

	"github.com/TicketsBot-cloud/common/permission"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/internal/api"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/member"
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

// IsPanelTeamMemberOnly checks if a user has ONLY panel team access (not guild-wide permissions)
// Returns true if the user is a support team member but does not have admin or default team access
func IsPanelTeamMemberOnly(ctx context.Context, guildId, userId uint64) (bool, error) {
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return false, err
	}

	// Bot admins have full access
	if botContext.IsBotAdmin(ctx, userId) {
		return false, nil
	}

	// Check staff override
	staffOverride, err := dbclient.Client.StaffOverride.HasActiveOverride(ctx, guildId)
	if err != nil {
		return false, err
	}

	// If staff override enabled and the user is bot staff, they have full access
	if staffOverride {
		isBotStaff, err := dbclient.Client.BotStaff.IsStaff(ctx, userId)
		if err != nil {
			return false, err
		}

		if isBotStaff {
			return false, nil
		}
	}

	// Check if server owner
	guild, err := botContext.GetGuild(ctx, guildId)
	if err != nil {
		return false, err
	}

	if guild.OwnerId == userId {
		return false, nil
	}

	member, err := botContext.GetGuildMember(ctx, guildId, userId)
	if err != nil {
		return false, err
	}

	// Admins have full access
	isAdmin, err := dbclient.Client.Permissions.IsAdmin(ctx, guildId, userId)
	if err != nil {
		return false, err
	}

	if isAdmin {
		return false, nil
	}

	// Check admin roles
	adminRoles, err := dbclient.Client.RolePermissions.GetAdminRoles(ctx, guildId)
	if err != nil {
		return false, err
	}

	for _, roleId := range adminRoles {
		if member.HasRole(roleId) {
			return false, nil
		}
	}

	// Check if user is on the default support team (guild-wide support)
	isSupport, err := dbclient.Client.Permissions.IsSupport(ctx, guildId, userId)
	if err != nil {
		return false, err
	}

	if isSupport {
		return false, nil
	}

	// Check if user has a support role (guild-wide)
	supportRoles, err := dbclient.Client.RolePermissions.GetSupportRoles(ctx, guildId)
	if err != nil {
		return false, err
	}

	for _, supportRoleId := range supportRoles {
		if member.HasRole(supportRoleId) {
			return false, nil
		}
	}

	// Now check if user is in any support team (panel-specific)
	allTeams, err := dbclient.Client.SupportTeam.Get(ctx, guildId)
	if err != nil {
		return false, err
	}

	if len(allTeams) > 0 {
		var teamIds []int
		for _, team := range allTeams {
			teamIds = append(teamIds, team.Id)
		}

		// Check if user is directly in any support team
		isInTeam, err := dbclient.Client.SupportTeamMembers.IsSupportSubset(ctx, guildId, userId, teamIds)
		if err != nil {
			return false, err
		}

		if isInTeam {
			return true, nil
		}

		// Check if user has a role that's in any support team
		isInTeam, err = dbclient.Client.SupportTeamRoles.IsSupportAnySubset(ctx, guildId, member.Roles, teamIds)
		if err != nil {
			return false, err
		}

		if isInTeam {
			return true, nil
		}
	}

	// User has no support access at all
	return false, nil
}

// GetAccessiblePanelIds returns the list of panel IDs a panel team member has access to.
// This function should only be called for users who have been verified as panel-team-only
// members via IsPanelTeamMemberOnly().
func GetAccessiblePanelIds(ctx context.Context, guildId, userId uint64) ([]int, error) {
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return nil, err
	}

	member, err := botContext.GetGuildMember(ctx, guildId, userId)
	if err != nil {
		return nil, err
	}

	// Get all team IDs the user belongs to directly
	directTeamIds, err := dbclient.Client.SupportTeamMembers.GetAllTeamsForUser(ctx, guildId, userId)
	if err != nil {
		return nil, err
	}

	// Get all team IDs the user belongs to via roles
	roleTeamIds, err := dbclient.Client.SupportTeamRoles.GetAllTeamsForRoles(ctx, guildId, member.Roles)
	if err != nil {
		return nil, err
	}

	// Combine and deduplicate team IDs
	teamIdSet := make(map[int]struct{})
	for _, id := range directTeamIds {
		teamIdSet[id] = struct{}{}
	}
	for _, id := range roleTeamIds {
		teamIdSet[id] = struct{}{}
	}

	if len(teamIdSet) == 0 {
		return nil, nil
	}

	var allTeamIds []int
	for id := range teamIdSet {
		allTeamIds = append(allTeamIds, id)
	}

	// Get all panels that use any of these teams
	panelIds, err := dbclient.Client.PanelTeams.GetPanelsByTeams(ctx, allTeamIds)
	if err != nil {
		return nil, err
	}

	return panelIds, nil
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
