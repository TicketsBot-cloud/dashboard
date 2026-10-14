package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func nestedArrays(depth int) string {
	return strings.Repeat("[", depth) + strings.Repeat("]", depth)
}

func TestLimitJSONBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const maxBytes = 256 * 1024
	const maxDepth = 16

	padded := func(size int) string {
		overhead := len(`{"a":""}`)
		return `{"a":"` + strings.Repeat("x", size-overhead) + `"}`
	}

	tests := []struct {
		name        string
		body        string
		wantStatus  int
		wantReached bool
	}{
		{name: "small valid object", body: `{"a":1}`, wantStatus: http.StatusOK, wantReached: true},
		{name: "empty array", body: `[]`, wantStatus: http.StatusOK, wantReached: true},
		{name: "exactly at the size limit", body: padded(maxBytes), wantStatus: http.StatusOK, wantReached: true},
		{name: "one byte over the size limit", body: padded(maxBytes + 1), wantStatus: http.StatusRequestEntityTooLarge},
		{name: "depth exactly the limit", body: nestedArrays(maxDepth), wantStatus: http.StatusOK, wantReached: true},
		{name: "depth one over the limit", body: nestedArrays(maxDepth + 1), wantStatus: http.StatusBadRequest},
		{name: "mixed object and array depth at limit", body: strings.Repeat(`{"a":[`, maxDepth/2) + strings.Repeat(`]}`, maxDepth/2), wantStatus: http.StatusOK, wantReached: true},
		{name: "5000 deep", body: nestedArrays(5000), wantStatus: http.StatusBadRequest},
		{name: "5000 deep unterminated", body: strings.Repeat("[", 5000), wantStatus: http.StatusBadRequest},
		{name: "invalid JSON", body: `{"a":`, wantStatus: http.StatusBadRequest},
		{name: "garbage", body: `not json`, wantStatus: http.StatusBadRequest},
		{name: "brackets inside strings do not count", body: `{"a":"` + strings.Repeat("[", 100) + `"}`, wantStatus: http.StatusOK, wantReached: true},
		{name: "empty body", body: ``, wantStatus: http.StatusOK, wantReached: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var reached bool
			var seen string

			router := gin.New()
			router.POST("/", LimitJSONBody(maxBytes, maxDepth), func(c *gin.Context) {
				reached = true
				buf := new(bytes.Buffer)
				_, _ = buf.ReadFrom(c.Request.Body)
				seen = buf.String()
				c.Status(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tt.body))
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			require.Equal(t, tt.wantStatus, rec.Code)
			require.Equal(t, tt.wantReached, reached)
			if tt.wantReached {
				require.Equal(t, tt.body, seen, "the handler must receive the body unchanged")
			}
		})
	}
}

func TestLimitJSONBody_DeclaredContentLengthOverLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.POST("/", LimitJSONBody(10, 16), func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"a":"0123456789"}`))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}
