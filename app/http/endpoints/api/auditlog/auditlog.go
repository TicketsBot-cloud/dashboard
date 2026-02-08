package api

import (
	"context"
	"fmt"
	"time"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

const pageSize = 25

type auditLogFilterBody struct {
	UserId       *uint64 `json:"user_id,string"`
	ActionType   *int16  `json:"action_type"`
	ResourceType *int16  `json:"resource_type"`
	Before       *string `json:"before"`
	After        *string `json:"after"`
	Page         int     `json:"page"`
}

type auditLogResponse struct {
	Id           int64   `json:"id"`
	GuildId      *uint64 `json:"guild_id,string,omitempty"`
	UserId       uint64  `json:"user_id,string"`
	Username     string  `json:"username"`
	ActionType   int16   `json:"action_type"`
	ResourceType int16   `json:"resource_type"`
	ResourceId   *string `json:"resource_id,omitempty"`
	OldData      *string `json:"old_data,omitempty"`
	NewData      *string `json:"new_data,omitempty"`
	Metadata     *string `json:"metadata,omitempty"`
	CreatedAt    string  `json:"created_at"`
}

type paginatedAuditLogs struct {
	Entries     []auditLogResponse `json:"entries"`
	TotalCount  int                `json:"total_count"`
	TotalPages  int                `json:"total_pages"`
	CurrentPage int                `json:"current_page"`
}

func GetAuditLogs(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	var body auditLogFilterBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if body.Page < 1 {
		body.Page = 1
	}

	opts := database.AuditLogQueryOptions{
		GuildId: &guildId,
		Limit:   pageSize,
		Offset:  (body.Page - 1) * pageSize,
	}

	if body.UserId != nil {
		opts.UserId = body.UserId
	}

	if body.ActionType != nil {
		opts.ActionType = body.ActionType
	}

	if body.ResourceType != nil {
		opts.ResourceType = body.ResourceType
	}

	if body.Before != nil {
		t, err := time.Parse(time.RFC3339, *body.Before)
		if err != nil {
			ctx.JSON(400, utils.ErrorStr("Invalid 'before' date format. Use RFC3339."))
			return
		}
		opts.Before = &t
	}

	if body.After != nil {
		t, err := time.Parse(time.RFC3339, *body.After)
		if err != nil {
			ctx.JSON(400, utils.ErrorStr("Invalid 'after' date format. Use RFC3339."))
			return
		}
		opts.After = &t
	}

	entries, err := dbclient.Client.AuditLog.Query(ctx, opts)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch audit logs. Please try again."))
		return
	}

	totalCount, err := dbclient.Client.AuditLog.Count(ctx, opts)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch audit log count. Please try again."))
		return
	}

	totalPages := (totalCount + pageSize - 1) / pageSize
	if totalPages == 0 {
		totalPages = 1
	}

	// Resolve usernames for all entries
	usernames := resolveUsernames(ctx, entries)

	responseEntries := make([]auditLogResponse, len(entries))
	for i, entry := range entries {
		username := usernames[entry.UserId]
		if username == "" {
			username = fmt.Sprintf("%d", entry.UserId)
		}

		responseEntries[i] = auditLogResponse{
			Id:           entry.Id,
			GuildId:      entry.GuildId,
			UserId:       entry.UserId,
			Username:     username,
			ActionType:   int16(entry.ActionType),
			ResourceType: int16(entry.ResourceType),
			ResourceId:   entry.ResourceId,
			OldData:      entry.OldData,
			NewData:      entry.NewData,
			Metadata:     entry.Metadata,
			CreatedAt:    entry.CreatedAt.Format(time.RFC3339),
		}
	}

	ctx.JSON(200, paginatedAuditLogs{
		Entries:     responseEntries,
		TotalCount:  totalCount,
		TotalPages:  totalPages,
		CurrentPage: body.Page,
	})
}

// resolveUsernames batch-looks up usernames from the cache for a set of audit log entries.
func resolveUsernames(ctx context.Context, entries []database.AuditLogEntry) map[uint64]string {
	usernames := make(map[uint64]string)

	// Collect unique user IDs
	userIds := make([]uint64, 0)
	seen := make(map[uint64]bool)
	for _, entry := range entries {
		if !seen[entry.UserId] {
			seen[entry.UserId] = true
			userIds = append(userIds, entry.UserId)
		}
	}

	if len(userIds) == 0 {
		return usernames
	}

	rows, err := cache.Instance.Query(ctx, `SELECT "user_id", "data"->>'username' FROM users WHERE "user_id" = ANY($1)`, userIds)
	if err != nil {
		return usernames
	}
	defer rows.Close()

	for rows.Next() {
		var userId uint64
		var username string
		if err := rows.Scan(&userId, &username); err != nil {
			continue
		}
		usernames[userId] = username
	}

	return usernames
}
