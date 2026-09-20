package middleware

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"go.uber.org/zap"
)

type ErrorResponse struct {
	Error         string  `json:"error"`
	InternalError *string `json:"internal_error,omitempty"`
}

type copyWriter struct {
	gin.ResponseWriter
	buf *bytes.Buffer
}

func (cw copyWriter) Write(b []byte) (int, error) {
	return cw.buf.Write(b)
}

// Every 503 here is a feature flag holding a subsystem closed, not a fault.
func isServerFault(status int) bool {
	return status >= 500 && status != http.StatusServiceUnavailable
}

func ErrorHandler(c *gin.Context) {
	cw := &copyWriter{buf: &bytes.Buffer{}, ResponseWriter: c.Writer}
	c.Writer = cw

	c.Next()

	status := c.Writer.Status()

	if len(c.Errors) > 0 {
		var message string
		var internalError *string

		err := c.Errors[0].Err

		var apiError *app.ApiError
		if errors.As(err, &apiError) {
			message = apiError.ExternalMessage
			if apiError.InternalError != nil {
				errStr := apiError.InternalError.Error()
				internalError = &errStr
			}
		} else {
			message = "An error occurred processing your request"
		}

		if isServerFault(status) {
			logFailure(c, status, zap.Error(err))
		}

		c.Writer = cw.ResponseWriter
		c.JSON(-1, ErrorResponse{
			Error:         message,
			InternalError: internalError,
		})

		return
	}

	if isServerFault(status) {
		// The handler discarded its own error, so the body is the only trace left.
		logFailure(c, status, zap.String("response", cw.buf.String()))

		c.Writer = cw.ResponseWriter

		c.JSON(-1, ErrorResponse{
			Error: "An internal server error occurred",
		})

		return
	}

	cw.ResponseWriter.Write(cw.buf.Bytes())
}

// Keyed on the route, not the path, so one fault is not one Sentry issue per guild.
func logFailure(c *gin.Context, status int, cause zap.Field) {
	route := c.FullPath()
	if route == "" {
		route = c.Request.URL.Path
	}

	fields := []zap.Field{
		zap.String("method", c.Request.Method),
		zap.String("route", route),
		zap.String("path", c.Request.URL.Path),
		zap.Int("status", status),
	}

	if guildId, ok := c.Keys["guildid"]; ok {
		fields = append(fields, zap.Uint64("guild_id", guildId.(uint64)))
	}

	if userId, ok := c.Keys["userid"]; ok {
		fields = append(fields, zap.Uint64("user_id", userId.(uint64)))
	}

	log.Logger.Error(fmt.Sprintf("%s %s failed", c.Request.Method, route), append(fields, cause)...)
}
