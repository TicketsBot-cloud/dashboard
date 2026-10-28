package middleware

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

var errJSONTooDeep = errors.New("json nesting too deep")

// gdl's Component.UnmarshalJSON re-parses every subtree, so its cost is quadratic in nesting
// depth; an over-deep body must be rejected before it ever reaches that code.
func LimitJSONBody(maxBytes int64, maxDepth int) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxBytes {
			abortBodyTooLarge(c)
			return
		}

		body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxBytes+1))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body. Please check your input and try again."))
			return
		}

		if int64(len(body)) > maxBytes {
			abortBodyTooLarge(c)
			return
		}

		if err := checkJSONDepth(body, maxDepth); err != nil {
			if errors.Is(err, errJSONTooDeep) {
				c.AbortWithStatusJSON(http.StatusBadRequest, utils.ErrorStr("Request is nested too deeply."))
			} else {
				c.AbortWithStatusJSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body: malformed JSON"))
			}
			return
		}

		c.Request.Body = io.NopCloser(bytes.NewReader(body))
		c.Next()
	}
}

func abortBodyTooLarge(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, utils.ErrorStr("Request is too large."))
}

// checkJSONDepth streams tokens rather than unmarshalling, and stops at the first token that
// exceeds maxDepth, so a hostile body costs at most maxDepth+1 levels of work.
func checkJSONDepth(body []byte, maxDepth int) error {
	decoder := json.NewDecoder(bytes.NewReader(body))

	depth := 0
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			if depth != 0 {
				return io.ErrUnexpectedEOF
			}
			return nil
		}
		if err != nil {
			return err
		}

		delim, ok := token.(json.Delim)
		if !ok {
			continue
		}

		switch delim {
		case '{', '[':
			depth++
			if depth > maxDepth {
				return errJSONTooDeep
			}
		case '}', ']':
			depth--
		}
	}
}
