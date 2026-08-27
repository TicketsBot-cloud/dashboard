package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/TicketsBot-cloud/database"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"go.uber.org/zap"
)

type LogEntry struct {
	Category     database.AuditCategory
	GuildId      *uint64
	UserId       uint64
	ActionType   database.AuditActionType
	ResourceType database.AuditResourceType
	ResourceId   *string
	OldData      any
	NewData      any
	Metadata     any
}

// Staff actions are indistinguishable from user ones at this layer, so the admin API tags them.
func LogStaff(entry LogEntry) {
	entry.Category = database.AuditCategoryStaff
	Log(entry)
}

func Log(entry LogEntry) {
	if entry.Category == 0 {
		if entry.GuildId != nil {
			entry.Category = database.AuditCategoryGuild
		} else {
			entry.Category = database.AuditCategoryUser
		}
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		dbEntry := database.AuditLogEntry{
			Category:     entry.Category,
			GuildId:      entry.GuildId,
			UserId:       entry.UserId,
			ActionType:   entry.ActionType,
			ResourceType: entry.ResourceType,
			ResourceId:   entry.ResourceId,
		}

		if entry.OldData != nil {
			raw, err := json.Marshal(entry.OldData)
			if err != nil {
				log.Logger.Error("Failed to marshal audit log old_data", zap.Error(err))
				return
			}
			s := string(raw)
			dbEntry.OldData = &s
		}

		if entry.NewData != nil {
			raw, err := json.Marshal(entry.NewData)
			if err != nil {
				log.Logger.Error("Failed to marshal audit log new_data", zap.Error(err))
				return
			}
			s := string(raw)
			dbEntry.NewData = &s
		}

		if entry.Metadata != nil {
			raw, err := json.Marshal(entry.Metadata)
			if err != nil {
				log.Logger.Error("Failed to marshal audit log metadata", zap.Error(err))
				return
			}
			s := string(raw)
			dbEntry.Metadata = &s
		}

		if err := dbclient.Client.AuditLog.Insert(ctx, dbEntry); err != nil {
			log.Logger.Error("Failed to insert audit log entry", zap.Error(err))
		}
	}()
}

// StringPtr is a helper to create a *string from a value.
func StringPtr(s string) *string {
	return &s
}

// Uint64Ptr is a helper to create a *uint64 from a value.
func Uint64Ptr(v uint64) *uint64 {
	return &v
}
