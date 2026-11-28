package middleware

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"

	"github.com/TicketsBot-cloud/common/observability"
	"github.com/getsentry/sentry-go"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"go.uber.org/zap"
)

// Internal errors stay server-side; ErrorId is the Sentry event a user can quote to support.
type ErrorResponse struct {
	Error   string `json:"error"`
	ErrorId string `json:"error_id,omitempty"`
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

		err := c.Errors[0].Err

		var apiError *app.ApiError
		if errors.As(err, &apiError) {
			message = apiError.ExternalMessage
		} else {
			message = "An error occurred processing your request"
		}

		var errorId string
		if isServerFault(status) {
			errorId = logFailure(c, status, "error", err.Error())
		}

		c.Writer = cw.ResponseWriter
		c.JSON(-1, ErrorResponse{
			Error:   message,
			ErrorId: errorId,
		})

		return
	}

	if isServerFault(status) {
		// The handler discarded its own error, so the body is the only trace left.
		errorId := logFailure(c, status, "response", cw.buf.String())

		c.Writer = cw.ResponseWriter

		c.JSON(-1, ErrorResponse{
			Error:   "An internal server error occurred",
			ErrorId: errorId,
		})

		return
	}

	cw.ResponseWriter.Write(cw.buf.Bytes())
}

// Keyed on the route, not the path, so one fault is not one Sentry issue per guild.
func logFailure(c *gin.Context, status int, causeKey, cause string) string {
	route := c.FullPath()
	if route == "" {
		route = c.Request.URL.Path
	}

	message := fmt.Sprintf("%s %s failed", c.Request.Method, route)

	extra := map[string]any{
		"method": c.Request.Method,
		"route":  route,
		"path":   c.Request.URL.Path,
		"status": status,
		causeKey: cause,
	}

	fields := []zap.Field{
		zap.String("method", c.Request.Method),
		zap.String("route", route),
		zap.String("path", c.Request.URL.Path),
		zap.Int("status", status),
		zap.String(causeKey, cause),
	}

	if guildId, ok := c.Keys["guildid"]; ok {
		extra["guild_id"] = guildId.(uint64)
		fields = append(fields, zap.Uint64("guild_id", guildId.(uint64)))
	}

	if userId, ok := c.Keys["userid"]; ok {
		extra["user_id"] = userId.(uint64)
		fields = append(fields, zap.Uint64("user_id", userId.(uint64)))
	}

	// Mirrors zapsentry's exception value so existing Sentry issues keep grouping.
	value := message
	if causeKey == "error" {
		value = fmt.Sprintf("%s: %s", message, cause)
	}

	// The request hub returns the event ID; gated on JsonLogs like zapsentry in main.go.
	if hub := sentrygin.GetHubFromContext(c); hub != nil && config.Conf.JsonLogs {
		id := hub.CaptureEvent(&sentry.Event{
			Environment: observability.EnvironmentProduction.String(),
			Level:       sentry.LevelError,
			Message:     message,
			Extra:       extra,
			Exception:   []sentry.Exception{{Type: "error", Value: value}},
		})

		if id != nil {
			// Warn, not Error: zapsentry would report it a second time.
			log.Logger.Warn(message, append(fields, zap.String("sentry_event_id", string(*id)))...)
			return string(*id)
		}
	}

	log.Logger.Error(message, fields...)
	return ""
}
