package api

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/utils"
)

type wrappedQueryOptions struct {
	Id          int    `json:"id"`
	Username    string `json:"username"`
	UserId      uint64 `json:"user_id"`
	PanelId     int    `json:"panel_id"`
	ClaimedById uint64 `json:"claimed_by_id"`
}

// UnmarshalJSON dynamically handles both string and number types, treating empty strings as 0
func (o *wrappedQueryOptions) UnmarshalJSON(data []byte) error {
	// First unmarshal into a map to handle different types
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	// Use reflection to dynamically set fields
	v := reflect.ValueOf(o).Elem()
	t := v.Type()

	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		fieldValue := v.Field(i)

		// Get the JSON tag name
		jsonTag := field.Tag.Get("json")
		if jsonTag == "" {
			jsonTag = strings.ToLower(field.Name)
		}
		// Handle comma-separated tags (e.g., "field,omitempty")
		if idx := strings.Index(jsonTag, ","); idx != -1 {
			jsonTag = jsonTag[:idx]
		}

		// Get the raw value from the map
		rawValue, exists := raw[jsonTag]
		if !exists {
			continue
		}

		// Set the field based on its type
		switch fieldValue.Kind() {
		case reflect.String:
			if s, ok := rawValue.(string); ok {
				fieldValue.SetString(s)
			}
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			switch val := rawValue.(type) {
			case string:
				if val != "" {
					if n, err := strconv.ParseInt(val, 10, 64); err == nil {
						fieldValue.SetInt(n)
					}
				}
			case float64:
				fieldValue.SetInt(int64(val))
			}
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			switch val := rawValue.(type) {
			case string:
				if val != "" {
					if n, err := strconv.ParseUint(val, 10, 64); err == nil {
						fieldValue.SetUint(n)
					}
				}
			case float64:
				fieldValue.SetUint(uint64(val))
			}
		}
	}

	return nil
}

func (o *wrappedQueryOptions) toQueryOptions(guildId uint64) (database.TicketQueryOptions, error) {
	var userIds []uint64
	if len(o.Username) > 0 {
		var err error
		userIds, err = usernameToIds(guildId, o.Username)
		if err != nil {
			return database.TicketQueryOptions{}, err
		}

		// TODO: Do this better
		if len(userIds) == 0 {
			return database.TicketQueryOptions{}, errors.New("user not found")
		}
	}

	if o.UserId != 0 {
		userIds = append(userIds, o.UserId)
	}

	opts := database.TicketQueryOptions{
		Id:          o.Id,
		GuildId:     guildId,
		UserIds:     userIds,
		Open:        utils.BoolPtr(true), // Only open tickets
		PanelId:     o.PanelId,
		ClaimedById: o.ClaimedById,
		Order:       database.OrderTypeDescending,
	}
	return opts, nil
}

func usernameToIds(guildId uint64, username string) ([]uint64, error) {
	if len(username) > 32 {
		return nil, errors.New("username too long")
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return nil, err
	}

	members, err := botContext.SearchMembers(context.Background(), guildId, username)
	if err != nil {
		return nil, err
	}

	userIds := make([]uint64, len(members)) // capped at 100
	for i, member := range members {
		userIds[i] = member.User.Id
	}

	return userIds, nil
}
