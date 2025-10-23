package botstaff

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
	Id       uint64 `json:"id,string"`
	Username string `json:"username"`
}

func ListBotStaffHandler(ctx *gin.Context) {
	staff, err := database.Client.BotStaff.GetAll(ctx)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	// Get usernames
	group, _ := errgroup.WithContext(context.Background())

	users := make([]userData, len(staff))
	for i, userId := range staff {
		i := i
		userId := userId

		group.Go(func() error {
			data := userData{
				Id: userId,
			}

			user, err := cache.Instance.GetUser(ctx, userId)
			if err == nil {
				data.Username = user.Username
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
