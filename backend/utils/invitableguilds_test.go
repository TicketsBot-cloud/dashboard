package utils

import (
	"testing"

	"github.com/TicketsBot-cloud/common/collections"
	"github.com/TicketsBot-cloud/database"
	gdlpermission "github.com/TicketsBot-cloud/gdl/permission"
	"github.com/stretchr/testify/require"
)

func TestFilterInvitableGuilds(t *testing.T) {
	admin := gdlpermission.BuildPermissions(gdlpermission.Administrator)
	manageGuild := gdlpermission.BuildPermissions(gdlpermission.ManageGuild)
	unrelated := gdlpermission.BuildPermissions(gdlpermission.ManageChannels, gdlpermission.KickMembers, gdlpermission.ManageRoles)

	botIn := func(ids ...uint64) *collections.Set[uint64] {
		s := collections.NewSet[uint64]()
		for _, id := range ids {
			s.Add(id)
		}
		return s
	}

	tests := []struct {
		name     string
		guilds   []database.UserGuild
		botIds   *collections.Set[uint64]
		expected []InvitableGuildDto
	}{
		{
			name:     "nil input returns empty slice",
			guilds:   nil,
			botIds:   botIn(),
			expected: []InvitableGuildDto{},
		},
		{
			name:     "empty input returns empty slice",
			guilds:   []database.UserGuild{},
			botIds:   botIn(),
			expected: []InvitableGuildDto{},
		},
		{
			name:     "owner without permissions",
			guilds:   []database.UserGuild{{GuildId: 1, Name: "Owned", Owner: true, Icon: "abc"}},
			botIds:   botIn(),
			expected: []InvitableGuildDto{{Id: 1, Name: "Owned", Icon: "abc"}},
		},
		{
			name:     "administrator",
			guilds:   []database.UserGuild{{GuildId: 2, Name: "Admin", UserPermissions: admin}},
			botIds:   botIn(),
			expected: []InvitableGuildDto{{Id: 2, Name: "Admin"}},
		},
		{
			name:     "manage guild",
			guilds:   []database.UserGuild{{GuildId: 3, Name: "Manager", UserPermissions: manageGuild}},
			botIds:   botIn(),
			expected: []InvitableGuildDto{{Id: 3, Name: "Manager"}},
		},
		{
			name:     "manage guild among other permissions",
			guilds:   []database.UserGuild{{GuildId: 4, Name: "Mixed", UserPermissions: manageGuild | unrelated}},
			botIds:   botIn(),
			expected: []InvitableGuildDto{{Id: 4, Name: "Mixed"}},
		},
		{
			name:     "no relevant permissions",
			guilds:   []database.UserGuild{{GuildId: 5, Name: "Member", UserPermissions: unrelated}},
			botIds:   botIn(),
			expected: []InvitableGuildDto{},
		},
		{
			name:     "bot already present",
			guilds:   []database.UserGuild{{GuildId: 6, Name: "Has Bot", Owner: true, UserPermissions: admin}},
			botIds:   botIn(6),
			expected: []InvitableGuildDto{},
		},
		{
			name:     "nil bot set treats bot as absent everywhere",
			guilds:   []database.UserGuild{{GuildId: 7, Name: "Owned", Owner: true}},
			botIds:   nil,
			expected: []InvitableGuildDto{{Id: 7, Name: "Owned"}},
		},
		{
			name: "sorted by name case-insensitively with id tiebreak",
			guilds: []database.UserGuild{
				{GuildId: 30, Name: "charlie", Owner: true},
				{GuildId: 20, Name: "Bravo", UserPermissions: admin},
				{GuildId: 12, Name: "alpha", UserPermissions: manageGuild},
				{GuildId: 11, Name: "Alpha", Owner: true},
				{GuildId: 40, Name: "Delta", UserPermissions: unrelated},
				{GuildId: 50, Name: "Echo", Owner: true},
			},
			botIds: botIn(50),
			expected: []InvitableGuildDto{
				{Id: 11, Name: "Alpha"},
				{Id: 12, Name: "alpha"},
				{Id: 20, Name: "Bravo"},
				{Id: 30, Name: "charlie"},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actual := FilterInvitableGuilds(tc.guilds, tc.botIds)
			require.NotNil(t, actual)
			require.Equal(t, tc.expected, actual)
		})
	}
}
