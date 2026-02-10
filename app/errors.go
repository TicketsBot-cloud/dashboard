package app

import (
	"errors"
	"fmt"
	"runtime"

	"github.com/TicketsBot-cloud/gdl/rest/request"
)

type ApiError struct {
	InternalError   error
	ExternalMessage string
	Callers         []uintptr // Stack at point of creation
}

var _ error = (*ApiError)(nil)

func NewError(internalError error, externalMessage string) *ApiError {
	var pcs [32]uintptr
	// Skip 2 frames: runtime.Callers and NewError
	n := runtime.Callers(2, pcs[:])

	return &ApiError{
		InternalError:   internalError,
		ExternalMessage: externalMessage,
		Callers:         pcs[:n],
	}
}

func NewServerError(internalError error) *ApiError {
	var restError request.RestError
	if errors.As(internalError, &restError) {
		apiErr := NewError(internalError, restError.Error())
		// Recapture stack to skip NewServerError frame
		var pcs [32]uintptr
		n := runtime.Callers(2, pcs[:])
		apiErr.Callers = pcs[:n]
		return apiErr
	}

	apiErr := NewError(internalError, "An internal server error occurred")
	// Recapture stack to skip NewServerError frame
	var pcs [32]uintptr
	n := runtime.Callers(2, pcs[:])
	apiErr.Callers = pcs[:n]
	return apiErr
}

func (e *ApiError) Error() string {
	var restError request.RestError
	if errors.As(e.InternalError, &restError) {
		return fmt.Sprintf("internal error: %v, external message: %s, rest error: Discord returned HTTP %d: %s",
			e.InternalError, e.ExternalMessage, restError.StatusCode, restError.ApiError.Message)
	} else {
		return fmt.Sprintf("internal error: %v, external message: %s", e.InternalError, e.ExternalMessage)
	}
}

func (e *ApiError) Unwrap() error {
	return e.InternalError
}
