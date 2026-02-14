package api

import (
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

func UpdateIntegrationSecretsHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid integration ID"))
		return
	}

	// Check integration is active
	active, err := dbclient.Client.CustomIntegrationGuilds.IsActive(ctx, integrationId, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update integration. Please try again."))
		return
	}

	if !active {
		ctx.JSON(400, utils.ErrorStr("Integration is not active"))
		return
	}

	var data activateIntegrationBody
	if err := ctx.ShouldBindJSON(&data); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}
	// Check the secret values are valid
	secrets, err := dbclient.Client.CustomIntegrationSecrets.GetByIntegration(ctx, integrationId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if len(secrets) != len(data.Secrets) {
		ctx.JSON(400, utils.ErrorStr("Invalid secret values"))
		return
	}

	// Since we've checked the length, we can just iterate over the secrets and they're guaranteed to be correct
	secretMap := make(map[int]string)
	for secretName, value := range data.Secrets {
		if len(value) == 0 || len(value) > 255 {
			ctx.JSON(400, utils.ErrorStr("Secret values must be between 1 and 255 characters"))
			return
		}

		found := false

	inner:
		for _, secret := range secrets {
			if secret.Name == secretName {
				found = true
				secretMap[secret.Id] = value
				break inner
			}
		}

		if !found {
			ctx.JSON(400, utils.ErrorStr("Invalid secret values"))
			return
		}
	}

	if err := dbclient.Client.CustomIntegrationSecretValues.UpdateAll(ctx, guildId, integrationId, secretMap); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update integration. Please try again."))
		return
	}

	// Log which secrets were updated (names only, not values)
	secretNames := make([]string, 0, len(data.Secrets))
	for name := range data.Secrets {
		secretNames = append(secretNames, name)
	}
	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionGuildIntegrationUpdate,
		ResourceType: dbmodel.AuditResourceGuildIntegration,
		ResourceId:   audit.StringPtr(strconv.Itoa(integrationId)),
		NewData:      map[string]interface{}{"secrets_updated": secretNames},
	})
	ctx.Status(204)
}
