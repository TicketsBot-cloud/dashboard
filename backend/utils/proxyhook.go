package utils

import (
	"net/http"
	"strings"

	"github.com/ticketsbot-cloud/dashboard/backend/config"
)

// Twilight's HTTP proxy doesn't support the typical HTTP proxy protocol - instead you send the request directly
// to the proxy's host in the URL. This is not how Go's proxy function should be used, but it works :)
func ProxyHook(token string, req *http.Request) {
	if !strings.HasPrefix(req.Header.Get("Authorization"), "Basic") {
		req.URL.Scheme = "http"
		req.URL.Host = config.Conf.Bot.ProxyUrl
	}
}
