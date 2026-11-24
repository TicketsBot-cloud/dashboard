package email

// The parts of the WHATWG URL Standard (`new URL()`, no base) that Discord's link rules read.

import (
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/net/idna"
)

type webURL struct {
	scheme     string
	username   string
	password   string
	host       string
	hasHost    bool
	port       int
	path       []string
	opaque     bool
	opaquePath string
	query      string
	fragment   string
}

var specialSchemePorts = map[string]int{"ftp": 21, "file": -1, "http": 80, "https": 443, "ws": 80, "wss": 443}

func isSpecialScheme(scheme string) bool {
	_, ok := specialSchemePorts[scheme]
	return ok
}

func (u *webURL) protocol() string {
	return u.scheme + ":"
}

func (u *webURL) hostPort() string {
	if !u.hasHost {
		return ""
	}
	if u.port < 0 {
		return u.host
	}
	return u.host + ":" + strconv.Itoa(u.port)
}

func (u *webURL) pathname() string {
	if u.opaque {
		return u.opaquePath
	}
	var b strings.Builder
	for _, segment := range u.path {
		b.WriteByte('/')
		b.WriteString(segment)
	}
	return b.String()
}

func (u *webURL) search() string {
	if u.query == "" {
		return ""
	}
	return "?" + u.query
}

func (u *webURL) hash() string {
	if u.fragment == "" {
		return ""
	}
	return "#" + u.fragment
}

func formDecode(s string) string {
	return decodeUTF8Lossy(percentDecode(strings.ReplaceAll(s, "+", " ")))
}

type urlState int

const (
	urlSchemeStart urlState = iota
	urlScheme
	urlSpecialAuthoritySlashes
	urlSpecialAuthorityIgnoreSlashes
	urlPathOrAuthority
	urlAuthority
	urlHost
	urlPort
	urlPathStart
	urlPath
	urlOpaquePath
	urlQuery
	urlFragment
)

const urlEOF rune = -1

func parseWebURL(input string) (*webURL, bool) {
	input = strings.TrimFunc(input, func(r rune) bool { return r <= ' ' })
	input = strings.Map(func(r rune) rune {
		if r == '\t' || r == '\n' || r == '\r' {
			return -1
		}
		return r
	}, input)

	in := []rune(input)
	u := &webURL{port: -1}
	state := urlSchemeStart
	special := false
	var buf []rune
	var segment, query strings.Builder
	var queryBuf []rune
	atSignSeen, insideBrackets, passwordTokenSeen := false, false, false

	for p := 0; ; p++ {
		c := urlEOF
		if p < len(in) {
			c = in[p]
		}
		ends := c == urlEOF || c == '/' || c == '?' || c == '#' || (special && c == '\\')

		switch state {
		case urlSchemeStart:
			if !isASCIIAlpha(c) {
				return nil, false
			}
			buf = append(buf, toLowerASCII(c))
			state = urlScheme

		case urlScheme:
			switch {
			case isASCIIAlpha(c) || isASCIIDigit(c) || c == '+' || c == '-' || c == '.':
				buf = append(buf, toLowerASCII(c))
			case c == ':':
				u.scheme = string(buf)
				buf = buf[:0]
				special = isSpecialScheme(u.scheme)
				switch {
				case u.scheme == "file":
					// No Discord link rule can link a file: URL, so its details never matter.
					return u, true
				case special:
					state = urlSpecialAuthoritySlashes
				case p+1 < len(in) && in[p+1] == '/':
					state = urlPathOrAuthority
					p++
				default:
					u.opaque = true
					state = urlOpaquePath
				}
			default:
				return nil, false
			}

		case urlSpecialAuthoritySlashes:
			state = urlSpecialAuthorityIgnoreSlashes
			if c == '/' && p+1 < len(in) && in[p+1] == '/' {
				p++
			} else {
				p--
			}

		case urlSpecialAuthorityIgnoreSlashes:
			if c != '/' && c != '\\' {
				state = urlAuthority
				p--
			}

		case urlPathOrAuthority:
			if c == '/' {
				state = urlAuthority
			} else {
				state = urlPath
				p--
			}

		case urlAuthority:
			switch {
			case c == '@':
				if atSignSeen {
					buf = append([]rune("%40"), buf...)
				}
				atSignSeen = true
				for _, r := range buf {
					if r == ':' && !passwordTokenSeen {
						passwordTokenSeen = true
						continue
					}
					if passwordTokenSeen {
						u.password += percentEncode(r, inUserinfoSet)
					} else {
						u.username += percentEncode(r, inUserinfoSet)
					}
				}
				buf = buf[:0]
			case ends:
				if atSignSeen && len(buf) == 0 {
					return nil, false
				}
				p -= len(buf) + 1
				buf = buf[:0]
				state = urlHost
			default:
				buf = append(buf, c)
			}

		case urlHost:
			switch {
			case c == ':' && !insideBrackets:
				if len(buf) == 0 {
					return nil, false
				}
				host, ok := parseURLHost(string(buf), !special)
				if !ok {
					return nil, false
				}
				u.host, u.hasHost = host, true
				buf = buf[:0]
				state = urlPort
			case ends:
				p--
				if special && len(buf) == 0 {
					return nil, false
				}
				host, ok := parseURLHost(string(buf), !special)
				if !ok {
					return nil, false
				}
				u.host, u.hasHost = host, true
				buf = buf[:0]
				state = urlPathStart
			default:
				if c == '[' {
					insideBrackets = true
				} else if c == ']' {
					insideBrackets = false
				}
				buf = append(buf, c)
			}

		case urlPort:
			switch {
			case isASCIIDigit(c):
				buf = append(buf, c)
			case ends:
				if len(buf) > 0 {
					port := 0
					for _, d := range buf {
						if port = port*10 + int(d-'0'); port > 65535 {
							return nil, false
						}
					}
					if def, ok := specialSchemePorts[u.scheme]; ok && def == port {
						u.port = -1
					} else {
						u.port = port
					}
					buf = buf[:0]
				}
				state = urlPathStart
				p--
			default:
				return nil, false
			}

		case urlPathStart:
			switch {
			case special:
				state = urlPath
				if c != '/' && c != '\\' {
					p--
				}
			case c == '?':
				state = urlQuery
			case c == '#':
				state = urlFragment
			case c != urlEOF:
				state = urlPath
				if c != '/' {
					p--
				}
			}

		case urlPath:
			if ends {
				value := segment.String()
				slash := c == '/' || (special && c == '\\')
				switch {
				case isDoubleDotSegment(value):
					if len(u.path) > 0 {
						u.path = u.path[:len(u.path)-1]
					}
					if !slash {
						u.path = append(u.path, "")
					}
				case isSingleDotSegment(value):
					if !slash {
						u.path = append(u.path, "")
					}
				default:
					u.path = append(u.path, value)
				}
				segment.Reset()
				if c == '?' {
					state = urlQuery
				} else if c == '#' {
					state = urlFragment
				}
			} else {
				segment.WriteString(percentEncode(c, inPathSet))
			}

		case urlOpaquePath:
			switch {
			case c == '?':
				state = urlQuery
			case c == '#':
				state = urlFragment
			case c == ' ':
				if p+1 < len(in) && (in[p+1] == '?' || in[p+1] == '#') {
					u.opaquePath += "%20"
				} else {
					u.opaquePath += " "
				}
			case c != urlEOF:
				u.opaquePath += percentEncode(c, inC0ControlSet)
			}

		case urlQuery:
			if c == urlEOF || c == '#' {
				set := inQuerySet
				if special {
					set = inSpecialQuerySet
				}
				for _, r := range queryBuf {
					query.WriteString(percentEncode(r, set))
				}
				queryBuf = queryBuf[:0]
				if c == '#' {
					state = urlFragment
				}
			} else {
				queryBuf = append(queryBuf, c)
			}

		case urlFragment:
			if c != urlEOF {
				u.fragment += percentEncode(c, inFragmentSet)
			}
		}

		if p >= len(in) {
			break
		}
	}
	u.query = query.String()
	return u, true
}

func isSingleDotSegment(s string) bool {
	return s == "." || strings.EqualFold(s, "%2e")
}

func isDoubleDotSegment(s string) bool {
	switch strings.ToLower(s) {
	case "..", ".%2e", "%2e.", "%2e%2e":
		return true
	}
	return false
}

func inC0ControlSet(r rune) bool {
	return r < 0x20 || r > 0x7e
}

func inFragmentSet(r rune) bool {
	return inC0ControlSet(r) || r == ' ' || r == '"' || r == '<' || r == '>' || r == '`'
}

func inQuerySet(r rune) bool {
	return inC0ControlSet(r) || r == ' ' || r == '"' || r == '#' || r == '<' || r == '>'
}

func inSpecialQuerySet(r rune) bool {
	return inQuerySet(r) || r == '\''
}

func inPathSet(r rune) bool {
	return inQuerySet(r) || r == '?' || r == '^' || r == '`' || r == '{' || r == '}'
}

func inUserinfoSet(r rune) bool {
	return inPathSet(r) || r == '/' || r == ':' || r == ';' || r == '=' || r == '@' || (r >= '[' && r <= '^') || r == '|'
}

const upperHex = "0123456789ABCDEF"

func percentEncode(r rune, set func(rune) bool) string {
	if !set(r) {
		return string(r)
	}
	var b strings.Builder
	for _, c := range []byte(string(r)) {
		b.WriteByte('%')
		b.WriteByte(upperHex[c>>4])
		b.WriteByte(upperHex[c&15])
	}
	return b.String()
}

func hexValue(c byte) (byte, bool) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', true
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, true
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}

func percentDecode(s string) []byte {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) {
			hi, ok1 := hexValue(s[i+1])
			lo, ok2 := hexValue(s[i+2])
			if ok1 && ok2 {
				out = append(out, hi<<4|lo)
				i += 2
				continue
			}
		}
		out = append(out, s[i])
	}
	return out
}

func decodeUTF8Lossy(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	var out strings.Builder
	for len(b) > 0 {
		r, size := utf8.DecodeRune(b)
		out.WriteRune(r)
		b = b[size:]
	}
	return out.String()
}

func isForbiddenHostCodePoint(r rune) bool {
	switch r {
	case 0, '\t', '\n', '\r', ' ', '#', '/', ':', '<', '>', '?', '@', '[', '\\', ']', '^', '|':
		return true
	}
	return false
}

func isForbiddenDomainCodePoint(r rune) bool {
	return isForbiddenHostCodePoint(r) || r <= 0x1f || r == '%' || r == 0x7f
}

func parseURLHost(input string, opaque bool) (string, bool) {
	if strings.HasPrefix(input, "[") {
		if !strings.HasSuffix(input, "]") {
			return "", false
		}
		address, ok := parseIPv6(input[1 : len(input)-1])
		if !ok {
			return "", false
		}
		return "[" + serializeIPv6(address) + "]", true
	}
	if opaque {
		if strings.ContainsFunc(input, isForbiddenHostCodePoint) {
			return "", false
		}
		var b strings.Builder
		for _, r := range input {
			b.WriteString(percentEncode(r, inC0ControlSet))
		}
		return b.String(), true
	}

	domain, ok := domainToASCII(decodeUTF8Lossy(percentDecode(input)))
	if !ok || strings.ContainsFunc(domain, isForbiddenDomainCodePoint) {
		return "", false
	}
	if endsInNumber(domain) {
		address, ok := parseIPv4(domain)
		if !ok {
			return "", false
		}
		return serializeIPv4(address), true
	}
	return domain, true
}

var whatwgIDNA = idna.New(
	idna.MapForLookup(),
	idna.BidiRule(),
	idna.Transitional(false),
	idna.StrictDomainName(false),
	idna.CheckHyphens(false),
	idna.VerifyDNSLength(false),
)

func domainToASCII(domain string) (string, bool) {
	// Node validates xn-- labels only in non-ASCII domains, so an ASCII one is just lowercased.
	if isASCII(domain) {
		return strings.ToLower(domain), true
	}
	var labels []string
	start := 0
	for i, r := range domain {
		if r == '.' || r == 0x3002 || r == 0xff0e || r == 0xff61 {
			labels = append(labels, domain[start:i])
			start = i + utf8.RuneLen(r)
		}
	}
	labels = append(labels, domain[start:])

	for i, label := range labels {
		if isASCII(label) && !hasPunycodePrefix(label) {
			labels[i] = strings.ToLower(label)
			continue
		}
		mapped := idnaMap(label)
		if hasPunycodePrefix(mapped) {
			// A punycode label is kept as written rather than re-encoded.
			if len(mapped) == 4 || !isASCII(mapped) {
				return "", false
			}
			if _, err := whatwgIDNA.ToASCII(mapped); err != nil {
				return "", false
			}
			labels[i] = mapped
			continue
		}
		// x/net/idna reads Bidi classes from unmapped runes, so U+2135-2138 (L, mapping to Hebrew R) would skip the Bidi rule.
		out, err := whatwgIDNA.ToASCII(mapped)
		if err != nil {
			return "", false
		}
		labels[i] = out
	}
	result := strings.Join(labels, ".")
	return result, result != ""
}

func hasPunycodePrefix(label string) bool {
	return len(label) >= 4 && strings.EqualFold(label[:4], "xn--")
}

var idnaMapping = idna.New(idna.MapForLookup(), idna.ValidateLabels(false), idna.StrictDomainName(false), idna.Transitional(false))

func idnaMap(label string) string {
	var b strings.Builder
	for _, r := range label {
		if r < utf8.RuneSelf {
			b.WriteRune(toLowerASCII(r))
			continue
		}
		mapped, _ := idnaMapping.ToUnicode(string(r))
		b.WriteString(mapped)
	}
	return b.String()
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

func endsInNumber(host string) bool {
	parts := strings.Split(host, ".")
	if parts[len(parts)-1] == "" {
		if len(parts) == 1 {
			return false
		}
		parts = parts[:len(parts)-1]
	}
	last := parts[len(parts)-1]
	if last != "" && strings.Trim(last, "0123456789") == "" {
		return true
	}
	_, ok := parseIPv4Number(last)
	return ok
}

// Values past 2^32 only need to compare as too big, so they saturate.
const ipv4Overflow = 1 << 40

func parseIPv4Number(s string) (uint64, bool) {
	if s == "" {
		return 0, false
	}
	radix := uint64(10)
	if len(s) >= 2 && (s[:2] == "0x" || s[:2] == "0X") {
		s, radix = s[2:], 16
	} else if len(s) >= 2 && s[0] == '0' {
		s, radix = s[1:], 8
	}
	var n uint64
	for i := 0; i < len(s); i++ {
		d, ok := hexValue(s[i])
		if !ok || uint64(d) >= radix {
			return 0, false
		}
		if n = n*radix + uint64(d); n > ipv4Overflow {
			n = ipv4Overflow
		}
	}
	return n, true
}

func parseIPv4(host string) (uint32, bool) {
	parts := strings.Split(host, ".")
	if parts[len(parts)-1] == "" && len(parts) > 1 {
		parts = parts[:len(parts)-1]
	}
	if len(parts) > 4 {
		return 0, false
	}
	numbers := make([]uint64, len(parts))
	for i, part := range parts {
		n, ok := parseIPv4Number(part)
		if !ok {
			return 0, false
		}
		numbers[i] = n
	}
	for _, n := range numbers[:len(numbers)-1] {
		if n > 255 {
			return 0, false
		}
	}
	last := numbers[len(numbers)-1]
	if last >= uint64(1)<<(8*(5-len(numbers))) {
		return 0, false
	}
	address := last
	for i, n := range numbers[:len(numbers)-1] {
		address += n << (8 * (3 - i))
	}
	return uint32(address), true
}

func serializeIPv4(address uint32) string {
	return strconv.Itoa(int(address>>24)) + "." + strconv.Itoa(int(address>>16&255)) + "." +
		strconv.Itoa(int(address>>8&255)) + "." + strconv.Itoa(int(address&255))
}

func parseIPv6(input string) ([8]uint16, bool) {
	var address [8]uint16
	pieceIndex, compress := 0, -1
	p := 0
	at := func(i int) byte {
		if i < len(input) {
			return input[i]
		}
		return 0
	}

	if at(p) == ':' {
		if at(p+1) != ':' {
			return address, false
		}
		p += 2
		pieceIndex++
		compress = pieceIndex
	}
	for p < len(input) {
		if pieceIndex == 8 {
			return address, false
		}
		if input[p] == ':' {
			if compress >= 0 {
				return address, false
			}
			p++
			pieceIndex++
			compress = pieceIndex
			continue
		}
		value, length := 0, 0
		for length < 4 {
			d, ok := hexValue(at(p))
			if !ok {
				break
			}
			value = value*16 + int(d)
			p++
			length++
		}
		if at(p) == '.' {
			if length == 0 {
				return address, false
			}
			p -= length
			if pieceIndex > 6 {
				return address, false
			}
			numbersSeen := 0
			for p < len(input) {
				piece := -1
				if numbersSeen > 0 {
					if input[p] != '.' || numbersSeen >= 4 {
						return address, false
					}
					p++
				}
				if !isASCIIDigit(rune(at(p))) {
					return address, false
				}
				for isASCIIDigit(rune(at(p))) {
					n := int(input[p] - '0')
					switch piece {
					case -1:
						piece = n
					case 0:
						return address, false
					default:
						piece = piece*10 + n
					}
					if piece > 255 {
						return address, false
					}
					p++
				}
				address[pieceIndex] = address[pieceIndex]*0x100 + uint16(piece)
				numbersSeen++
				if numbersSeen == 2 || numbersSeen == 4 {
					pieceIndex++
				}
			}
			if numbersSeen != 4 {
				return address, false
			}
			break
		} else if at(p) == ':' {
			p++
			if p >= len(input) {
				return address, false
			}
		} else if p < len(input) {
			return address, false
		}
		address[pieceIndex] = uint16(value)
		pieceIndex++
	}
	if compress >= 0 {
		swaps := pieceIndex - compress
		pieceIndex = 7
		for pieceIndex != 0 && swaps > 0 {
			address[pieceIndex], address[compress+swaps-1] = address[compress+swaps-1], address[pieceIndex]
			pieceIndex--
			swaps--
		}
	} else if pieceIndex != 8 {
		return address, false
	}
	return address, true
}

func serializeIPv6(address [8]uint16) string {
	compress, bestLen := -1, 1
	for i := 0; i < 8; {
		if address[i] != 0 {
			i++
			continue
		}
		j := i
		for j < 8 && address[j] == 0 {
			j++
		}
		if j-i > bestLen {
			compress, bestLen = i, j-i
		}
		i = j
	}

	var b strings.Builder
	ignoreZero := false
	for i := 0; i < 8; i++ {
		if ignoreZero && address[i] == 0 {
			continue
		}
		ignoreZero = false
		if i == compress {
			if i == 0 {
				b.WriteString("::")
			} else {
				b.WriteByte(':')
			}
			ignoreZero = true
			continue
		}
		b.WriteString(strconv.FormatUint(uint64(address[i]), 16))
		if i != 7 {
			b.WriteByte(':')
		}
	}
	return b.String()
}

func isASCIIAlpha(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}

func isASCIIDigit(r rune) bool {
	return r >= '0' && r <= '9'
}

func toLowerASCII(r rune) rune {
	if r >= 'A' && r <= 'Z' {
		return r + 'a' - 'A'
	}
	return r
}
