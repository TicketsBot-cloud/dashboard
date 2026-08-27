package utils

import (
	"errors"
	"net/url"
	"regexp"
	"strings"

	"github.com/weppos/publicsuffix-go/publicsuffix"
)

var PlaceholderRegex = regexp.MustCompile(`%[\w|-]+%`)

// Hosts outbound requests must not target. Matched on the registrable domain so
// subdomains (ptb.discord.com) and casing variants are covered.
var blockedDomains = map[string]bool{
	"discord.com": true,
	"discord.gg":  true,
}

func GetUrlHost(rawUrl string) string {
	parsed, err := url.Parse(rawUrl)
	if err != nil {
		return "Invalid URL"
	}

	return parsed.Hostname()
}

func SecondLevelDomain(domain string) string {
	domain, err := publicsuffix.Domain(domain)
	if err != nil {
		return "Invalid domain"
	}

	return domain
}

func ValidateWebhookUrl(rawUrl string) error {
	stripped := PlaceholderRegex.ReplaceAllString(rawUrl, "")

	parsed, err := url.Parse(stripped)
	if err != nil {
		return errors.New("URL is not valid")
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("URL must start with http:// or https://")
	}

	if parsed.Host == "" {
		return errors.New("URL must include a host")
	}

	if blockedDomains[SecondLevelDomain(strings.ToLower(parsed.Hostname()))] {
		return errors.New("URL must not point at Discord")
	}

	if PlaceholderRegex.MatchString(urlAuthority(rawUrl)) {
		return errors.New("Placeholders cannot be used in the host portion of the URL, only in the path or query string")
	}

	return nil
}

func urlAuthority(rawUrl string) string {
	_, after, found := strings.Cut(rawUrl, "://")
	if !found {
		return rawUrl
	}

	if idx := strings.IndexAny(after, "/?#"); idx != -1 {
		return after[:idx]
	}

	return after
}
