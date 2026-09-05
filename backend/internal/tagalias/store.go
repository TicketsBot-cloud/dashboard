package tagalias

import (
	"context"

	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
)

// Only updates rows that already have an alias, so a tag differing only in case is left alone.
func SetCommandId(ctx context.Context, guildId uint64, tagId string, commandId *uint64) (int64, error) {
	query := `UPDATE tags SET "application_command_id" = $1 WHERE "guild_id" = $2 AND LOWER("tag_id") = LOWER($3) AND "application_command_id" IS NOT NULL;`

	res, err := dbclient.Client.Tag.Exec(ctx, query, commandId, guildId, tagId)
	if err != nil {
		return 0, err
	}

	return res.RowsAffected(), nil
}
