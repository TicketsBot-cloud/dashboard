package admin_integrations

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/notify"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type unapproveBody struct {
	Reason string `json:"reason"`
}

// UnapproveIntegrationHandler handles POST /api/admin/integrations/:integrationid/unapprove.
// Moves a previously approved integration back to the pending state.
func UnapproveIntegrationHandler(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	integrationId, err := strconv.Atoi(ctx.Param("integrationid"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid integration ID"))
		return
	}

	var body unapproveBody
	if ctx.Request.ContentLength > 0 {
		if err := ctx.ShouldBindJSON(&body); err != nil {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
			return
		}
	}

	if len(body.Reason) > 4*500 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Reason must be 500 characters or fewer"))
		return
	}

	reason := strings.TrimSpace(body.Reason)
	if utf8.RuneCountInString(reason) > 500 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Reason must be 500 characters or fewer"))
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

	if !integration.Approved {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Integration is not currently approved"))
		return
	}

	oldData := map[string]any{
		"public":           integration.Public,
		"approved":         integration.Approved,
		"rejection_reason": integration.RejectionReason,
	}

	if err := dbclient.Client.CustomIntegrations.Unapprove(ctx, integrationId, userId); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to unapprove integration"))
		return
	}

	var webhookReason *string
	if reason != "" {
		webhookReason = &reason
	}
	postReviewWebhookBestEffort(ctx, "Integration unapproved", colourUnapproved, integration, userId, webhookReason)

	dmBody := fmt.Sprintf("Your integration **%s** has been unapproved and is no longer publicly available.", integration.Name)
	if reason != "" {
		dmBody += fmt.Sprintf("\n\n**Reason:** %s", reason)
	}
	go notify.Send(
		context.Background(),
		integration.OwnerId,
		notify.CategoryIntegrations,
		"Integration unapproved",
		dmBody,
		"",
	)

	newData := map[string]any{
		"public":           false,
		"approved":         false,
		"rejection_reason": nil,
	}
	if reason != "" {
		newData["reason"] = reason
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionUserIntegrationUnapprove,
		ResourceType: database.AuditResourceUserIntegration,
		ResourceId:   audit.StringPtr(strconv.Itoa(integrationId)),
		OldData:      oldData,
		NewData:      newData,
	})

	ctx.Status(http.StatusNoContent)
}
