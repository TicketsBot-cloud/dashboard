package utils

import (
	"fmt"

	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func ErrorJson(err error) map[string]any {
	log.Logger.Error("An error occurred", zap.Error(err))
	return ErrorStr(err.Error())
}

func ErrorStr(err string, format ...any) map[string]any {
	return gin.H{
		"success": false,
		"error":   fmt.Sprintf(err, format...),
	}
}

var SuccessResponse = gin.H{
	"success": true,
}
