package admin_integrations

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// ApproveIntegrationHandler handles POST /api/admin/integrations/:integrationid/approve.
func ApproveIntegrationHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

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

	oldData := map[string]any{
		"public":           integration.Public,
		"approved":         integration.Approved,
		"rejection_reason": integration.RejectionReason,
	}

	if err := dbclient.Client.CustomIntegrations.Approve(ctx, integrationId, userId); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to approve integration"))
		return
	}

	postReviewWebhookBestEffort(ctx, "Integration approved", colourApproved, integration, userId, nil)

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionUserIntegrationApprove,
		ResourceType: database.AuditResourceUserIntegration,
		ResourceId:   audit.StringPtr(strconv.Itoa(integrationId)),
		OldData:      oldData,
		NewData: map[string]any{
			"public":           true,
			"approved":         true,
			"rejection_reason": nil,
		},
	})

	ctx.Status(http.StatusNoContent)
}
