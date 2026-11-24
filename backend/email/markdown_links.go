package email

import (
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

var linkProtocols = []string{"http", "https", "discord", "tel", "sms", "mailto"}

func isInvisible(r rune) bool {
	switch r {
	case '\n', ' ':
		return false
	case 0x034f, 0x17b4, 0x17b5, 0x1160, 0x3164, 0xffa0:
		return true
	}
	return unicode.In(r, unicode.Cf, unicode.Zl, unicode.Zp, unicode.Cc, unicode.Zs)
}

func sanitizeWhitespace(s string) string {
	if strings.IndexFunc(s, isInvisible) < 0 {
		return s
	}
	return strings.Map(func(r rune) rune {
		if isInvisible(r) {
			return -1
		}
		return r
	}, s)
}

var homoglyphs = func() map[rune]rune {
	table := []struct {
		ascii      rune
		lookalikes []rune
	}{
		{'h', []rune{'H', 0x04bb, 0x0570, 0x13c2, 0x210e, 0x1d421, 0x1d489, 0x1d4bd, 0x1d4f1, 0x1d525, 0x1d559, 0x1d58d, 0x1d5c1, 0x1d5f5, 0x1d629, 0x1d65d, 0x1d691, 0xff48}},
		{'t', []rune{'T', 0x1d42d, 0x1d461, 0x1d495, 0x1d4c9, 0x1d4fd, 0x1d531, 0x1d565, 0x1d599, 0x1d5cd, 0x1d601, 0x1d635, 0x1d669, 0x1d69d}},
		{'p', []rune{'P', 0x03c1, 0x03f1, 0x0440, 0x2374, 0x2ca3, 0x1d429, 0x1d45d, 0x1d491, 0x1d4c5, 0x1d4f9, 0x1d52d, 0x1d561, 0x1d595, 0x1d5c9, 0x1d5fd, 0x1d631, 0x1d665, 0x1d699, 0x1d6d2, 0x1d6e0, 0x1d70c, 0x1d71a, 0x1d746, 0x1d754, 0x1d780, 0x1d78e, 0x1d7ba, 0x1d7c8, 0xff50, 0x048f}},
		{'s', []rune{'S', 0x01bd, 0x0455, 0xa731, 0xabaa, 0x10448, 0x118c1, 0x1d42c, 0x1d460, 0x1d494, 0x1d4c8, 0x1d4fc, 0x1d530, 0x1d564, 0x1d598, 0x1d5cc, 0x1d600, 0x1d634, 0x1d668, 0x1d69c, 0xff53}},
		{':', []rune{0x02d0, 0x02f8, 0x0589, 0x05c3, 0x0703, 0x0704, 0x0903, 0x0a83, 0x16ec, 0x1803, 0x1809, 0x205a, 0x2236, 0xa4fd, 0xa789, 0xfe30, 0xff1a, ';', 0x037e}},
		{'/', []rune{0x1735, 0x2041, 0x2044, 0x2215, 0x2571, 0x27cb, 0x29f8, 0x2cc6, 0x2f03, 0x3033, 0x30ce, 0x31d3, 0x4e3f, 0x1d23a}},
	}
	out := map[rune]rune{}
	for _, row := range table {
		for _, r := range row.lookalikes {
			if _, seen := out[r]; !seen {
				out[r] = row.ascii
			}
		}
	}
	return out
}()

func foldHomoglyphs(s string) string {
	return strings.Map(func(r rune) rune {
		if ascii, ok := homoglyphs[r]; ok {
			return ascii
		}
		return r
	}, s)
}

func sanitizeFully(s string) string {
	return foldHomoglyphs(sanitizeWhitespace(s))
}

func unescapeURL(s string) string {
	if !strings.Contains(s, `\`) {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		if s[i] == '\\' && i+1 < len(s) {
			if r, size := utf8.DecodeRuneInString(s[i+1:]); !isASCIIAlnum(r) && !isJSSpace(r) {
				b.WriteString(s[i+1 : i+1+size])
				i += 1 + size
				continue
			}
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}

func decodeURIComponent(s string) (string, bool) {
	if !strings.Contains(s, "%") {
		return s, true
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		if s[i] != '%' {
			b.WriteByte(s[i])
			i++
			continue
		}
		first, ok := decodeEscape(s, i)
		if !ok {
			return "", false
		}
		i += 3
		if first < 0x80 {
			b.WriteByte(first)
			continue
		}
		n := 0
		for mask := byte(0x80); first&mask != 0; mask >>= 1 {
			n++
		}
		if n == 1 || n > 4 {
			return "", false
		}
		seq := []byte{first}
		for k := 1; k < n; k++ {
			next, ok := decodeEscape(s, i)
			if !ok || next&0xc0 != 0x80 {
				return "", false
			}
			seq = append(seq, next)
			i += 3
		}
		if r, size := utf8.DecodeRune(seq); r == utf8.RuneError && size <= 1 {
			return "", false
		}
		b.Write(seq)
	}
	return b.String(), true
}

func decodeEscape(s string, i int) (byte, bool) {
	if i+2 >= len(s) || s[i] != '%' {
		return 0, false
	}
	hi, ok1 := hexValue(s[i+1])
	lo, ok2 := hexValue(s[i+2])
	return hi<<4 | lo, ok1 && ok2
}

func encodeURIComponent(r rune) string {
	if isASCIIAlnum(r) || strings.ContainsRune("-_.!~*'()", r) {
		return string(r)
	}
	return percentEncode(r, func(rune) bool { return true })
}

func isSuspiciousURL(value string) bool {
	if hasEscapedInvite(value) || sanitizeWhitespace(value) != value {
		return true
	}
	u, ok := parseWebURL(value)
	if !ok {
		return true
	}
	if u.scheme != "http" && u.scheme != "https" {
		return false
	}
	parts := strings.Split(value, "/")
	if len(parts) < 3 || parts[1] != "" {
		return true
	}
	decoded, ok := decodeURIComponent(parts[2])
	return !ok || decoded != parts[2]
}

func keepsEncoding(r rune) bool {
	if r < 0x80 {
		return !(isASCIIAlnum(r) || strings.ContainsRune(`"-<>_~`, r))
	}
	switch r {
	case 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x061c, 0x2066, 0x2067, 0x2068, 0x2069,
		0x1f50f, 0x1f510, 0x1f512, 0x1f513, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
		0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0x2800,
		0xad, 0x34f, 0x6dd, 0x70f, 0x8e2, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180b, 0x180c, 0x180d, 0x180e,
		0x200b, 0x200c, 0x200d, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2065, 0x3164, 0xfeff, 0xffa0,
		0xfff9, 0xfffa, 0xfffb, 0x110bd, 0x110cd:
		return true
	}
	return (r >= 0x600 && r <= 0x605) ||
		(r >= 0x206a && r <= 0x206f) ||
		(r >= 0xfff0 && r <= 0xfff8) ||
		(r >= 0xfe00 && r <= 0xfe0f) ||
		(r >= 0x13430 && r <= 0x13438) ||
		(r >= 0x1bca0 && r <= 0x1bca3) ||
		(r >= 0x1d173 && r <= 0x1d17a) ||
		(r >= 0xe0000 && r <= 0xe0fff)
}

// Mirrors the client's walk, desyncs included; ok is false where it throws.
func decodeForDisplay(value string) (string, bool) {
	plain, ok := decodeURIComponent(value)
	if !ok {
		return value, true
	}
	var out strings.Builder
	raw := value
	for raw != "" {
		if plain == "" {
			return "", false
		}
		rawCode, rawSize := utf8.DecodeRuneInString(raw)
		plainCode, plainSize := utf8.DecodeRuneInString(plain)
		if rawCode == plainCode {
			out.WriteString(raw[:rawSize])
			raw, plain = raw[rawSize:], plain[plainSize:]
			continue
		}
		encoded := encodeURIComponent(plainCode)
		rawLength := len(encoded)
		if encoded == string(plainCode) {
			rawLength = 3
		}
		if keepsEncoding(plainCode) {
			out.WriteString(encoded)
		} else {
			out.WriteString(plain[:plainSize])
		}
		raw = raw[min(rawLength, len(raw)):]
		plain = plain[plainSize:]
	}
	return out.String(), true
}

func formatURL(u *webURL, credentials bool) (string, bool) {
	var origin string
	path := u.pathname()
	if !isSpecialScheme(u.scheme) && strings.HasPrefix(path, "//") {
		origin = u.protocol()
	} else {
		auth := ""
		if credentials {
			auth = u.username
			if u.password != "" {
				auth += ":" + u.password
			}
			if auth != "" {
				auth += "@"
			}
		}
		slashes := ""
		if u.hasHost {
			slashes = "//"
		}
		origin = u.protocol() + slashes + auth + u.hostPort()
	}
	out := origin
	for _, part := range []string{path, u.search(), u.hash()} {
		decoded, ok := decodeForDisplay(part)
		if !ok {
			return "", false
		}
		out += decoded
	}
	return out, true
}

func normalizeLink(value string) (target, display string, ok bool) {
	if isSuspiciousURL(value) {
		return "", "", false
	}
	u, ok := parseWebURL(value)
	if !ok || !slices.Contains(linkProtocols, u.scheme) {
		return "", "", false
	}
	if (u.scheme == "http" || u.scheme == "https") && u.host == "" {
		return "", "", false
	}
	if target, ok = formatURL(u, true); !ok {
		return "", "", false
	}
	if display, ok = formatURL(u, false); !ok {
		return "", "", false
	}
	return target, display, true
}

const (
	inviteHost   = "discord.gg"
	templateHost = "discord.new"
)

var primaryHosts = []string{"discord.com", "canary.discord.com", "ptb.discord.com", "discordapp.com"}

var (
	reBareDiscordHost = regexp.MustCompile(`((https?://[^ ]*)|^|[` + jsSpaceClass + `])(discord\.gg|discord\.new|discord\.com|discordapp\.com)`)
	reIPv4            = `(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])){3}`
	// [hH] not (?i), which folds non-ASCII too; JS counts UTF-16 units, so one astral rune is a long enough TLD.
	reURLLike = regexp.MustCompile(`(?:(?:(?:[hH][tT][tT][pP][sS]?:)?//)|[wW][wW][wW]\.)` +
		`(?:[^` + jsSpaceClass + `:@]+(?::[^` + jsSpaceClass + `@]*)?@)?` +
		`(?:[lL][oO][cC][aA][lL][hH][oO][sS][tT]|` + reIPv4 +
		`|(?:[a-zA-Z\x{a1}-\x{10ffff}0-9\-_]+\.)+(?:[a-zA-Z\x{a1}-\x{10ffff}]{2,}|[\x{10000}-\x{10ffff}]))` +
		`(?::[0-9]{2,5})?(?:[/?#][^` + jsSpaceClass + `"()\[\]<>]*)?`)

	reDevLink = regexp.MustCompile(`[dD][eE][vV]://[\w.~:/?#\[\]@!$&'()*+,;=%-]+`)

	reSingleSegment    = regexp.MustCompile(`^/([a-zA-Z0-9-]+)$`)
	reInviteOrTemplate = regexp.MustCompile(`^/(invite|template)/([a-zA-Z0-9-]+)/?\.?$`)
	reEvent            = regexp.MustCompile(`^/events/([0-9]+)/([0-9]+)?(/([0-9]+))?`)
	reGameShop         = regexp.MustCompile(`^(?:/game-shop/([0-9]+)|/channels/([0-9]+)/game-shop/(?:[0-9]+))(?:/([0-9]+)(?:/([^/]+))?)?/?$`)
	rePrimaryPaths     = []*regexp.Regexp{
		regexp.MustCompile(`^/channels/([0-9]+|@me)/([0-9]+)$`),
		regexp.MustCompile(`^/(application-directory|discovery/applications)/([0-9-]+)/?((about|images|privacy)/?)?$`),
		regexp.MustCompile(`^/(application-directory|discovery/applications)/([0-9-]+)/store/?([0-9-]+)?/?$`),
		regexp.MustCompile(`^/activities/([0-9-]+)/?$`),
		regexp.MustCompile(`^/channels/([0-9]+)/shop/([0-9]+)$`),
		regexp.MustCompile(`^/channels/([0-9]+)/shop$`),
		regexp.MustCompile(`^/quests/([0-9-]+)/?$`),
		regexp.MustCompile(`^/games/([0-9]+)(?:/[A-Za-z0-9-]*)?/?$`),
		regexp.MustCompile(`^/game-servers/share/([A-Za-z0-9_-]+)$`),
		regexp.MustCompile(`^/game-organizations/invite/([A-Za-z0-9_-]+)/?$`),
		regexp.MustCompile(`^/users/([0-9]+)/?$`),
		regexp.MustCompile(`^/shop$`),
	}

	// JS's toUpperCase also expands ligatures, and only U+FB01 and U+FB03 can help spell INVITE.
	jsUpperLigatures = strings.NewReplacer("\ufb01", "FI", "\ufb03", "FFI")
)

func stripWWW(host string) string {
	if len(host) >= 4 && strings.EqualFold(host[:4], "www.") {
		return host[4:]
	}
	return host
}

func bracketParam(query, name string) (value string, list bool) {
	seen := false
	for pair := range strings.SplitSeq(strings.TrimPrefix(query, "?"), "&") {
		key, item, _ := strings.Cut(pair, "=")
		switch formDecode(key) {
		case name:
			value, list, seen = formDecode(item), false, true
		case name + "[]":
			if !seen {
				value = formDecode(item)
			}
			list, seen = true, true
		}
	}
	return value, list
}

func authorizesCommandsOnly(query string) bool {
	if clientID, list := bracketParam(query, "client_id"); clientID == "" && !list {
		return false
	}
	scope, _ := bracketParam(query, "scope")
	for s := range strings.FieldsFuncSeq(scope, func(r rune) bool { return r == ' ' || r == '+' }) {
		if s != "applications.commands" {
			return false
		}
	}
	return true
}

func hasSkuID(query string) bool {
	for pair := range strings.SplitSeq(strings.TrimPrefix(query, "?"), "&") {
		key, ids, _ := strings.Cut(pair, "=")
		if formDecode(key) != "skuIds" {
			continue
		}
		for id := range strings.SplitSeq(formDecode(ids), ",") {
			if id != "" && isAllDigits(id) {
				return true
			}
		}
	}
	return false
}

func isCodedLink(candidate string) bool {
	u, ok := legacyParse(candidate)
	if !ok || u.pathname == "" {
		return false
	}
	path := u.pathname
	// Unlike every other kind, event links count on any host.
	if m := reEvent.FindStringSubmatch(path); m != nil && m[2] != "" {
		return true
	}
	host := stripWWW(u.host)
	switch {
	case host == inviteHost:
		web := u.protocol == "http:" || u.protocol == "https:"
		return web && reSingleSegment.MatchString(path) && !strings.Contains(candidate, `\`)
	case host == templateHost:
		return reSingleSegment.MatchString(path)
	case !slices.Contains(primaryHosts, host):
		return false
	}
	query := u.query
	if utf16Len(query) > 1000 {
		query = ""
	}
	if m := reInviteOrTemplate.FindStringSubmatch(path); m != nil {
		return m[1] == "template" || !strings.Contains(candidate, `\`)
	}
	if strings.HasPrefix(path, "/oauth2/authorize") && authorizesCommandsOnly(query) {
		return true
	}
	if m := reGameShop.FindStringSubmatch(path); m != nil && (m[3] != "" || hasSkuID(query)) {
		return true
	}
	return slices.ContainsFunc(rePrimaryPaths, func(re *regexp.Regexp) bool { return re.MatchString(path) })
}

func containsDiscordLink(value string) bool {
	var b strings.Builder
	last := 0
	for _, m := range reBareDiscordHost.FindAllStringSubmatchIndex(value, -1) {
		if m[4] >= 0 {
			continue
		}
		b.WriteString(value[last:m[0]])
		b.WriteString(value[m[2]:m[3]])
		b.WriteString("http://")
		b.WriteString(value[m[6]:m[7]])
		last = m[1]
	}
	b.WriteString(value[last:])
	prefixed := b.String()

	candidates := reURLLike.FindAllString(replaceCodeSpans(prefixed), -1)
	for i, candidate := range candidates {
		candidates[i] = strings.TrimRight(candidate, ".,;:?'*_~|")
	}
	// Only the first dev:// link counts, and code spans don't hide it.
	if devLink := reDevLink.FindString(prefixed); devLink != "" {
		candidates = append(candidates, devLink)
	}
	return slices.ContainsFunc(candidates, isCodedLink)
}

func replaceCodeSpans(s string) string {
	if !strings.Contains(s, "`") {
		return s
	}
	var b strings.Builder
	last := 0
	for i := 0; i < len(s); {
		if s[i] != '`' {
			i++
			continue
		}
		end, ok := codeSpanAt(s, i)
		if !ok {
			i++
			continue
		}
		b.WriteString(s[last:i])
		b.WriteByte(' ')
		last, i = end, end
	}
	b.WriteString(s[last:])
	return b.String()
}

func codeSpanAt(s string, i int) (int, bool) {
	run := countByte(s, i, '`')
	if run >= 3 {
		for j := i + run; j < len(s); j++ {
			if n := countByte(s, j, '`'); n >= 3 {
				return j + n, true
			}
		}
		return len(s), true
	}
	for n := run; n >= 1; n-- {
		k := i + n
		m := k
		for m < len(s) && s[m] != '`' {
			m++
		}
		if m > k && countByte(s, m, '`') == n {
			return m + n, true
		}
	}
	return 0, false
}

func hasEscapedInvite(value string) bool {
	if !strings.Contains(value, `\`) {
		return false
	}
	u, ok := legacyParse(value)
	if !ok {
		return false
	}
	host := stripWWW(u.host)
	if host == inviteHost {
		return true
	}
	return slices.Contains(primaryHosts, host) && strings.Contains(strings.ToUpper(jsUpperLigatures.Replace(u.pathname)), "INVITE")
}
