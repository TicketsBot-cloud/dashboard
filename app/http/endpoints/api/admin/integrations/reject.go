package admin_integrations

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type rejectBody struct {
	Reason string `json:"reason"`
}

// RejectIntegrationHandler handles POST /api/admin/integrations/:integrationid/reject.
func RejectIntegrationHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid integration ID"))
		return
	}

	var body rejectBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
		return
	}

	if len(body.Reason) > 4*500 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Rejection reason must be 500 characters or fewer"))
		return
	}

	reason := strings.TrimSpace(body.Reason)
	if len(reason) == 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("A rejection reason is required"))
		return
	}

	if utf8.RuneCountInString(reason) > 500 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Rejection reason must be 500 characters or fewer"))
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

	if err := dbclient.Client.CustomIntegrations.Reject(ctx, integrationId, userId, reason); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to reject integration"))
		return
	}

	postReviewWebhookBestEffort(ctx, "Integration rejected", colourRejected, integration, userId, &reason)

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionUserIntegrationReject,
		ResourceType: database.AuditResourceUserIntegration,
		ResourceId:   audit.StringPtr(strconv.Itoa(integrationId)),
		OldData:      oldData,
		NewData: map[string]any{
			"public":           false,
			"approved":         false,
			"rejection_reason": reason,
		},
	})

	ctx.Status(http.StatusNoContent)
}
