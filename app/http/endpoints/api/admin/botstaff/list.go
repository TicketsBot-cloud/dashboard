package botstaff

import (
	"context"
	"errors"

	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/internal/admin"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

type userData struct {
	Id         uint64          `json:"id,string"`
	Username   string          `json:"username"`
	AvatarUrl  string          `json:"avatar_url,omitempty"`
	Tier       admin.AdminTier `json:"tier"`
	GlobalView bool            `json:"global_view"`
}

func ListBotStaffHandler(ctx *gin.Context) {
	staff, err := database.Client.BotStaff.GetAll(ctx)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	users := make([]userData, 0, len(staff)+1)
	ownerListed := false

	for _, entry := range staff {
		data := userData{
			Id:         entry.UserId,
			Tier:       admin.AdminTier(entry.Tier),
			GlobalView: entry.GlobalView,
		}

		// Owner access comes from config, so a stored row understates it
		if admin.IsBotOwner(entry.UserId) {
			data.Tier = admin.AdminTierOwner
			data.GlobalView = true
			ownerListed = true
		}

		users = append(users, data)
	}

	if config.Conf.Owner != 0 && !ownerListed {
		users = append(users, userData{
			Id:         config.Conf.Owner,
			Tier:       admin.AdminTierOwner,
			GlobalView: true,
		})
	}

	// Get usernames
	group, _ := errgroup.WithContext(context.Background())

	for i := range users {
		i := i

		group.Go(func() error {
			user, err := cache.Instance.GetUser(ctx, users[i].Id)
			if err == nil {
				users[i].Username = user.Username
				users[i].AvatarUrl = user.AvatarUrl(256)
			} else if errors.Is(err, cache2.ErrNotFound) {
				users[i].Username = "Unknown User"
			} else {
				return err
			}

			return nil
		})
	}

	if err := group.Wait(); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	ctx.JSON(200, users)
}
