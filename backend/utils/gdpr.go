package utils

import (
	"net/http"

	"github.com/TicketsBot-cloud/common/gdprrelay"
	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
)

var ExportS3 *minio.Client

func RequireGdprWorker(ctx *gin.Context) bool {
	if gdprrelay.IsWorkerAlive(redis.Client.Client) {
		return true
	}

	ctx.JSON(http.StatusServiceUnavailable, gin.H{
		"success":        false,
		"error":          "The GDPR processing service is currently unavailable. Please try again later.",
		"worker_offline": true,
	})
	return false
}
