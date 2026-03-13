package middleware

import (
	"net/http"
	"strings"

	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/gin-gonic/gin"
)

func Cors(config config.Config) func(*gin.Context) {
	methods := []string{http.MethodOptions, http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete}
	headers := []string{"x-tickets", "Content-Type", "Authorization", "X-CSRF-Token"}

	return func(ctx *gin.Context) {
		ctx.Header("Access-Control-Allow-Origin", config.Server.BaseUrl)
		ctx.Header("Access-Control-Allow-Methods", strings.Join(methods, ", "))
		ctx.Header("Access-Control-Allow-Headers", strings.Join(headers, ", "))
		ctx.Header("Access-Control-Allow-Credentials", "true")
		ctx.Header("Access-Control-Max-Age", "600")

		if ctx.Request.Method == http.MethodOptions {
			ctx.AbortWithStatus(http.StatusNoContent)
		}
	}
}
