package admin_integrations

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type adminDetailResponse struct {
	Id               int                                     `json:"id"`
	OwnerId          uint64                                  `json:"owner_id"`
	WebhookHost      string                                  `json:"webhook_url"`
	HttpMethod       string                                  `json:"http_method"`
	ValidationUrl    *string                                 `json:"validation_url"`
	Name             string                                  `json:"name"`
	Description      string                                  `json:"description"`
	ImageUrl         *string                                 `json:"image_url"`
	ProxyToken       *string                                 `json:"proxy_token,omitempty"`
	PrivacyPolicyUrl *string                                 `json:"privacy_policy_url"`
	Public           bool                                    `json:"public"`
	Approved         bool                                    `json:"approved"`
	Placeholders     []database.CustomIntegrationPlaceholder `json:"placeholders"`
	Secrets          []database.CustomIntegrationSecret      `json:"secrets"`
	Headers          []database.CustomIntegrationHeader      `json:"headers"`
}

// GetIntegrationDetailHandler handles GET /api/admin/integrations/:integrationid.
func GetIntegrationDetailHandler(ctx *gin.Context) {
	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid integration ID"))
		return
	}

	integration, ok, err := dbclient.Client.CustomIntegrations.Get(ctx, integrationId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch integration"))
		return
	}

	if !ok {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Integration not found"))
		return
	}

	placeholders, err := dbclient.Client.CustomIntegrationPlaceholders.GetByIntegration(ctx, integrationId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch integration placeholders"))
		return
	}

	if placeholders == nil {
		placeholders = make([]database.CustomIntegrationPlaceholder, 0)
	}

	secrets, err := dbclient.Client.CustomIntegrationSecrets.GetByIntegration(ctx, integrationId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch integration secrets"))
		return
	}

	if secrets == nil {
		secrets = make([]database.CustomIntegrationSecret, 0)
	}

	headers, err := dbclient.Client.CustomIntegrationHeaders.GetByIntegration(ctx, integrationId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch integration headers"))
		return
	}

	if headers == nil {
		headers = make([]database.CustomIntegrationHeader, 0)
	}

	var proxyToken *string
	if integration.ImageUrl != nil {
		tmp, err := utils.GenerateImageProxyToken(*integration.ImageUrl)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to generate image proxy token"))
			return
		}

		proxyToken = &tmp
	}

	ctx.JSON(http.StatusOK, adminDetailResponse{
		Id:               integration.Id,
		OwnerId:          integration.OwnerId,
		WebhookHost:      utils.SecondLevelDomain(utils.GetUrlHost(strings.ReplaceAll(integration.WebhookUrl, "%", ""))),
		HttpMethod:       integration.HttpMethod,
		ValidationUrl:    integration.ValidationUrl,
		Name:             integration.Name,
		Description:      integration.Description,
		ImageUrl:         integration.ImageUrl,
		ProxyToken:       proxyToken,
		PrivacyPolicyUrl: integration.PrivacyPolicyUrl,
		Public:           integration.Public,
		Approved:         integration.Approved,
		Placeholders:     placeholders,
		Secrets:          secrets,
		Headers:          headers,
	})
}
