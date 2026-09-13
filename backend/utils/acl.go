package utils

import "github.com/TicketsBot-cloud/database"

// DefaultAccessControlList keeps every writer that materialises a default on the same contents
// and order, since order is evaluation precedence.
func DefaultAccessControlList(guildId uint64) []database.PanelAccessControlRule {
	return []database.PanelAccessControlRule{
		{RoleId: guildId, Action: database.AccessControlActionAllow},
	}
}
