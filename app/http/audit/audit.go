package audit

import (
	"context"
	"encoding/json"
	"time"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/database"
	"go.uber.org/zap"
)

type LogEntry struct {
	GuildId      *uint64
	UserId       uint64
	ActionType   database.AuditActionType
	ResourceType database.AuditResourceType
	ResourceId   *string
	OldData      any
	NewData      any
	Metadata     any
}

func Log(entry LogEntry) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		dbEntry := database.AuditLogEntry{
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
