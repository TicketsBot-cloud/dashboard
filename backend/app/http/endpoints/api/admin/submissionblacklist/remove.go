package submissionblacklist

import (
	"net/http"
	"strconv"

	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
)

func RemoveHandler(feature dbmodel.SubmissionFeature) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		authUserId := ctx.Keys["userid"].(uint64)

		targetType, targetId, ok := parseTarget(ctx, feature)
		if !ok {
			return
		}

		if err := database.Client.SubmissionBlacklist.Delete(ctx, feature, targetType, targetId); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete record. Please try again."))
			return
		}

		audit.LogStaff(audit.LogEntry{
			UserId:       authUserId,
			ActionType:   dbmodel.AuditActionSubmissionBlacklistRemove,
			ResourceType: dbmodel.AuditResourceSubmissionBlacklist,
			ResourceId:   audit.StringPtr(auditResourceId(feature, targetType, targetId)),
			OldData: map[string]any{
				"feature":     feature,
				"target_type": targetType,
				"target_id":   strconv.FormatUint(targetId, 10),
			},
		})
		ctx.Status(http.StatusNoContent)
	}
}
