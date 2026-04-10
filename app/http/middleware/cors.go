package middleware

import (
	"net/http"
	"strings"
	"sync"

	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/gin-gonic/gin"
)

// verifiedDomains holds a cached set of verified custom KB domains.
// Updated via RefreshVerifiedDomains when a domain is verified or removed.
var (
	verifiedDomainsMu sync.RWMutex
	verifiedDomains   = make(map[string]struct{})
)

// RefreshVerifiedDomains replaces the cached set of verified custom domains.
// Call this after a domain is verified or a custom domain is changed/removed.
func RefreshVerifiedDomains(domains []string) {
	verifiedDomainsMu.Lock()
	defer verifiedDomainsMu.Unlock()

	verifiedDomains = make(map[string]struct{}, len(domains))
	for _, d := range domains {
		verifiedDomains[d] = struct{}{}
	}
}

func isVerifiedDomain(hostname string) bool {
	verifiedDomainsMu.RLock()
	defer verifiedDomainsMu.RUnlock()

	_, ok := verifiedDomains[hostname]
	return ok
}

func Cors(config config.Config) func(*gin.Context) {
	methods := []string{http.MethodOptions, http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete}
	headers := []string{"x-tickets", "Content-Type", "Authorization", "X-CSRF-Token"}

	return func(ctx *gin.Context) {
		origin := ctx.GetHeader("Origin")
		allowedOrigin := config.Server.BaseUrl

		// Check static KB base URL
		if config.Server.KBBaseUrl != "" && origin == config.Server.KBBaseUrl {
			allowedOrigin = config.Server.KBBaseUrl
		} else if origin != "" && origin != allowedOrigin {
			// Check verified custom KB domains from in-memory cache
			hostname := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
			if hostname != "" && isVerifiedDomain(hostname) {
				allowedOrigin = origin
			}
		}

		ctx.Header("Access-Control-Allow-Origin", allowedOrigin)
		ctx.Header("Access-Control-Allow-Methods", strings.Join(methods, ", "))
		ctx.Header("Access-Control-Allow-Headers", strings.Join(headers, ", "))
		ctx.Header("Access-Control-Allow-Credentials", "true")
		ctx.Header("Access-Control-Max-Age", "600")

		if ctx.Request.Method == http.MethodOptions {
			ctx.AbortWithStatus(http.StatusNoContent)
		}
	}
}
