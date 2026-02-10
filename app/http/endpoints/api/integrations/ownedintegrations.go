package api

import (
	"context"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

type integrationWithCount struct {
	integrationResponse
	GuildCount int `json:"guild_count"`
}

func GetOwnedIntegrationsHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	group, _ := errgroup.WithContext(context.Background())

	var integrations []database.CustomIntegrationWithGuildCount
	var placeholders map[int][]database.CustomIntegrationPlaceholder

	// Retrieve integrations
	group.Go(func() (err error) {
		integrations, err = dbclient.Client.CustomIntegrations.GetAllOwned(ctx, userId)
		return
	})

	// Retrieve placeholders
	group.Go(func() (err error) {
		placeholders, err = dbclient.Client.CustomIntegrationPlaceholders.GetAllForOwnedIntegrations(ctx, userId)
		return
	})

	if err := group.Wait(); err != nil {
		_ = ctx.AbortWithError(500, app.NewError(err, "Failed to process request. Please try again."))
		return
	}

	res := make([]integrationWithCount, len(integrations))
	for i, integration := range integrations {
		var proxyToken *string
		if integration.ImageUrl != nil {
			tmp, err := utils.GenerateImageProxyToken(*integration.ImageUrl)
			if err != nil {
				_ = ctx.AbortWithError(500, app.NewError(err, "Failed to process request. Please try again."))
				return
			}

			proxyToken = &tmp
		}

		res[i] = integrationWithCount{
			integrationResponse: integrationResponse{
				Id:               integration.Id,
				OwnerId:          integration.OwnerId,
				WebhookHost:      utils.SecondLevelDomain(utils.GetUrlHost(strings.ReplaceAll(integration.WebhookUrl, "%", ""))),
				Name:             integration.Name,
				Description:      integration.Description,
				ImageUrl:         integration.ImageUrl,
				ProxyToken:       proxyToken,
				PrivacyPolicyUrl: integration.PrivacyPolicyUrl,
				Public:           integration.Public,
				Approved:         integration.Approved,
				Placeholders:     placeholders[integration.Id],
			},
			GuildCount: integration.GuildCount,
		}
	}

	ctx.JSON(200, res)
}
