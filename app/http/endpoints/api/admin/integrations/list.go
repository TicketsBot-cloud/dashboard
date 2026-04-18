package admin_integrations

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

var allowedStatuses = map[string]struct{}{
	"pending":  {},
	"approved": {},
	"rejected": {},
}

const (
	defaultPage  = 1
	defaultLimit = 25
	maxLimit     = 100
)

// ListIntegrationsHandler handles GET /api/admin/integrations.
// Returns a paginated list of custom integrations filtered by review status.
func ListIntegrationsHandler(ctx *gin.Context) {
	status := ctx.Query("status")
	if status == "" {
		status = "pending"
	}

	if _, ok := allowedStatuses[status]; !ok {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid status filter. Must be one of: pending, approved, rejected"))
		return
	}

	page := parsePositiveInt(ctx.Query("page"), defaultPage)
	limit := parsePositiveInt(ctx.Query("limit"), defaultLimit)
	if limit > maxLimit {
		limit = maxLimit
	}

	offset := (page - 1) * limit

	var (
		integrations []database.CustomIntegrationWithGuildCount
		err          error
	)

	switch status {
	case "pending":
		integrations, err = dbclient.Client.CustomIntegrations.GetPendingReview(ctx, limit, offset)
	case "approved":
		integrations, err = dbclient.Client.CustomIntegrations.GetApproved(ctx, limit, offset)
	case "rejected":
		integrations, err = dbclient.Client.CustomIntegrations.GetRejected(ctx, limit, offset)
	}

	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch integrations"))
		return
	}

	total, err := dbclient.Client.CustomIntegrations.CountByStatus(ctx, status)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to count integrations"))
		return
	}

	if integrations == nil {
		integrations = make([]database.CustomIntegrationWithGuildCount, 0)
	}

	ctx.Header("Cache-Control", "no-store")
	ctx.JSON(http.StatusOK, gin.H{
		"integrations": integrations,
		"total":        total,
		"page":         page,
		"limit":        limit,
	})
}

func parsePositiveInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}
