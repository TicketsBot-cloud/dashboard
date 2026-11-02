package email

import (
	"cmp"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"
)

type mdKind uint8

const (
	mdText mdKind = iota
	mdBr
	mdCode
	mdCodeBlock
	mdUserMention
	mdRoleMention
	mdChannelMention
	mdGlobalMention
	mdCommandMention
	mdGuildNav
	mdEmoji
	mdTimestamp
	mdMark
	mdLink
	mdHeading
	mdSubtext
	mdQuote
	mdParagraph
	mdList
)

type markType uint8

const (
	markBold markType = iota
	markItalic
	markUnderline
	markStrike
	markSpoiler
)

type mdNode struct {
	kind     mdKind
	text     string
	lang     string
	url      string
	title    string
	id       string
	name     string
	mark     markType
	level    int
	ordered  bool
	start    int
	animated bool
	unix     int64
	style    byte
	children []mdNode
	items    [][]mdNode

	codeContent  []mdNode
	blockNewline bool
}

func textNode(value string) mdNode {
	return mdNode{kind: mdText, text: value}
}

func (n *mdNode) hasChildren() bool {
	switch n.kind {
	case mdMark, mdLink, mdHeading, mdSubtext, mdQuote, mdParagraph:
		return true
	}
	return false
}

type mdCapture struct {
	all    string
	groups [5]string
	set    [5]bool
	astral bool
}

type mdState struct {
	inline       bool
	prev         string
	depth        int
	listLevel    int
	inQuote      bool
	allowHeading bool
	noSubtext    bool
	noEscape     bool
	codeContent  bool
	validation   *linkValidation
}

type linkValidation struct {
	nestedLink bool
}

type mdRule struct {
	name    string
	order   float64
	first   string
	quality func(c *mdCapture) float64
	match   func(src string, st *mdState) *mdCapture
	parse   func(p *mdParser, c *mdCapture, st *mdState) []mdNode
}

type mdParser struct {
	byFirst  map[rune][]*mdRule
	anywhere []*mdRule
	label    *mdParser
}

const (
	mdMaxParseDepth = 1000
	mdMaxListLevel  = 11
	mdNodeLimit     = 200
)

func newMdParser(rules []*mdRule) *mdParser {
	sorted := slices.Clone(rules)
	slices.SortFunc(sorted, func(a, b *mdRule) int {
		if a.order != b.order {
			return cmp.Compare(a.order, b.order)
		}
		if (a.quality == nil) != (b.quality == nil) {
			if a.quality != nil {
				return -1
			}
			return 1
		}
		return strings.Compare(a.name, b.name)
	})

	p := &mdParser{byFirst: map[rune][]*mdRule{}}
	for _, rule := range sorted {
		if rule.first == "" {
			p.anywhere = append(p.anywhere, rule)
			continue
		}
		for _, c := range rule.first {
			p.byFirst[c] = append(p.byFirst[c], rule)
		}
	}
	return p
}

func (p *mdParser) nested(src string, parent mdState) []mdNode {
	var out []mdNode
	st := parent
	st.depth++
	if st.depth > mdMaxParseDepth {
		if src != "" {
			out = append(out, textNode(src))
		}
		return out
	}

	lowSurrogate := false
	for src != "" {
		if lowSurrogate {
			// The client's escape took only this character's high surrogate; its text rule resumes at the low one.
			lowSurrogate = false
			n := textEnd(src, 0)
			out = append(out, textNode(src[:n]))
			st.prev = string(utf8.RuneError) + src[:n]
			src = src[n:]
			continue
		}

		var best *mdRule
		var capture *mdCapture
		bestOrder, bestQuality := 1e5, -1e5
		first, _ := utf8.DecodeRuneInString(src)
		for _, list := range [2][]*mdRule{p.byFirst[first], p.anywhere} {
			for _, rule := range list {
				if rule.order > bestOrder {
					break
				}
				c := rule.match(src, &st)
				if c == nil {
					continue
				}
				quality := 0.0
				if rule.quality != nil {
					quality = rule.quality(c)
				}
				if rule.order < bestOrder || quality > bestQuality {
					best, capture, bestOrder, bestQuality = rule, c, rule.order, quality
				}
			}
		}

		if best == nil || capture.all == "" {
			out = append(out, textNode(src))
			break
		}

		out = append(out, best.parse(p, capture, &st)...)
		st.prev = capture.all
		src = src[len(capture.all):]
		lowSurrogate = capture.astral
	}
	return out
}

func mdPreprocess(src string) string {
	src = strings.ReplaceAll(src, "\r\n", "\n")
	src = strings.ReplaceAll(src, "\r", "\n")
	src = strings.ReplaceAll(src, "\f", "")
	return strings.ReplaceAll(src, "\t", "    ")
}

func parseDiscordMarkdown(src string) []mdNode {
	if src == "" {
		return nil
	}
	st := mdState{inline: true, allowHeading: true}
	nodes := markdownParser.nested(mdPreprocess(strings.ToValidUTF8(src, string(utf8.RuneError))), st)
	remaining := mdNodeLimit
	// Unlike message content, a Text Display keeps the tree cut at the limit.
	return limitNodes(postProcess(nodes, nil), &remaining)
}

func sameType(parent, n *mdNode) bool {
	return parent.kind == n.kind && (n.kind != mdMark || parent.mark == n.mark)
}

func postProcess(nodes []mdNode, parent *mdNode) []mdNode {
	var out []mdNode
	for _, node := range nodes {
		if node.hasChildren() {
			node.children = postProcess(node.children, &node)
		}
		if node.kind == mdList {
			items := make([][]mdNode, len(node.items))
			for i, item := range node.items {
				items[i] = postProcess(item, nil)
			}
			node.items = items
		}

		parts := []mdNode{node}
		if parent != nil && node.hasChildren() && sameType(parent, &node) {
			parts = node.children
		}
		for _, part := range parts {
			if last := len(out) - 1; part.kind == mdText && last >= 0 && out[last].kind == mdText {
				out[last] = textNode(out[last].text + part.text)
			} else {
				out = append(out, part)
			}
		}
	}
	return slices.DeleteFunc(out, func(n mdNode) bool { return n.kind == mdText && n.text == "" })
}

func limitNodes(nodes []mdNode, remaining *int) []mdNode {
	var out []mdNode
	for _, node := range nodes {
		if node.kind == mdText {
			out = append(out, node)
			continue
		}
		if *remaining--; *remaining <= 0 {
			break
		}
		// Discord's channel mentions hide a channel node inside, which its limit counts too.
		if node.kind == mdChannelMention {
			*remaining--
		}
		switch {
		case node.hasChildren():
			node.children = limitNodes(node.children, remaining)
		case node.kind == mdList:
			items := make([][]mdNode, len(node.items))
			for i, item := range node.items {
				items[i] = limitNodes(item, remaining)
			}
			node.items = items
		}
		out = append(out, node)
	}
	return out
}

const jsSpaceClass = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

func isJSLineTerminator(r rune) bool {
	return r == '\n' || r == '\r' || r == 0x2028 || r == 0x2029
}

func jsTrim(s string) string {
	return strings.TrimFunc(s, isJSSpace)
}

func jsSpaceEnd(s string, i int) int {
	for i < len(s) {
		r, size := utf8.DecodeRuneInString(s[i:])
		if !isJSSpace(r) {
			break
		}
		i += size
	}
	return i
}

func isASCIIAlnum(r rune) bool {
	return isASCIIAlpha(r) || isASCIIDigit(r)
}

func isWordByte(c byte) bool {
	return c == '_' || isASCIIAlnum(rune(c))
}

func countByte(s string, i int, c byte) int {
	n := 0
	for i+n < len(s) && s[i+n] == c {
		n++
	}
	return n
}

func lineEnd(s string, i int) int {
	if j := strings.IndexByte(s[i:], '\n'); j >= 0 {
		return i + j
	}
	return len(s)
}

func newCapture(all string, groups ...string) *mdCapture {
	c := &mdCapture{all: all}
	for i, g := range groups {
		c.groups[i+1], c.set[i+1] = g, true
	}
	return c
}

func regexCapture(re *regexp.Regexp, src string) *mdCapture {
	m := re.FindStringSubmatchIndex(src)
	if m == nil {
		return nil
	}
	c := &mdCapture{all: src[:m[1]]}
	for i := 1; i < len(m)/2; i++ {
		if m[2*i] >= 0 {
			c.groups[i], c.set[i] = src[m[2*i]:m[2*i+1]], true
		}
	}
	return c
}

func inlineRegex(re *regexp.Regexp) func(string, *mdState) *mdCapture {
	return func(src string, st *mdState) *mdCapture {
		if !st.inline {
			return nil
		}
		return regexCapture(re, src)
	}
}

func anyScopeRegex(re *regexp.Regexp) func(string, *mdState) *mdCapture {
	return func(src string, _ *mdState) *mdCapture {
		return regexCapture(re, src)
	}
}

func atLineStart(prev string) bool {
	return prev == "" || strings.HasSuffix(strings.TrimRight(prev, " "), "\n")
}

func inlineParse(p *mdParser, src string, st *mdState) []mdNode {
	inner := *st
	inner.inline = true
	return p.nested(src, inner)
}

func linkNode(target, display string) mdNode {
	return mdNode{kind: mdLink, url: target, children: []mdNode{textNode(display)}}
}

func autolinkNode(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	if target, display, ok := normalizeLink(c.groups[1]); ok {
		return []mdNode{linkNode(target, display)}
	}
	return []mdNode{textNode(c.groups[1])}
}

const (
	orderHeading    = 0
	orderCodeBlock  = 4
	orderBlockQuote = 6
	orderList       = 7
	orderNewline    = 10
	orderParagraph  = 11
	orderEscape     = 12
	orderAutolink   = 14
	orderMailto     = 15
	orderURL        = 16
	orderLink       = 17
	orderEm         = 21
	orderInlineCode = 23
	orderBr         = 24
	orderText       = 25
)

var labelRuleNames = []string{"text", "u", "strong", "em", "s", "inlineCode", "spoiler", "br", "timestamp"}

var markdownParser = func() *mdParser {
	rules := markdownRules()
	p := newMdParser(rules)
	var labelRules []*mdRule
	for _, rule := range rules {
		if slices.Contains(labelRuleNames, rule.name) {
			labelRules = append(labelRules, rule)
		}
	}
	p.label = newMdParser(labelRules)
	return p
}()

func markdownRules() []*mdRule {
	emQuality := func(c *mdCapture) float64 { return float64(len(c.all)) + 0.2 }
	return []*mdRule{
		{name: "heading", order: orderHeading, first: " #", match: matchHeading, parse: parseHeading},
		{name: "subtext", order: orderHeading, first: "-", match: matchSubtext, parse: parseSubtext},
		{name: "codeBlock", order: orderCodeBlock, first: "`", match: anyScopeRegex(reCodeBlock), parse: parseCodeBlock},
		{name: "customEmoji", order: orderCodeBlock, first: "<", match: anyScopeRegex(reCustomEmoji), parse: parseCustomEmoji},
		{name: "blockQuote", order: orderBlockQuote, first: " >", match: matchBlockQuote, parse: parseBlockQuote},
		{name: "list", order: orderList, first: "\n *-0123456789", match: matchList, parse: parseList},
		{name: "newline", order: orderNewline, first: "\n", match: matchNewline, parse: parseNewline},
		{name: "paragraph", order: orderParagraph, match: matchParagraph, parse: parseParagraph},
		{name: "escape", order: orderEscape, first: `\`, match: matchEscape, parse: parseEscape},
		{name: "autolink", order: orderAutolink, first: "<", match: matchAutolink, parse: autolinkNode},
		{name: "mailto", order: orderMailto, first: "<", match: inlineRegex(reMailto), parse: parseMailto},
		{name: "tel", order: orderMailto, first: "<", match: inlineRegex(reTel), parse: parseTel},
		{name: "channelOrMessageUrl", order: orderURL - 0.5, first: "h", match: matchChannelURL, parse: parseChannelURL},
		{name: "mediaPostLink", order: orderURL - 0.5, first: "h", match: anyScopeRegex(reThreadMessageURL), parse: parseMediaPostLink},
		{name: "url", order: orderURL, first: "hs", match: matchURL, parse: autolinkNode},
		{name: "link", order: orderLink, first: "[", match: matchLink, parse: parseLink},
		{name: "em", order: orderEm, quality: emQuality, match: matchEm, parse: parseEm},
		{name: "looseEm", order: orderEm, quality: emQuality, match: matchLooseEm, parse: parseEm},
		{name: "strong", order: orderEm, first: "*", quality: func(c *mdCapture) float64 { return float64(len(c.all)) + 0.1 },
			match: matchStrong, parse: markParser(markBold)},
		{name: "u", order: orderEm, first: "_", quality: func(c *mdCapture) float64 { return float64(len(c.all)) },
			match: matchUnderline, parse: markParser(markUnderline)},
		{name: "s", order: orderEm, first: "~", match: matchStrike, parse: markParser(markStrike)},
		{name: "inlineCode", order: orderInlineCode, first: "`", match: matchInlineCodeRule, parse: parseInlineCode},
		{name: "br", order: orderBr, first: " ", match: matchBr, parse: parseBr},
		{name: "timestamp", order: orderText - 1, first: "<", match: anyScopeRegex(reTimestamp), parse: parseTimestamp},
		{name: "text", order: orderText, match: matchText, parse: parseText},
		// Kept as text so the escape rule can't eat its backslash.
		{name: "emoticon", order: orderText, first: "¯", match: matchEmoticon, parse: parseEscape},
		{name: "roleMention", order: orderText, first: "<", match: anyScopeRegex(reRoleMention), parse: parseRoleMention},
		{name: "mention", order: orderText, first: "<@", match: anyScopeRegex(reMention), parse: parseMention},
		{name: "channelMention", order: orderText, first: "<", match: anyScopeRegex(reChannelMention), parse: parseChannelMention},
		{name: "commandMention", order: orderText, first: "<", match: anyScopeRegex(reCommandMention), parse: parseCommandMention},
		{name: "spoiler", order: orderText, first: "|", match: matchSpoiler, parse: parseSpoiler},
		{name: "staticRouteLink", order: orderText, first: "<", match: anyScopeRegex(reStaticRouteLink), parse: parseStaticRouteLink},
	}
}

var (
	reCodeBlock   = regexp.MustCompile("^```(?:([a-zA-Z0-9_+\\-.#]+?)\\n)?\\n*([^\\n](?s:.)*?)\\n*```")
	reCustomEmoji = regexp.MustCompile(`^<(a)?:(\w+):([0-9]+)>`)
	reMailto      = regexp.MustCompile(`^<([^` + jsSpaceClass + `<>@]+@[^` + jsSpaceClass + `<>@]+\.[^` + jsSpaceClass + `<>@]+)>`)
	reTel         = regexp.MustCompile(`^<((?:(?:tel|sms):\+?|\+)(?:[0-9]|\([0-9]+\))(?:[- ./]?(?:[0-9]|\([0-9]+\)))+)>`)
	reTelSpaces   = regexp.MustCompile(`[ /]+`)
	// The client's unescaped "." before "com": one UTF-16 unit other than a line terminator.
	discordHost        = `(?:(?:canary\.|ptb\.)?discord(?:app)?[^\n\r\x{2028}\x{2029}\x{10000}-\x{10ffff}]com|staging\.discord\.co)`
	reChannelURL       = regexp.MustCompile(`^https://` + discordHost + `/channels/([0-9]+|@me)(?:/([0-9]+|[a-zA-Z-]+))?(?:/([0-9]+|[a-zA-Z-]+))?`)
	reThreadMessageURL = regexp.MustCompile(`^https://` + discordHost + `/channels/([0-9]+)/([0-9]+)/threads/([0-9]+)/([0-9]+)`)
	// The client counts UTF-16 units, so one astral character is a long enough tail.
	reURL             = regexp.MustCompile(`^((?:https?|steam)://(?:[^` + jsSpaceClass + `<]+[^<.,:;"'\]` + jsSpaceClass + `]|[\x{10000}-\x{10ffff}]))`)
	reTimestamp       = regexp.MustCompile(`^<t:(-?[0-9]{1,17})(?::([tTdDfFsSR]))?>`)
	reRoleMention     = regexp.MustCompile(`^<@&([0-9]+)>`)
	reMention         = regexp.MustCompile(`^(?:<@!?([0-9]+)>|(@(?:everyone|here)))`)
	reChannelMention  = regexp.MustCompile(`^<#([0-9]+)>`)
	commandWord       = `[-_\p{L}\p{N}\p{Devanagari}\p{Thai}]{1,32}`
	reCommandMention  = regexp.MustCompile(`^</(` + commandWord + `(?: ` + commandWord + `)?(?: ` + commandWord + `)?):([0-9]+)>`)
	reStaticRouteLink = regexp.MustCompile(`^<id:(home|browse|customize|guide|linked-roles)(?::([0-9]+))?>`)
)

func matchHeading(src string, st *mdState) *mdCapture {
	if !st.allowHeading || !(st.prev == "" || strings.HasSuffix(st.prev, "\n")) {
		return nil
	}
	i := countByte(src, 0, ' ')
	hashes := countByte(src, i, '#')
	if hashes < 1 || hashes > 3 {
		return nil
	}
	p := i + hashes
	w := jsSpaceEnd(src, p)
	// The lookahead skips the same whitespace wherever \s+ stops, so it holds for all of them or none.
	if w == p || hashesThenSpace(src, w) {
		return nil
	}
	for q := w; q > p; {
		if end, e, ok := headingContent(src, q); ok {
			return newCapture(src[:end], src[i:p], src[q:e])
		}
		_, size := utf8.DecodeLastRuneInString(src[:q])
		q -= size
	}
	return nil
}

func hashesThenSpace(src string, i int) bool {
	n := countByte(src, i, '#')
	if n < 1 || n > 3 || i+n >= len(src) {
		return false
	}
	r, _ := utf8.DecodeRuneInString(src[i+n:])
	return isJSSpace(r)
}

func headingContent(src string, q int) (end, e int, ok bool) {
	if q >= len(src) || src[q] == '\n' {
		return 0, 0, false
	}
	_, size := utf8.DecodeRuneInString(src[q:])
	for e = q + size; ; {
		x := e + countByte(src, e, '#')
		y := jsSpaceEnd(src, x)
		if y == len(src) {
			return y, e, true
		}
		if nl := strings.LastIndexByte(src[x:y], '\n'); nl >= 0 {
			return x + nl + 1, e, true
		}
		if e >= len(src) || src[e] == '\n' {
			return 0, 0, false
		}
		_, size = utf8.DecodeRuneInString(src[e:])
		e += size
	}
}

func parseHeading(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	return []mdNode{{kind: mdHeading, level: len(c.groups[1]), children: inlineParse(p, jsTrim(c.groups[2]), st)}}
}

func matchSubtext(src string, st *mdState) *mdCapture {
	if st.noSubtext || !(st.prev == "" || strings.HasSuffix(st.prev, "\n")) {
		return nil
	}
	i := countByte(src, 0, ' ')
	if !strings.HasPrefix(src[i:], "-#") {
		return nil
	}
	i += 2
	spaces := countByte(src, i, ' ')
	if spaces == 0 {
		return nil
	}
	start := i + spaces
	if start == len(src) || src[start] == '\n' || strings.HasPrefix(src[start:], "-#") {
		// Backtracking gives the content one of the spaces.
		if spaces < 2 {
			return nil
		}
		start--
	}
	e := lineEnd(src, start)
	end := e
	if end < len(src) {
		end++
	}
	return newCapture(src[:end], src[start:e])
}

func parseSubtext(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	inner := *st
	inner.noSubtext = true
	return []mdNode{{kind: mdSubtext, children: inlineParse(p, jsTrim(c.groups[1]), &inner)}}
}

func parseCodeBlock(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{{kind: mdCodeBlock, lang: c.groups[1], text: c.groups[2]}}
}

func parseCustomEmoji(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{{kind: mdEmoji, name: c.groups[2], id: c.groups[3], animated: c.groups[1] == "a"}}
}

func matchBlockQuote(src string, st *mdState) *mdCapture {
	if st.inQuote || !atLineStart(st.prev) {
		return nil
	}
	i := countByte(src, 0, ' ')
	if strings.HasPrefix(src[i:], ">>>") && countByte(src, i+3, ' ') > 0 {
		return newCapture(src)
	}
	end, ok := quoteLine(src, 0)
	if !ok {
		return nil
	}
	for end < len(src) {
		next, ok := quoteLine(src, end+1)
		if !ok {
			break
		}
		end = next
	}
	if end < len(src) {
		end++
	}
	return newCapture(src[:end])
}

func quoteLine(src string, i int) (int, bool) {
	i += countByte(src, i, ' ')
	if i >= len(src) || src[i] != '>' || strings.HasPrefix(src[i+1:], ">>") {
		return 0, false
	}
	n := countByte(src, i+1, ' ')
	if n == 0 {
		return 0, false
	}
	return lineEnd(src, i+1+n), true
}

func parseBlockQuote(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	inner := *st
	inner.inQuote = true
	var content string
	if i := countByte(c.all, 0, ' '); strings.HasPrefix(c.all[i:], ">>>") {
		i += 3
		if i < len(c.all) && c.all[i] == ' ' {
			i++
		}
		content = c.all[i:]
	} else {
		content = stripQuoteMarkers(c.all)
		inner.inline = true
	}
	children := p.nested(content, inner)
	if len(children) == 0 {
		children = []mdNode{textNode(" ")}
	}
	return []mdNode{{kind: mdQuote, children: children}}
}

func isLineStart(s string, i int) bool {
	if i == 0 {
		return true
	}
	r, _ := utf8.DecodeLastRuneInString(s[:i])
	return isJSLineTerminator(r)
}

func stripQuoteMarkers(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); {
		if isLineStart(s, i) {
			if n := countByte(s, i, ' '); i+n < len(s) && s[i+n] == '>' {
				i += n + 1
				if i < len(s) && s[i] == ' ' {
					i++
				}
				if i >= len(s) {
					break
				}
			}
		}
		_, size := utf8.DecodeRuneInString(s[i:])
		b.WriteString(s[i : i+size])
		i += size
	}
	return b.String()
}

func matchList(src string, st *mdState) *mdCapture {
	if st.listLevel >= mdMaxListLevel {
		return nil
	}
	if src[0] == '\n' {
		if atLineStart(st.prev) {
			return nil
		}
		return matchListAt(src, 1)
	}
	if !atLineStart(st.prev) {
		return nil
	}
	return matchListAt(src, 0)
}

func matchListAt(src string, off int) *mdCapture {
	i := off + countByte(src, off, ' ')
	b, ok := bulletEnd(src, i)
	if !ok || b+1 >= len(src) || src[b] != ' ' {
		return nil
	}
	indent := src[off:i]
	_, size := utf8.DecodeRuneInString(src[b+1:])
	for e := b + 1 + size; ; {
		if e == len(src) {
			return newCapture(src, indent, src[i:b])
		}
		if src[e] == '\n' && endsList(src, e+1, indent) {
			return newCapture(src[:e+1], indent, src[i:b])
		}
		_, size = utf8.DecodeRuneInString(src[e:])
		e += size
	}
}

func endsList(src string, k int, indent string) bool {
	if k < len(src) && src[k] == ' ' {
		return false
	}
	if strings.HasPrefix(src[k:], indent) {
		if b, ok := bulletEnd(src, k+len(indent)); ok && b < len(src) && src[b] == ' ' {
			return false
		}
	}
	return true
}

func bulletEnd(s string, i int) (int, bool) {
	if i >= len(s) {
		return 0, false
	}
	if s[i] == '*' || s[i] == '-' {
		return i + 1, true
	}
	d := i
	for d < len(s) && isASCIIDigit(rune(s[d])) {
		d++
	}
	if d > i && d < len(s) && s[d] == '.' {
		return d + 1, true
	}
	return 0, false
}

func itemPrefix(s string) (width, indent int) {
	indent = countByte(s, 0, ' ')
	b, ok := bulletEnd(s, indent)
	if !ok {
		return 0, 0
	}
	n := countByte(s, b, ' ')
	if n == 0 {
		return 0, 0
	}
	return b + n, indent
}

func itemStarts(s string, i, indent int) bool {
	n := countByte(s, i, ' ')
	if n != indent && n != indent+1 {
		return false
	}
	b, ok := bulletEnd(s, i+n)
	return ok && b < len(s) && s[b] == ' '
}

func splitListItems(body string, indent int) []string {
	var items []string
	for pos := 0; pos < len(body); {
		start := -1
		for s := pos; s < len(body); s++ {
			if itemStarts(body, s, indent) {
				start = s
				break
			}
		}
		if start < 0 {
			break
		}
		e := lineEnd(body, start)
		for e < len(body) && !itemStarts(body, e+1, indent) {
			e = lineEnd(body, e+1)
		}
		if e < len(body) {
			e++
		}
		items = append(items, body[start:e])
		pos = e
	}
	return items
}

func unindentLines(s string, width int) string {
	var b strings.Builder
	for i := 0; i < len(s); {
		if isLineStart(s, i) {
			if n := min(countByte(s, i, ' '), width); n > 0 {
				i += n
				if i >= len(s) {
					break
				}
			}
		}
		_, size := utf8.DecodeRuneInString(s[i:])
		b.WriteString(s[i : i+size])
		i += size
	}
	return b.String()
}

func replaceTrailingNewline(s, repl string) string {
	if !strings.HasSuffix(s, "\n") {
		return s
	}
	k := len(s) - 1
	for k > 0 && s[k-1] == ' ' {
		k--
	}
	return s[:k] + repl
}

func trimItemText(s string) string {
	end := len(s)
	for end > 0 {
		r, size := utf8.DecodeLastRuneInString(s[:end])
		if !isJSSpace(r) {
			break
		}
		end -= size
	}
	if i := strings.IndexByte(s[end:], '\n'); i >= 0 {
		return s[:end+i]
	}
	return s
}

func listStart(digits string) int {
	digits = strings.TrimLeft(digits, "0")
	if len(digits) > 10 {
		return 1e9
	}
	n, _ := strconv.ParseInt(digits, 10, 64)
	return int(min(1e9, max(1, n)))
}

func parseList(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	bullet := c.groups[2]
	list := mdNode{kind: mdList, ordered: len(bullet) > 1, start: 1}
	if list.ordered {
		list.start = listStart(bullet[:len(bullet)-1])
	}

	body := strings.TrimPrefix(c.all, "\n")
	if trimmed := strings.TrimRight(body, "\n"); len(body)-len(trimmed) >= 2 {
		body = trimmed + "\n"
	}
	prefixWidth, indent := itemPrefix(body)
	rawItems := splitListItems(body, indent)

	lastWasLoose := false
	for index, item := range rawItems {
		width, _ := itemPrefix(item)
		content := unindentLines(item[width:], prefixWidth)
		loose := strings.Contains(content, "\n\n") || (index == len(rawItems)-1 && lastWasLoose)
		lastWasLoose = loose

		inner := *st
		inner.listLevel++
		inner.inline = !loose
		inner.allowHeading = false
		source := replaceTrailingNewline(content, "")
		if loose {
			source = replaceTrailingNewline(content, "\n\n")
		}
		nodes := p.nested(source, inner)
		for i := range nodes {
			if nodes[i].kind == mdText && !nodes[i].blockNewline {
				nodes[i] = textNode(trimItemText(nodes[i].text))
			}
		}
		list.items = append(list.items, nodes)
	}
	return []mdNode{list}
}

func matchNewline(src string, st *mdState) *mdCapture {
	if st.inline || src[0] != '\n' {
		return nil
	}
	end := 0
	for i := 0; i < len(src) && (src[i] == '\n' || src[i] == ' '); i++ {
		if src[i] == '\n' {
			end = i + 1
		}
	}
	if end == 0 {
		return nil
	}
	return newCapture(src[:end])
}

func parseNewline(*mdParser, *mdCapture, *mdState) []mdNode {
	return []mdNode{{kind: mdText, text: "\n", blockNewline: true}}
}

func matchParagraph(src string, st *mdState) *mdCapture {
	if st.inline {
		return nil
	}
	p := 0
	for p < len(src) && !(src[p] == '\n' && blankLineAt(src, p+1)) {
		p++
	}
	if p == 0 || p == len(src) {
		return nil
	}
	end := p
	for i := p; i < len(src) && (src[i] == '\n' || src[i] == ' '); i++ {
		if src[i] == '\n' {
			end = i + 1
		}
	}
	return newCapture(src[:end], src[:p])
}

func blankLineAt(s string, i int) bool {
	i += countByte(s, i, ' ')
	return i < len(s) && s[i] == '\n'
}

func parseParagraph(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	return []mdNode{{kind: mdParagraph, children: inlineParse(p, c.groups[1], st)}}
}

func matchEscape(src string, st *mdState) *mdCapture {
	if st.noEscape || !st.inline || len(src) < 2 {
		return nil
	}
	r, size := utf8.DecodeRuneInString(src[1:])
	if isASCIIAlnum(r) || isJSSpace(r) {
		return nil
	}
	c := newCapture(src[:1+size], src[1:1+size])
	c.astral = r > 0xffff
	return c
}

func parseEscape(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{textNode(c.groups[1])}
}

// By hand: on a run of "<" every attempt reads to the end, slowly in Go's regexp.
func matchAutolink(src string, st *mdState) *mdCapture {
	if !st.inline {
		return nil
	}
	j := 1
	for j < len(src) && src[j] != ':' && src[j] != ' ' && src[j] != '>' {
		j++
	}
	if j == 1 || j+1 >= len(src) || src[j] != ':' || src[j+1] != '/' {
		return nil
	}
	k := j + 2
	for k < len(src) && src[k] != ' ' && src[k] != '>' {
		k++
	}
	if k == j+2 || k >= len(src) || src[k] != '>' {
		return nil
	}
	return newCapture(src[:k+1], src[1:k])
}

func parseMailto(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	address := c.groups[1]
	target := address
	if !strings.HasPrefix(address, "mailto:") {
		target = "mailto:" + address
	}
	return []mdNode{linkNode(target, address)}
}

func parseTel(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	number := c.groups[1]
	target := reTelSpaces.ReplaceAllString(number, "-")
	if !strings.HasPrefix(target, "tel:") && !strings.HasPrefix(target, "sms:") {
		target = "tel:" + target
	}
	return []mdNode{linkNode(target, number)}
}

func isAllDigits(s string) bool {
	return strings.Trim(s, "0123456789") == ""
}

func matchChannelURL(src string, _ *mdState) *mdCapture {
	c := regexCapture(reChannelURL, src)
	if c == nil || (c.set[2] && !isAllDigits(c.groups[2])) || (c.set[3] && !isAllDigits(c.groups[3])) {
		return nil
	}
	return c
}

func parseChannelURL(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	if !c.set[2] {
		return []mdNode{linkNode(c.all, c.all)}
	}
	return []mdNode{{kind: mdChannelMention, id: c.groups[2], url: c.all}}
}

func parseMediaPostLink(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{{kind: mdChannelMention, id: c.groups[2], url: c.all}}
}

func matchURL(src string, st *mdState) *mdCapture {
	if !st.inline {
		return nil
	}
	c := regexCapture(reURL, src)
	if c == nil {
		return nil
	}
	// Only one unmatched trailing ")" is ever dropped.
	value := c.all
	searchFrom := 0
	for i := len(value) - 1; i >= 0 && value[i] == ')'; i-- {
		open := strings.IndexByte(value[searchFrom:], '(')
		if open < 0 {
			value = value[:len(value)-1]
			break
		}
		searchFrom += open + 1
	}
	c.all, c.groups[1] = value, value
	return c
}

// Astral characters count twice: the client's counters run over UTF-16 units.
func tooManyBrackets(s string) bool {
	depth, sinceParen, deep := 0, 0, 0
	for _, r := range s {
		units := 1
		if r > 0xffff {
			units = 2
		}
		for ; units > 0; units-- {
			if depth >= 2 {
				if deep++; deep > 100 {
					return true
				}
			} else {
				deep = 0
			}
		}
		switch r {
		case ')':
			sinceParen = 0
			continue
		case '[':
			if depth++; depth > 10 {
				return true
			}
		case ']':
			if depth > 0 {
				depth--
			}
		case '(':
		default:
			continue
		}
		if sinceParen++; sinceParen > 200 {
			return true
		}
	}
	return false
}

func matchLink(src string, st *mdState) *mdCapture {
	if !st.inline || !strings.Contains(src, "](") || tooManyBrackets(src) {
		return nil
	}
	bounds := linkLabelBounds(src)
	for i := len(bounds) - 1; i >= 0; i-- {
		b := bounds[i]
		if !strings.HasPrefix(src[b:], "](") {
			continue
		}
		if c := matchLinkHref(src, b+2); c != nil {
			c.groups[1], c.set[1] = src[1:b], true
			return c
		}
	}
	return nil
}

func linkLabelBounds(src string) []int {
	bounds := []int{1}
	for p := 1; p < len(src); {
		switch src[p] {
		case '[':
			j := strings.IndexByte(src[p+1:], ']')
			if j < 0 {
				return bounds
			}
			p += j + 2
		case ']':
			if j := strings.IndexAny(src[p+1:], "[]"); j < 0 || src[p+1+j] != ']' {
				return bounds
			}
			p++
		default:
			_, size := utf8.DecodeRuneInString(src[p:])
			p += size
		}
		bounds = append(bounds, p)
	}
	return bounds
}

func matchLinkHref(src string, p int) *mdCapture {
	for k := jsSpaceEnd(src, p); ; {
		starts := []int{k}
		if k < len(src) && src[k] == '<' {
			starts = []int{k + 1, k}
		}
		for _, u0 := range starts {
			for u := u0; ; {
				if c := matchLinkTail(src, u); c != nil {
					c.groups[2], c.set[2] = src[u0:u], true
					return c
				}
				next, ok := linkURLToken(src, u)
				if !ok {
					break
				}
				u = next
			}
		}
		if k == p {
			return nil
		}
		_, size := utf8.DecodeLastRuneInString(src[:k])
		k -= size
	}
}

func linkURLToken(src string, u int) (int, bool) {
	if u >= len(src) {
		return 0, false
	}
	switch src[u] {
	case '(':
		if j := strings.IndexByte(src[u+1:], ')'); j >= 0 {
			return u + j + 2, true
		}
		return 0, false
	case ')':
		return 0, false
	case '\\':
		if u+1 < len(src) {
			if r, size := utf8.DecodeRuneInString(src[u+1:]); !isJSLineTerminator(r) {
				return u + 1 + size, true
			}
		}
		return 0, false
	}
	r, size := utf8.DecodeRuneInString(src[u:])
	if isJSSpace(r) {
		return 0, false
	}
	return u + size, true
}

func matchLinkTail(src string, u int) *mdCapture {
	starts := []int{u}
	if u < len(src) && src[u] == '>' {
		starts = []int{u + 1, u}
	}
	for _, v := range starts {
		if x := jsSpaceEnd(src, v); x > v && x < len(src) && (src[x] == '"' || src[x] == '\'') {
			for t := x + 1; t < len(src); t++ {
				if src[t] != '"' && src[t] != '\'' {
					continue
				}
				if y := jsSpaceEnd(src, t+1); y < len(src) && src[y] == ')' {
					c := &mdCapture{all: src[:y+1]}
					c.groups[3], c.set[3] = src[x+1:t], true
					return c
				}
			}
		}
		if y := jsSpaceEnd(src, v); y < len(src) && src[y] == ')' {
			return &mdCapture{all: src[:y+1]}
		}
	}
	return nil
}

type labelKind uint16

const (
	kindText labelKind = 1 << iota
	kindUnderline
	kindBold
	kindItalic
	kindStrike
	kindCode
	kindSpoiler
	kindBr
	kindTimestamp
	kindEmoji
	kindList
	kindHeading
	kindQuote
	kindSubtext

	labelKinds = kindText | kindUnderline | kindBold | kindItalic | kindStrike | kindCode | kindSpoiler | kindBr | kindTimestamp
	blockKinds = kindList | kindHeading | kindQuote | kindSubtext
	titleKinds = labelKinds | kindEmoji | blockKinds
)

func (n *mdNode) labelKind() labelKind {
	switch n.kind {
	case mdMark:
		return [...]labelKind{markBold: kindBold, markItalic: kindItalic, markUnderline: kindUnderline,
			markStrike: kindStrike, markSpoiler: kindSpoiler}[n.mark]
	case mdText:
		return kindText
	case mdCode:
		return kindCode
	case mdBr:
		return kindBr
	case mdTimestamp:
		return kindTimestamp
	case mdEmoji:
		return kindEmoji
	case mdList:
		return kindList
	case mdHeading:
		return kindHeading
	case mdQuote:
		return kindQuote
	case mdSubtext:
		return kindSubtext
	}
	return 0
}

func nodesAllowed(nodes []mdNode, kinds labelKind) bool {
	for i := range nodes {
		n := &nodes[i]
		if n.labelKind()&kinds == 0 {
			return false
		}
		if n.kind == mdCode && !nodesAllowed(n.codeContent, kinds) {
			return false
		}
		if n.hasChildren() && !nodesAllowed(n.children, kinds) {
			return false
		}
	}
	return true
}

func flattenLabel(nodes []mdNode) string {
	var b strings.Builder
	for _, n := range nodes {
		switch n.kind {
		case mdText, mdCode:
			b.WriteString(n.text)
		case mdEmoji:
			b.WriteString(":" + n.name + ":")
		case mdBr:
			b.WriteString("\n")
		case mdMark:
			b.WriteString(flattenLabel(n.children))
		case mdTimestamp:
			b.WriteString("<timestamp>")
		case mdQuote:
			b.WriteString("<quoteContent>")
		case mdList:
			b.WriteString("<listContent>")
		case mdHeading:
			b.WriteString("<headingContent>")
		case mdSubtext:
			b.WriteString("<subtextContent>")
		}
	}
	return b.String()
}

func parseLink(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	rawLabel, rawURL, rawTitle, hasTitle := c.groups[1], c.groups[2], c.groups[3], c.set[3]
	asText := []mdNode{textNode(c.all)}

	if st.validation != nil {
		st.validation.nestedLink = true
		return asText
	}
	if isSuspiciousURL(rawURL) {
		return asText
	}
	label := sanitizeFully(rawLabel)
	if jsTrim(sanitizeWhitespace(rawURL)) == "" || jsTrim(label) == "" {
		return asText
	}
	target, _, ok := normalizeLink(unescapeURL(rawURL))
	if !ok || (hasTitle && containsDiscordLink(foldHomoglyphs(rawTitle))) {
		return asText
	}

	labelState := *st
	labelState.noEscape = true
	labelState.codeContent = true
	validation := &linkValidation{}
	validationState := labelState
	validationState.validation = validation
	allowed := labelKinds | blockKinds

	labelNodes := p.nested(label, validationState)
	if validation.nestedLink || !nodesAllowed(labelNodes, allowed) {
		return asText
	}
	titleNodes := p.nested(sanitizeFully(rawTitle), validationState)
	if validation.nestedLink || !nodesAllowed(titleNodes, titleKinds) {
		return asText
	}
	flat := flattenLabel(labelNodes)
	if jsTrim(flat) == "" || containsDiscordLink(flat) {
		return asText
	}
	if flat != label {
		if containsDiscordLink(label) {
			return asText
		}
		reparsed := p.nested(flat, validationState)
		if validation.nestedLink || !nodesAllowed(reparsed, allowed) {
			return asText
		}
	}

	labelState.prev = ""
	children := p.label.nested(mdPreprocess(sanitizeWhitespace(rawLabel)), labelState)
	return []mdNode{{kind: mdLink, url: target, title: sanitizeWhitespace(rawTitle), children: children}}
}

func matchEmUnderscore(src string) *mdCapture {
	p := 1
	for first := true; ; first = false {
		if !first && p < len(src) && src[p] == '_' && (p+1 == len(src) || !isWordByte(src[p+1])) {
			return newCapture(src[:p+1], src[1:p])
		}
		if p >= len(src) {
			return nil
		}
		switch src[p] {
		case '_':
			if p+1 >= len(src) || src[p+1] != '_' {
				return nil
			}
			p += 2
		case '\\':
			if p+1 >= len(src) {
				return nil
			}
			_, size := utf8.DecodeRuneInString(src[p+1:])
			p += 1 + size
		default:
			_, size := utf8.DecodeRuneInString(src[p:])
			p += size
		}
	}
}

func matchEmStar(src string, loose bool) *mdCapture {
	if len(src) < 2 {
		return nil
	}
	if r, _ := utf8.DecodeRuneInString(src[1:]); isJSSpace(r) {
		return nil
	}
	closes := func(i int) bool { return i < len(src) && src[i] == '*' && (i+1 == len(src) || src[i+1] != '*') }
	p := 1
	for first := true; ; first = false {
		if !first {
			if !loose && closes(p) {
				return newCapture(src[:p+1], src[1:p])
			}
			if loose && p < len(src) && src[p] == ' ' {
				if p+1 < len(src) && src[p+1] == ' ' && closes(p+2) {
					return newCapture(src[:p+3], src[1:p])
				}
				if closes(p + 1) {
					return newCapture(src[:p+2], src[1:p])
				}
			}
		}
		next, ok := emStarToken(src, p)
		if !ok {
			return nil
		}
		p = next
	}
}

func emStarToken(src string, p int) (int, bool) {
	if p >= len(src) {
		return 0, false
	}
	if r, _ := utf8.DecodeRuneInString(src[p:]); isJSSpace(r) {
		p = jsSpaceEnd(src, p)
		if p >= len(src) {
			return 0, false
		}
	}
	switch src[p] {
	case '*':
		if p+1 < len(src) && src[p+1] == '*' {
			return p + 2, true
		}
		return 0, false
	case '\\':
		if p+1 >= len(src) {
			return 0, false
		}
		_, size := utf8.DecodeRuneInString(src[p+1:])
		return p + 1 + size, true
	}
	_, size := utf8.DecodeRuneInString(src[p:])
	return p + size, true
}

func matchEm(src string, st *mdState) *mdCapture {
	if !st.inline {
		return nil
	}
	switch src[0] {
	case '_':
		return matchEmUnderscore(src)
	case '*':
		return matchEmStar(src, false)
	}
	return nil
}

func matchLooseEm(src string, st *mdState) *mdCapture {
	if !st.inline || src[0] != '*' {
		return nil
	}
	return matchEmStar(src, true)
}

func parseEm(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	return []mdNode{{kind: mdMark, mark: markItalic, children: p.nested(c.groups[1], *st)}}
}

func matchDoubled(src string, d byte) *mdCapture {
	if len(src) < 2 || src[0] != d || src[1] != d {
		return nil
	}
	p := 2
	for first := true; ; first = false {
		if !first && p+1 < len(src) && src[p] == d && src[p+1] == d && (p+2 == len(src) || src[p+2] != d) {
			return newCapture(src[:p+2], src[2:p])
		}
		if p >= len(src) {
			return nil
		}
		if src[p] == '\\' {
			if p+1 >= len(src) {
				return nil
			}
			p++
		}
		_, size := utf8.DecodeRuneInString(src[p:])
		p += size
	}
}

func matchStrong(src string, st *mdState) *mdCapture {
	if !st.inline {
		return nil
	}
	return matchDoubled(src, '*')
}

func matchUnderline(src string, st *mdState) *mdCapture {
	if !st.inline {
		return nil
	}
	return matchDoubled(src, '_')
}

func matchStrike(src string, st *mdState) *mdCapture {
	if !st.inline || len(src) < 3 || !strings.HasPrefix(src, "~~") {
		return nil
	}
	_, size := utf8.DecodeRuneInString(src[2:])
	for p := 2 + size; p+1 < len(src); p++ {
		if src[p] == '~' && src[p+1] == '~' && (p+2 == len(src) || src[p+2] != '_') {
			return newCapture(src[:p+2], src[2:p])
		}
	}
	return nil
}

func markParser(mark markType) func(*mdParser, *mdCapture, *mdState) []mdNode {
	return func(p *mdParser, c *mdCapture, st *mdState) []mdNode {
		return []mdNode{{kind: mdMark, mark: mark, children: inlineParse(p, c.groups[1], st)}}
	}
}

// Same result as the client's regex, without its cubic backtracking.
func matchInlineCode(src string) *mdCapture {
	open := countByte(src, 0, '`')
	if open == 0 || !strings.Contains(src[open:], "`") {
		return nil
	}
	type run struct{ start, length int }
	var runs []run
	for i := open; i < len(src); {
		if src[i] != '`' {
			i++
			continue
		}
		n := countByte(src, i, '`')
		runs = append(runs, run{i, n})
		i += n
	}
	for size := open; size >= 1; size-- {
		for _, r := range runs {
			if r.length == size {
				return newCapture(src[:r.start+size], src[:size], src[size:r.start])
			}
		}
	}
	return nil
}

func matchInlineCodeRule(src string, st *mdState) *mdCapture {
	if !st.inline {
		return nil
	}
	return matchInlineCode(src)
}

func trimCodeSpaces(code string) string {
	lead := strings.HasPrefix(code, " ") && strings.HasPrefix(strings.TrimLeft(code[1:], " "), "`")
	trail := strings.HasSuffix(code, " ") && strings.HasSuffix(strings.TrimRight(code, " "), "`")
	if trail {
		code = code[:len(code)-1]
	}
	if lead {
		code = code[1:]
	}
	return code
}

func parseInlineCode(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	node := mdNode{kind: mdCode, text: trimCodeSpaces(c.groups[2])}
	if st.codeContent && st.validation != nil {
		node.codeContent = p.nested(node.text, *st)
	}
	return []mdNode{node}
}

func matchBr(src string, _ *mdState) *mdCapture {
	n := countByte(src, 0, ' ')
	if n < 2 || n >= len(src) || src[n] != '\n' {
		return nil
	}
	return newCapture(src[:n+1])
}

func parseBr(*mdParser, *mdCapture, *mdState) []mdNode {
	return []mdNode{{kind: mdBr}}
}

// Past this, Date can't represent the time and the client leaves the tag as text.
const maxTimestampSeconds = 8.64e12

func parseTimestamp(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	unix, err := strconv.ParseInt(c.groups[1], 10, 64)
	if err != nil || unix > maxTimestampSeconds || unix < -maxTimestampSeconds {
		return []mdNode{textNode(c.all)}
	}
	style := byte('f')
	if c.set[2] {
		style = c.groups[2][0]
	}
	return []mdNode{{kind: mdTimestamp, unix: unix, style: style}}
}

func matchText(src string, _ *mdState) *mdCapture {
	_, size := utf8.DecodeRuneInString(src)
	return newCapture(src[:textEnd(src, size)])
}

// Astral characters never end text: to the client they are surrogates, in U+00C0-U+FFFF.
func textEnd(src string, from int) int {
	spaceEnd, wordEnd, digitEnd := -1, -1, -1
	wordStop, digitStop := false, false
	for i := from; i < len(src); i++ {
		c := src[i]
		if c >= utf8.RuneSelf {
			r, size := utf8.DecodeRuneInString(src[i:])
			if r < 0xc0 && r != 0xa0 {
				return i
			}
			i += size - 1
			continue
		}
		switch {
		case c == ' ':
			if i >= spaceEnd {
				spaceEnd = i + countByte(src, i, ' ')
			}
			if spaceEnd-i >= 2 && spaceEnd < len(src) && src[spaceEnd] == '\n' {
				return i
			}
		case c == '\n':
			if i+1 < len(src) && src[i+1] == '\n' {
				return i
			}
		case c == '\t' || c == '\v' || c == '\f' || c == '\r':
		case isASCIIAlnum(rune(c)):
			if i >= wordEnd {
				wordEnd = i + 1
				for wordEnd < len(src) && isWordByte(src[wordEnd]) {
					wordEnd++
				}
				wordStop = false
				if wordEnd+1 < len(src) && src[wordEnd] == ':' {
					r, _ := utf8.DecodeRuneInString(src[wordEnd+1:])
					wordStop = !isJSSpace(r)
				}
			}
			if wordStop {
				return i
			}
			if isASCIIDigit(rune(c)) {
				if i >= digitEnd {
					digitEnd = i + countDigits(src, i)
					digitStop = digitEnd < len(src) && src[digitEnd] == '.'
				}
				if digitStop {
					return i
				}
			}
		default:
			return i
		}
	}
	return len(src)
}

func countDigits(s string, i int) int {
	n := 0
	for i+n < len(s) && isASCIIDigit(rune(s[i+n])) {
		n++
	}
	return n
}

func parseText(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{textNode(c.all)}
}

const emoticonShrug = `¯\_(ツ)_/¯`

func matchEmoticon(src string, _ *mdState) *mdCapture {
	if !strings.HasPrefix(src, emoticonShrug) {
		return nil
	}
	return newCapture(emoticonShrug, emoticonShrug)
}

func parseRoleMention(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{{kind: mdRoleMention, id: c.groups[1]}}
}

func parseMention(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	if c.set[1] {
		return []mdNode{{kind: mdUserMention, id: c.groups[1]}}
	}
	return []mdNode{{kind: mdGlobalMention, name: strings.TrimPrefix(c.groups[2], "@")}}
}

func parseChannelMention(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{{kind: mdChannelMention, id: c.groups[1]}}
}

func parseCommandMention(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{{kind: mdCommandMention, name: c.groups[1], id: c.groups[2]}}
}

func matchSpoiler(src string, _ *mdState) *mdCapture {
	if len(src) < 3 || !strings.HasPrefix(src, "||") {
		return nil
	}
	i := strings.Index(src[3:], "||")
	if i < 0 {
		return nil
	}
	return newCapture(src[:i+5], src[2:i+3])
}

func parseSpoiler(p *mdParser, c *mdCapture, st *mdState) []mdNode {
	return []mdNode{{kind: mdMark, mark: markSpoiler, children: p.nested(c.groups[1], *st)}}
}

func parseStaticRouteLink(_ *mdParser, c *mdCapture, _ *mdState) []mdNode {
	return []mdNode{{kind: mdGuildNav, name: c.groups[1]}}
}
