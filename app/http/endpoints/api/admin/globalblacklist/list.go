package globalblacklist

import (
	"context"
	"errors"

	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

type userData struct {
	Id        uint64 `json:"id,string"`
	Username  string `json:"username"`
	AvatarUrl string `json:"avatar_url,omitempty"`
}

func ListHandler(ctx *gin.Context) {
	userIds, err := database.Client.GlobalBlacklist.ListAll(ctx)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	group, _ := errgroup.WithContext(context.Background())

	users := make([]userData, len(userIds))
	for i, userId := range userIds {
		i := i
		userId := userId

		group.Go(func() error {
			data := userData{
				Id: userId,
			}

			user, err := cache.Instance.GetUser(ctx, userId)
			if err == nil {
				data.Username = user.Username
				data.AvatarUrl = user.AvatarUrl(256)
			} else if errors.Is(err, cache2.ErrNotFound) {
				data.Username = "Unknown User"
			} else {
				return err
			}

			users[i] = data

			return nil
		})
	}

	if err := group.Wait(); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	ctx.JSON(200, users)
}
