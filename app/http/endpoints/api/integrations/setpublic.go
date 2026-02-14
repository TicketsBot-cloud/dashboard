package api

import (
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/gin-gonic/gin"
)

func SetIntegrationPublicHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid integration ID"))
		return
	}

	integration, ok, err := dbclient.Client.CustomIntegrations.Get(ctx, integrationId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if !ok {
		ctx.JSON(404, utils.ErrorStr("Integration not found"))
		return
	}

	if integration.OwnerId != userId {
		ctx.JSON(403, utils.ErrorStr("You do not have permission to manage this integration"))
		return
	}

	if integration.Public {
		ctx.JSON(400, utils.ErrorStr("You have already requested to make this integration public"))
		return
	}

	e := embed.NewEmbed().
		SetTitle("Public Integration Request").
		SetColor(0xfcb97d).
		AddField("Integration ID", strconv.Itoa(integration.Id), true).
		AddField("Integration Name", integration.Name, true).
		AddField("Integration URL", fmt.Sprintf("`%s`", integration.WebhookUrl), true).
		AddField("Integration Owner", fmt.Sprintf("<@%d>", integration.OwnerId), true).
		AddField("Integration Description", integration.Description, false)

	botCtx := botcontext.PublicContext()

	// TODO: Use proper context
	_, err = rest.ExecuteWebhook(
		ctx,
		config.Conf.Bot.PublicIntegrationRequestWebhookToken,
		botCtx.RateLimiter,
		config.Conf.Bot.PublicIntegrationRequestWebhookId,
		true,
		rest.WebhookBody{
			Embeds: utils.Slice(e),
		},
	)

	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	if err := dbclient.Client.CustomIntegrations.SetPublic(ctx, integration.Id); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   dbmodel.AuditActionUserIntegrationSetPublic,
		ResourceType: dbmodel.AuditResourceUserIntegration,
		ResourceId:   audit.StringPtr(strconv.Itoa(integration.Id)),
	})
	ctx.Status(204)
}
