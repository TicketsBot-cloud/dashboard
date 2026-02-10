package middleware

import (
	"errors"
	"fmt"
	"reflect"
	"runtime"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/getsentry/sentry-go"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
)

// SentryError reports errors from c.Errors to Sentry with proper stack traces
// and request context. Must be placed before ErrorHandler in the middleware chain
// so that c.Errors is populated by the time this middleware's deferred logic runs.
func SentryError(ctx *gin.Context) {
	ctx.Next()

	if len(ctx.Errors) == 0 {
		return
	}

	hub := sentrygin.GetHubFromContext(ctx)
	if hub == nil {
		return
	}

	for _, ginErr := range ctx.Errors {
		var apiErr *app.ApiError
		if errors.As(ginErr.Err, &apiErr) {
			reportApiError(hub, ctx, apiErr)
		} else {
			reportGenericError(hub, ctx, ginErr.Err)
		}
	}
}

func reportApiError(hub *sentry.Hub, ctx *gin.Context, apiErr *app.ApiError) {
	innerErr := apiErr.InternalError
	if innerErr == nil {
		return
	}

	event := &sentry.Event{
		Message: fmt.Sprintf("%s %s", ctx.Request.Method, ctx.Request.URL.Path),
		Level:   sentry.LevelError,
		Tags: map[string]string{
			"status_code": fmt.Sprintf("%d", ctx.Writer.Status()),
		},
		Exception: []sentry.Exception{
			{
				Type:       errorTypeName(innerErr),
				Value:      innerErr.Error(),
				Stacktrace: callersToStacktrace(apiErr.Callers),
			},
		},
	}

	hub.CaptureEvent(event)
}

func reportGenericError(hub *sentry.Hub, ctx *gin.Context, err error) {
	event := &sentry.Event{
		Message: fmt.Sprintf("%s %s", ctx.Request.Method, ctx.Request.URL.Path),
		Level:   sentry.LevelError,
		Tags: map[string]string{
			"status_code": fmt.Sprintf("%d", ctx.Writer.Status()),
		},
		Exception: []sentry.Exception{
			{
				Type:  errorTypeName(err),
				Value: err.Error(),
			},
		},
	}

	hub.CaptureEvent(event)
}

func callersToStacktrace(callers []uintptr) *sentry.Stacktrace {
	if len(callers) == 0 {
		return nil
	}

	frames := make([]sentry.Frame, 0, len(callers))
	callersFrames := runtime.CallersFrames(callers)
	for {
		callerFrame, more := callersFrames.Next()

		frames = append(frames, sentry.Frame{
			Function: callerFrame.Function,
			Module:   callerFrame.Function,
			Filename: callerFrame.File,
			Lineno:   callerFrame.Line,
			AbsPath:  callerFrame.File,
			InApp:    true,
		})

		if !more {
			break
		}
	}

	// Sentry expects frames in oldest-first order
	for i, j := 0, len(frames)-1; i < j; i, j = i+1, j-1 {
		frames[i], frames[j] = frames[j], frames[i]
	}

	return &sentry.Stacktrace{Frames: frames}
}

func errorTypeName(err error) string {
	t := reflect.TypeOf(err)
	if t == nil {
		return "error"
	}

	if t.Kind() == reflect.Ptr {
		t = t.Elem()
		if t.PkgPath() != "" {
			return "*" + t.PkgPath() + "." + t.Name()
		}
	}

	if t.PkgPath() != "" {
		return t.PkgPath() + "." + t.Name()
	}

	return t.String()
}
