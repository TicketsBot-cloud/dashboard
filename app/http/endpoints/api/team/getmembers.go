package api

import (
	"context"
	"fmt"
	"sort"
	"strconv"

	syncutils "github.com/TicketsBot-cloud/common/utils"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/gdl/objects/user"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

func GetMembers(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	teamId := ctx.Param("teamid")
	if teamId == "default" {
		getDefaultMembers(ctx, guildId)
	} else {
		parsed, err := strconv.Atoi(teamId)
		if err != nil {
			ctx.JSON(400, utils.ErrorStr(fmt.Sprintf("Invalid team ID provided: %s", ctx.Param("id"))))
			return
		}

		getTeamMembers(ctx, parsed, guildId)
	}
}

func getDefaultMembers(ctx *gin.Context, guildId uint64) {
	group, _ := errgroup.WithContext(context.Background())

	// get IDs of support users & roles
	var userIds []uint64
	group.Go(func() (err error) {
		userIds, err = dbclient.Client.Permissions.GetSupport(ctx, guildId)
		return
	})

	var roleIds []uint64
	group.Go(func() (err error) {
		roleIds, err = dbclient.Client.RolePermissions.GetSupportRoles(ctx, guildId)
		return
	})

	if err := group.Wait(); err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load teams. Please try again."))
		return
	}

	data, err := formatMembers(guildId, userIds, roleIds)
	if err == nil {
		ctx.JSON(200, data)
	} else {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load teams. Please try again."))
	}
}

func getTeamMembers(ctx *gin.Context, teamId int, guildId uint64) {
	// Verify team exists
	exists, err := dbclient.Client.SupportTeam.Exists(ctx, teamId, guildId)
	if err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load teams. Please try again."))
		return
	}

	if !exists {
		ctx.JSON(404, utils.ErrorStr("Support team with provided ID not found"))
		return
	}

	group, _ := errgroup.WithContext(context.Background())

	// get IDs of support users & roles
	var userIds []uint64
	group.Go(func() (err error) {
		userIds, err = dbclient.Client.SupportTeamMembers.Get(ctx, teamId)
		return
	})

	var roleIds []uint64
	group.Go(func() (err error) {
		roleIds, err = dbclient.Client.SupportTeamRoles.Get(ctx, teamId)
		return
	})

	if err := group.Wait(); err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load teams. Please try again."))
		return
	}

	data, err := formatMembers(guildId, userIds, roleIds)
	if err == nil {
		ctx.JSON(200, data)
	} else {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to load teams. Please try again."))
	}
}

func formatMembers(guildId uint64, userIds, roleIds []uint64) ([]entity, error) {
	ctx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		return nil, err
	}

	// map role ids to names
	data := make([]entity, 0)
	for _, roleId := range roleIds {
		data = append(data, entity{
			Id:   roleId,
			Type: entityTypeRole,
		})
	}

	// map user ids to names & discrims
	group, _ := errgroup.WithContext(context.Background())

	users := make(chan user.User)
	wg := syncutils.NewChannelWaitGroup()
	wg.Add(len(userIds))

	for _, userId := range userIds {
		userId := userId

		group.Go(func() error {
			defer wg.Done()

			// TODO: Use proper context
			user, err := ctx.GetUser(context.Background(), userId)
			if err != nil {
				// TODO: Log w sentry
				return nil // We should skip the error, since it's probably 403 / 404 etc
			}

			users <- user
			return nil
		})
	}

	group.Go(func() error {
	loop:
		for {
			select {
			case <-wg.Wait():
				break loop
			case user := <-users:
				data = append(data, entity{
					Id:   user.Id,
					Name: fmt.Sprintf("%s", user.Username),
					Type: entityTypeUser,
				})
			}
		}
		return nil
	})

	if err := group.Wait(); err != nil {
		return nil, err
	}

	// sort
	sort.Slice(data, func(i, j int) bool {
		if data[i].Type == data[j].Type {
			return data[i].Id < data[j].Id
		} else {
			return data[i].Type > data[j].Type
		}
	})

	return data, nil
}
