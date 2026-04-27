package middleware

import (
	"bytes"
	"github.com/gin-gonic/gin"
	"io"
)

func MultiReadBody(ctx *gin.Context) {
	body, _ := io.ReadAll(ctx.Request.Body)
	ctx.Request.Body = io.NopCloser(bytes.NewBuffer(body))
}
