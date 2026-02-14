package api

import (
	"context"

	"github.com/TicketsBot-cloud/common/permission"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

type (
	blacklistAddResponse struct {
		Success  bool   `json:"success"`
		Resolved bool   `json:"resolved"`
		Id       uint64 `json:"id,string"`
		Username string `json:"username"`
	}

	blacklistAddBody struct {
		EntityType entityType `json:"entity_type"`
		Snowflake  uint64     `json:"snowflake,string"`
	}

	entityType int
)

const (
	entityTypeUser entityType = iota
	entityTypeRole
)

func AddBlacklistHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body blacklistAddBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	switch body.EntityType {
	case entityTypeUser:
		// Max of 250 blacklisted users
		count, err := database.Client.Blacklist.GetBlacklistedCount(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Invalid request data. Please check your input and try again."))
			return
		}

		if count >= 250 {
			ctx.JSON(400, utils.ErrorStr("Blacklist limit (250) reached: consider using a role instead"))
			return
		}

		// TODO: Use proper context
		permLevel, err := utils.GetPermissionLevel(context.Background(), guildId, body.Snowflake)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to load blacklist. Please try again."))
			return
		}

		if permLevel > permission.Everyone {
			ctx.JSON(400, utils.ErrorStr("You cannot blacklist staff members!"))
			return
		}

		if err := database.Client.Blacklist.Add(ctx, guildId, body.Snowflake); err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to load blacklist. Please try again."))
			return
		}

		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   dbmodel.AuditActionBlacklistAdd,
			ResourceType: dbmodel.AuditResourceBlacklist,
			NewData:      map[string]any{"entity_type": "user", "snowflake": body.Snowflake},
		})

		// Resolve user
		// TODO: Use proper context
		user, err := cache.Instance.GetUser(context.Background(), body.Snowflake)
		if err != nil {
			if errors.Is(err, cache2.ErrNotFound) {
				ctx.JSON(200, blacklistAddResponse{
					Success:  true,
					Resolved: false,
					Id:       body.Snowflake,
				})
				return
			} else {
				ctx.JSON(500, utils.ErrorStr("Failed to load blacklist. Please try again."))
				return
			}
		}

		ctx.JSON(200, blacklistAddResponse{
			Success:  true,
			Resolved: true,
			Id:       body.Snowflake,
			Username: user.Username,
		})
	case entityTypeRole:
		// Max of 50 blacklisted roles
		count, err := database.Client.RoleBlacklist.GetBlacklistedCount(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to load blacklist. Please try again."))
			return
		}

		if count >= 50 {
			ctx.JSON(400, utils.ErrorStr("Blacklist limit (50) reached"))
			return
		}

		if err := database.Client.RoleBlacklist.Add(ctx, guildId, body.Snowflake); err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to load blacklist. Please try again."))
			return
		}

		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   dbmodel.AuditActionBlacklistAdd,
			ResourceType: dbmodel.AuditResourceBlacklist,
			NewData:      map[string]any{"entity_type": "role", "snowflake": body.Snowflake},
		})

		ctx.JSON(200, blacklistAddResponse{
			Success: true,
			Id:      body.Snowflake,
		})
	default:
		ctx.JSON(400, utils.ErrorStr("Invalid entity type"))
		return
	}
}
