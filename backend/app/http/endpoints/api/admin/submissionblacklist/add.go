package submissionblacklist

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

type addBody struct {
	Reason *string `json:"reason"`
}

func AddHandler(feature dbmodel.SubmissionFeature) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		authUserId := ctx.Keys["userid"].(uint64)

		targetType, targetId, ok := parseTarget(ctx, feature)
		if !ok {
			return
		}

		var body addBody
		_ = ctx.ShouldBindJSON(&body)

		var reason *string
		if body.Reason != nil {
			if trimmed := strings.TrimSpace(*body.Reason); trimmed != "" {
				reason = &trimmed
			}
		}

		if err := database.Client.SubmissionBlacklist.Add(ctx, feature, targetType, targetId, reason); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request. Please try again."))
			return
		}

		audit.LogStaff(audit.LogEntry{
			UserId:       authUserId,
			ActionType:   dbmodel.AuditActionSubmissionBlacklistAdd,
			ResourceType: dbmodel.AuditResourceSubmissionBlacklist,
			ResourceId:   audit.StringPtr(auditResourceId(feature, targetType, targetId)),
			NewData: map[string]any{
				"feature":     feature,
				"target_type": targetType,
				"target_id":   strconv.FormatUint(targetId, 10),
				"reason":      reason,
			},
		})
		ctx.Status(http.StatusNoContent)
	}
}

func parseTarget(ctx *gin.Context, feature dbmodel.SubmissionFeature) (dbmodel.SubmissionTargetType, uint64, bool) {
	targetType := dbmodel.SubmissionTargetType(ctx.Param("type"))
	if !feature.AllowsTarget(targetType) {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid target type"))
		return "", 0, false
	}

	// int8 column: an ID above MaxInt64 must be a 400, not a pgx 500
	targetId, err := strconv.ParseInt(ctx.Param("targetid"), 10, 64)
	if err != nil || targetId <= 0 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid target ID"))
		return "", 0, false
	}

	return targetType, uint64(targetId), true
}

func auditResourceId(feature dbmodel.SubmissionFeature, targetType dbmodel.SubmissionTargetType, targetId uint64) string {
	return fmt.Sprintf("%s:%s:%d", feature, targetType, targetId)
}
