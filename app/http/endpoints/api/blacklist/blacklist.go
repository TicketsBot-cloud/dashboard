package api

import (
	"context"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/dashboard/utils/types"
	"github.com/gin-gonic/gin"
)

type (
	response struct {
		PageLimit int                     `json:"page_limit"`
		Users     []blacklistedUser       `json:"users"`
		Roles     types.UInt64StringSlice `json:"roles"`
	}

	blacklistedUser struct {
		UserId   uint64 `json:"id,string"`
		Username string `json:"username"`
	}
)

const pageLimit = 30

// TODO: Paginate
func GetBlacklistHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	page, err := strconv.Atoi(ctx.Query("page"))
	if err != nil || page < 1 {
		page = 1
	}

	offset := pageLimit * (page - 1)

	blacklistedUsers, err := database.Client.Blacklist.GetBlacklistedUsers(ctx, guildId, pageLimit, offset)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load blacklist. Please try again."))
		return
	}

	// TODO: Use proper context
	userObjects, err := cache.Instance.GetUsers(context.Background(), blacklistedUsers)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load blacklist. Please try again."))
		return
	}

	// Build struct with user_id, name and discriminator
	users := make([]blacklistedUser, len(blacklistedUsers))
	for i, userId := range blacklistedUsers {
		userData := blacklistedUser{
			UserId: userId,
		}

		user, ok := userObjects[userId]
		if ok {
			userData.Username = user.Username
		}

		users[i] = userData
	}

	blacklistedRoles, err := database.Client.RoleBlacklist.GetBlacklistedRoles(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to load blacklist. Please try again."))
		return
	}

	ctx.JSON(200, response{
		PageLimit: pageLimit,
		Users:     users,
		Roles:     blacklistedRoles,
	})
}
