package email

// The `url` package's legacy parse that Discord's link finder runs.

import (
	"regexp"
	"slices"
	"strings"
	"unicode/utf16"
)

type legacyURL struct {
	protocol string
	host     string
	pathname string
	query    string
}

var (
	reSlashedAuth    = regexp.MustCompile(`^//[^@/]+@[^@/]+`)
	slashedProtocols = []string{"http:", "https:", "ftp:", "gopher:", "file:"}
	// punycode.toASCII's encoding is skipped, as hosts are only compared with ASCII ones.
	idnSeparators = strings.NewReplacer("\u3002", ".", "\uff0e", ".", "\uff61", ".")
	autoEscaper   = strings.NewReplacer(
		"'", "%27", "{", "%7B", "}", "%7D", "|", "%7C", `\`, "%5C", "^", "%5E", "`", "%60",
		"<", "%3C", ">", "%3E", `"`, "%22", " ", "%20", "\r", "%0D", "\n", "%0A", "\t", "%09",
	)
)

const nonHostChars = "%/?;#'{}|\\^`<>\" \r\n\t"

func legacyParse(value string) (u legacyURL, ok bool) {
	splitter := "#"
	if q := strings.IndexByte(value, '?'); q >= 0 && q < strings.IndexByte(value, '#') {
		splitter = "?"
	}
	head, tail, found := strings.Cut(value, splitter)
	value = strings.ReplaceAll(head, `\`, "/")
	if found {
		value += splitter + tail
	}
	rest := jsTrim(value)

	if !strings.Contains(value, "#") && isSimplePath(rest) {
		u.pathname, u.query, _ = strings.Cut(rest, "?")
		return u, true
	}

	// The package looks the protocol up as typed, so "HTTP:" isn't a slashed protocol.
	protocol := ""
	if n := protocolLen(rest); n > 0 {
		protocol = rest[:n]
		u.protocol = strings.ToLower(protocol)
		rest = rest[n:]
	}
	hostless := protocol == "javascript:"
	slashes := false
	if protocol != "" || reSlashedAuth.MatchString(rest) {
		slashes = strings.HasPrefix(rest, "//")
		if slashes && !hostless {
			rest = rest[2:]
		}
	}

	hostname := ""
	if !hostless && (slashes || protocol != "" && !slices.Contains(slashedProtocols, protocol)) {
		at := strings.LastIndexByte(rest, '@')
		if hostEnd := strings.IndexAny(rest, "/?#"); hostEnd >= 0 {
			at = strings.LastIndexByte(rest[:hostEnd], '@')
		}
		if at >= 0 {
			if _, ok := decodeURIComponent(rest[:at]); !ok {
				return legacyURL{}, false
			}
			rest = rest[at+1:]
		}
		end := strings.IndexAny(rest, nonHostChars)
		if end < 0 {
			end = len(rest)
		}
		hostname, rest = rest[:end], rest[end:]
		port := ""
		if i := strings.LastIndexByte(hostname, ':'); i >= 0 && isAllDigits(hostname[i+1:]) {
			hostname, port = hostname[:i], hostname[i+1:]
		}

		ipv6 := strings.HasPrefix(hostname, "[") && strings.HasSuffix(hostname, "]")
		if !ipv6 {
			hostname, rest = trimInvalidLabels(hostname, rest)
		}
		if utf16Len(hostname) > 255 {
			hostname = ""
		} else {
			// Not strings.ToLower alone: Go folds U+0130 to a plain i, JS keeps a combining dot.
			hostname = strings.ToLower(strings.ReplaceAll(hostname, "\u0130", "i\u0307"))
		}
		if !ipv6 {
			hostname = idnSeparators.Replace(hostname)
		}
		u.host = hostname
		if port != "" {
			u.host += ":" + port
		}
		if ipv6 && !strings.HasPrefix(rest, "/") {
			rest = "/" + rest
		}
	}

	if u.protocol != "javascript:" {
		rest = autoEscaper.Replace(rest)
	}
	rest, _, _ = strings.Cut(rest, "#")
	u.pathname, u.query, _ = strings.Cut(rest, "?")
	if u.pathname == "" && hostname != "" && slices.Contains(slashedProtocols, u.protocol) {
		u.pathname = "/"
	}
	return u, true
}

func isSimplePath(s string) bool {
	return strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "///") && !strings.ContainsFunc(s, isJSSpace)
}

func protocolLen(s string) int {
	n := 0
	for n < len(s) && (isASCIIAlnum(rune(s[n])) || strings.IndexByte(".+-", s[n]) >= 0) {
		n++
	}
	if n == 0 || n == len(s) || s[n] != ':' {
		return 0
	}
	return n + 1
}

func trimInvalidLabels(hostname, rest string) (string, string) {
	labels := strings.Split(hostname, ".")
	for i, label := range labels {
		if label == "" || isHostLabel(label) {
			continue
		}
		valid, notHost := slices.Clone(labels[:i]), slices.Clone(labels[i+1:])
		if head, tail, ok := splitHostLabel(label); ok {
			valid = append(valid, head)
			notHost = append([]string{tail}, notHost...)
		}
		if len(notHost) > 0 {
			rest = "/" + strings.Join(notHost, ".") + rest
		}
		return strings.Join(valid, "."), rest
	}
	return hostname, rest
}

// The package swaps each non-ASCII UTF-16 unit for an x before testing a label.
func isHostLabel(label string) bool {
	units := 0
	for _, r := range label {
		if r < 0x80 && !isHostLabelByte(byte(r)) {
			return false
		}
		units += utf16.RuneLen(r)
	}
	return units <= 63
}

// The package's regex fails on a line terminator, which JS's dot doesn't match.
func splitHostLabel(label string) (head, tail string, ok bool) {
	if strings.ContainsFunc(label, isJSLineTerminator) {
		return "", "", false
	}
	n := 0
	for n < len(label) && n < 63 && isHostLabelByte(label[n]) {
		n++
	}
	return label[:n], label[n:], true
}

func isHostLabelByte(c byte) bool {
	return isWordByte(c) || c == '+' || c == '-'
}

func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}
