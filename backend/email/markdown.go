package email

// Renders Discord message formatting as HTML or plain text.
//
// Go's regexp has no lookahead, so the paired-delimiter rules are hand-scanned
// rather than matched. Input is not escaped before parsing — that would turn
// `<@123>` into `&lt;@123&gt;` and break every `<` rule; the emitters escape leaves
// and attributes instead.

import (
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type mdKind int

const (
	kindText mdKind = iota
	kindCode
	kindCodeBlock
	kindUserMention
	kindRoleMention
	kindChannelMention
	kindGlobalMention
	kindEmoji
	kindTimestamp
	kindMark
	kindLink
	kindHeading
	kindSubtext
	kindQuote
)

type mdMark int

const (
	markBold mdMark = iota
	markItalic
	markUnderline
	markStrike
	markSpoiler
)

type mdNode struct {
	kind     mdKind
	value    string // text, code, mention id, emoji name, "everyone"/"here"
	lang     string // codeBlock
	mark     mdMark // mark
	url      string // link
	level    int    // heading, 1-3
	unix     int64  // timestamp
	animated bool   // emoji
	children []mdNode
}

func textNode(value string) mdNode {
	return mdNode{kind: kindText, value: value}
}

func markNode(m mdMark, body string) mdNode {
	return mdNode{kind: kindMark, mark: m, children: parseInline(body)}
}

func RenderDiscordMarkdown(src string) string {
	var sb strings.Builder
	renderHTML(parseDiscordMarkdown(src), &sb)
	return sb.String()
}

func RenderDiscordMarkdownText(src string) string {
	var sb strings.Builder
	renderText(parseDiscordMarkdown(src), &sb)
	return strings.TrimSpace(sb.String())
}

func parseDiscordMarkdown(input string) []mdNode {
	if input == "" {
		return nil
	}
	return parseBlocks(reCarriageReturn.ReplaceAllString(input, "\n"), true)
}

var (
	reCarriageReturn = regexp.MustCompile(`\r\n?`)
	reTripleQuote    = regexp.MustCompile("(?:^|\n) *>>> ")
	reFence          = regexp.MustCompile("(?s)```(?:([A-Za-z0-9+#._-]*)\n)?(.*?)```\n?")
	reHeading        = regexp.MustCompile(`^ {0,3}(#{1,3}) (.*)$`)
	reSubtext        = regexp.MustCompile(`^ {0,3}-# (.*)$`)
)

func parseBlocks(src string, allowTriple bool) []mdNode {
	// `>>> ` quotes everything after it, fences included, so it runs first. A nested
	// `>>>` is literal, which is what allowTriple=false on the recursion gives.
	if allowTriple {
		if loc := reTripleQuote.FindStringIndex(src); loc != nil {
			var out []mdNode
			if head := src[:loc[0]]; head != "" {
				out = parseBlocks(head, false)
			}
			return append(out, mdNode{kind: kindQuote, children: parseBlocks(src[loc[1]:], false)})
		}
	}

	var out []mdNode
	last := 0

	for _, m := range reFence.FindAllStringSubmatchIndex(src, -1) {
		if m[0] > last {
			// Drop the newline that ended the preceding text run.
			out = append(out, parseLines(strings.TrimSuffix(src[last:m[0]], "\n"))...)
		}

		var lang, code string
		if m[2] >= 0 {
			lang = src[m[2]:m[3]]
		}
		if m[4] >= 0 {
			code = src[m[4]:m[5]]
		}
		// One trailing newline only; trimming all whitespace would eat indentation.
		out = append(out, mdNode{kind: kindCodeBlock, lang: lang, value: strings.TrimSuffix(code, "\n")})
		last = m[1]
	}

	if last < len(src) {
		out = append(out, parseLines(src[last:])...)
	}
	return out
}

func parseLines(src string) []mdNode {
	if src == "" {
		return nil
	}

	var out []mdNode
	var buf []string
	lines := strings.Split(src, "\n")

	flush := func() {
		if len(buf) > 0 {
			out = append(out, parseInline(strings.Join(buf, "\n"))...)
			buf = nil
		}
	}

	for i := 0; i < len(lines); i++ {
		line := lines[i]

		if m := reHeading.FindStringSubmatch(line); m != nil {
			flush()
			out = append(out, mdNode{kind: kindHeading, level: len(m[1]), children: parseInline(m[2])})
			continue
		}

		if m := reSubtext.FindStringSubmatch(line); m != nil {
			flush()
			out = append(out, mdNode{kind: kindSubtext, children: parseInline(m[1])})
			continue
		}

		if quoted, ok := matchQuoteLine(line); ok {
			flush()
			body := []string{quoted}
			// Stops at the first non-quote line, so `> a\n\n> b` is two quotes.
			for i+1 < len(lines) {
				ahead, ok := matchQuoteLine(lines[i+1])
				if !ok {
					break
				}
				body = append(body, ahead)
				i++
			}
			out = append(out, mdNode{kind: kindQuote, children: parseInline(strings.Join(body, "\n"))})
			continue
		}

		buf = append(buf, line)
	}

	flush()
	return out
}

func matchQuoteLine(line string) (string, bool) {
	i := 0
	for i < 3 && i < len(line) && line[i] == ' ' {
		i++
	}
	if i >= len(line) || line[i] != '>' {
		return "", false
	}
	i++

	// `>>> ` is the triple quote, handled in parseBlocks.
	if strings.HasPrefix(line[i:], ">>") {
		return "", false
	}

	start := i
	for i < len(line) && line[i] == ' ' {
		i++
	}
	if i == start {
		return "", false
	}
	return line[i:], true
}

type inlineRule func(src string, at int) (mdNode, int, bool)

var (
	// Populated in init rather than inline: the rules call parseInline, which reads
	// this map back, and Go rejects that as an initialization cycle.
	inlineRules map[byte][]inlineRule

	// First character of every rule above, plus the escape marker.
	triggers [256]bool
)

func init() {
	// Rules under different keys can't collide, so only the order within a key
	// matters: `**` before `*`, `__` before `_`, role mentions before user mentions.
	inlineRules = map[byte][]inlineRule{
		'`': {matchCodeSpan},
		'|': {matchSpoiler},
		'*': {matchBold, matchItalicStar},
		'_': {matchUnderline, matchItalicUnderscore},
		'~': {matchStrike},
		'<': {matchEmoji, matchTimestamp, matchRoleMention, matchUserMention, matchChannelMention, matchAngleLink},
		'@': {matchGlobalMention},
		'[': {matchMaskedLink},
		'h': {matchBareLink},
	}

	triggers['\\'] = true
	for c := range inlineRules {
		triggers[c] = true
	}
}

var reEscape = regexp.MustCompile(`^\\([^0-9A-Za-z\s])`)

func parseInline(src string) []mdNode {
	var out []mdNode
	var buf strings.Builder
	cursor := 0

	flush := func() {
		if buf.Len() > 0 {
			out = append(out, textNode(buf.String()))
			buf.Reset()
		}
	}

	for cursor < len(src) {
		c := src[cursor]

		if c == '\\' {
			if m := reEscape.FindStringSubmatch(src[cursor:]); m != nil {
				buf.WriteString(m[1])
				cursor += len(m[0])
				continue
			}
		}

		matched := false
		for _, rule := range inlineRules[c] {
			node, end, ok := rule(src, cursor)
			// Require forward progress; a zero-length match would spin forever.
			if !ok || end <= cursor {
				continue
			}
			flush() // before the append, or text comes out in the wrong order
			out = append(out, node)
			cursor = end
			matched = true
			break
		}
		if matched {
			continue
		}

		next := cursor + 1
		for next < len(src) && !triggers[src[next]] {
			next++
		}
		buf.WriteString(src[cursor:next])
		cursor = next
	}

	flush()
	return out
}

// matchPair handles the delimiters whose body is any run of characters. guard rejects
// a closing run followed by another delimiter character; strike and spoiler skip it
// because Discord allows a stray `~`, making `~~~a~~~` render as <s>~a</s>~.
func matchPair(src string, at int, delim string, m mdMark, guard bool) (mdNode, int, bool) {
	if !strings.HasPrefix(src[at:], delim) {
		return mdNode{}, 0, false
	}

	n := len(delim)
	// The body needs at least one character, hence the extra +1.
	for i := at + n + 1; i+n <= len(src); i++ {
		if !strings.HasPrefix(src[i:], delim) {
			continue
		}
		if guard && i+n < len(src) && src[i+n] == delim[0] {
			continue
		}
		return markNode(m, src[at+n:i]), i + n, true
	}
	return mdNode{}, 0, false
}

func matchBold(src string, at int) (mdNode, int, bool) {
	return matchPair(src, at, "**", markBold, true)
}

func matchUnderline(src string, at int) (mdNode, int, bool) {
	return matchPair(src, at, "__", markUnderline, true)
}

func matchStrike(src string, at int) (mdNode, int, bool) {
	return matchPair(src, at, "~~", markStrike, false)
}

func matchSpoiler(src string, at int) (mdNode, int, bool) {
	return matchPair(src, at, "||", markSpoiler, false)
}

// The opening guard is what keeps `5 * 3 = 15` from italicising.
func matchItalicStar(src string, at int) (mdNode, int, bool) {
	if at+1 >= len(src) || src[at+1] == '*' || isSpaceByte(src[at+1]) {
		return mdNode{}, 0, false
	}

	for i := at + 1; i < len(src); i++ {
		if src[i] != '*' {
			continue
		}
		if i+1 < len(src) && src[i+1] == '*' {
			// Part of the body, not a closing delimiter.
			i++
			continue
		}
		return markNode(markItalic, src[at+1:i]), i + 1, true
	}
	return mdNode{}, 0, false
}

// The word-character guards are what keep snake_case_words plain. A lone `_` can't
// appear in the body, so a failed closing guard fails the whole match.
func matchItalicUnderscore(src string, at int) (mdNode, int, bool) {
	if at > 0 && isWordByte(src[at-1]) {
		return mdNode{}, 0, false
	}

	for i := at + 1; i < len(src); i++ {
		if src[i] != '_' {
			continue
		}
		if i+1 < len(src) && src[i+1] == '_' {
			i++
			continue
		}
		if i == at+1 {
			return mdNode{}, 0, false
		}
		if i+1 < len(src) && isWordByte(src[i+1]) {
			return mdNode{}, 0, false
		}
		return markNode(markItalic, src[at+1:i]), i + 1, true
	}
	return mdNode{}, 0, false
}

// Contents are terminal and never re-parsed. Requiring a non-backtick before the
// close, and rejecting one followed by a backtick, is what stops an unclosed ```
// fence being eaten as a one-backtick span.
func matchCodeSpan(src string, at int) (mdNode, int, bool) {
	n := 1
	if at+1 < len(src) && src[at+1] == '`' {
		n = 2
	}
	delim := src[at : at+n]

	for i := at + n + 1; i+n <= len(src); i++ {
		if !strings.HasPrefix(src[i:], delim) {
			continue
		}
		if src[i-1] == '`' {
			continue
		}
		if i+n < len(src) && src[i+n] == '`' {
			continue
		}
		return mdNode{kind: kindCode, value: src[at+n : i]}, i + n, true
	}
	return mdNode{}, 0, false
}

var (
	reEmoji          = regexp.MustCompile(`^<(a)?:(\w+):(\d+)>`)
	reTimestamp      = regexp.MustCompile(`^<t:(-?\d+)(?::([tTdDfFR]))?>`)
	reRoleMention    = regexp.MustCompile(`^<@&(\d+)>`)
	reUserMention    = regexp.MustCompile(`^<@!?(\d+)>`)
	reChannelMention = regexp.MustCompile(`^<#(\d+)>`)
	reAngleLink      = regexp.MustCompile(`^<(https?://[^\s<>]+)>`)
	reGlobalMention  = regexp.MustCompile(`^@(everyone|here)\b`)
	reMaskedLink = regexp.MustCompile(`^\[((?:[^\][]|\[[^\]]*\])+)\]\((?:<(https?://[^\s<>]+)>|((?:[^()\s]|\([^()\s]*\))+))\)`)
	// The final class excludes trailing punctuation, so `(https://example.com/x.)`
	// keeps the `.)`.
	reBareLink = regexp.MustCompile(`^https?://[^\s<]*[^<.,:;"')\]\s]`)
)

func matchEmoji(src string, at int) (mdNode, int, bool) {
	m := reEmoji.FindStringSubmatch(src[at:])
	if m == nil {
		return mdNode{}, 0, false
	}
	return mdNode{kind: kindEmoji, value: m[2], url: m[3], animated: m[1] == "a"}, at + len(m[0]), true
}

// Past this a formatted date is nonsense, so the tag is left literal.
const maxTimestampSeconds = 8.64e12

func matchTimestamp(src string, at int) (mdNode, int, bool) {
	m := reTimestamp.FindStringSubmatch(src[at:])
	if m == nil {
		return mdNode{}, 0, false
	}

	unix, err := strconv.ParseInt(m[1], 10, 64)
	if err != nil || unix > maxTimestampSeconds || unix < -maxTimestampSeconds {
		return textNode(m[0]), at + len(m[0]), true
	}
	return mdNode{kind: kindTimestamp, unix: unix}, at + len(m[0]), true
}

func matchRoleMention(src string, at int) (mdNode, int, bool) {
	m := reRoleMention.FindStringSubmatch(src[at:])
	if m == nil {
		return mdNode{}, 0, false
	}
	return mdNode{kind: kindRoleMention, value: m[1]}, at + len(m[0]), true
}

func matchUserMention(src string, at int) (mdNode, int, bool) {
	m := reUserMention.FindStringSubmatch(src[at:])
	if m == nil {
		return mdNode{}, 0, false
	}
	return mdNode{kind: kindUserMention, value: m[1]}, at + len(m[0]), true
}

func matchChannelMention(src string, at int) (mdNode, int, bool) {
	m := reChannelMention.FindStringSubmatch(src[at:])
	if m == nil {
		return mdNode{}, 0, false
	}
	return mdNode{kind: kindChannelMention, value: m[1]}, at + len(m[0]), true
}

func matchAngleLink(src string, at int) (mdNode, int, bool) {
	m := reAngleLink.FindStringSubmatch(src[at:])
	if m == nil {
		return mdNode{}, 0, false
	}
	return buildLink(m[1], m[0], nil), at + len(m[0]), true
}

// The left guard stops support@here.example.com growing an @here pill.
func matchGlobalMention(src string, at int) (mdNode, int, bool) {
	if at > 0 && (isWordByte(src[at-1]) || src[at-1] == '@') {
		return mdNode{}, 0, false
	}
	m := reGlobalMention.FindStringSubmatch(src[at:])
	if m == nil {
		return mdNode{}, 0, false
	}
	return mdNode{kind: kindGlobalMention, value: m[1]}, at + len(m[0]), true
}

func matchMaskedLink(src string, at int) (mdNode, int, bool) {
	m := reMaskedLink.FindStringSubmatch(src[at:])
	if m == nil {
		return mdNode{}, 0, false
	}
	rawURL := m[2]
	if rawURL == "" {
		rawURL = m[3]
	}
	return buildLink(rawURL, m[0], &m[1]), at + len(m[0]), true
}

func matchBareLink(src string, at int) (mdNode, int, bool) {
	m := reBareLink.FindString(src[at:])
	if m == "" {
		return mdNode{}, 0, false
	}
	return buildLink(m, m, nil), at + len(m), true
}

// buildLink falls back to the raw source for unsafe URLs, so the text stays visible.
func buildLink(rawURL, raw string, label *string) mdNode {
	if !isSafeURL(rawURL) {
		return textNode(raw)
	}

	children := []mdNode{textNode(rawURL)}
	if label != nil {
		children = parseInline(*label)
	}
	return mdNode{kind: kindLink, url: rawURL, children: children}
}

// url.Parse accepts "/foo" with an empty scheme, so a host is required too.
func isSafeURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func isWordByte(c byte) bool {
	return c == '_' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

func isSpaceByte(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'
}

// Inline styles throughout, since email clients strip <style> blocks.
const (
	styleCode      = `background-color:#111827;color:#e5e7eb;padding:2px 6px;border-radius:4px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;`
	stylePre       = `background-color:#111827;border:1px solid #374151;border-radius:6px;padding:12px;margin:8px 0;overflow-x:auto;`
	stylePreCode   = `color:#e5e7eb;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;`
	styleSubtext   = `font-size:12px;line-height:1.5;color:#9ca3af;`
	styleLink      = `color:#60a5fa;text-decoration:underline;`
	styleUserPill  = `background-color:#1e3a5f;color:#93c5fd;padding:0 4px;border-radius:3px;`
	styleRolePill  = `background-color:#33363b;color:#b9bbbe;padding:0 4px;border-radius:3px;font-weight:500;`
	styleChanPill  = `background-color:#374151;color:#d1d5db;padding:0 4px;border-radius:3px;`
	styleTimestamp = `background-color:#374151;border-radius:3px;padding:0 4px;`
	// Email has no click handler, so spoilers are rendered revealed.
	styleSpoiler = `background-color:#374151;border-radius:3px;padding:0 3px;`
)

var headingStyles = map[int]string{
	1: `font-size:22px;font-weight:700;color:#ffffff;margin:8px 0 4px 0;`,
	2: `font-size:19px;font-weight:700;color:#ffffff;margin:8px 0 4px 0;`,
	3: `font-size:17px;font-weight:700;color:#ffffff;margin:8px 0 4px 0;`,
}

func renderHTML(nodes []mdNode, sb *strings.Builder) {
	for _, n := range nodes {
		renderNodeHTML(n, sb)
	}
}

func renderNodeHTML(n mdNode, sb *strings.Builder) {
	switch n.kind {
	case kindText:
		// Email clients don't reliably honour white-space, so newlines become <br>.
		sb.WriteString(strings.ReplaceAll(html.EscapeString(n.value), "\n", "<br>"))

	case kindCode:
		fmt.Fprintf(sb, `<code style="%s">%s</code>`, styleCode, html.EscapeString(n.value))

	case kindCodeBlock:
		// Newlines inside <pre> are significant, so no <br> substitution here.
		fmt.Fprintf(sb, `<pre style="%s"><code style="%s">%s</code></pre>`,
			stylePre, stylePreCode, html.EscapeString(n.value))

	case kindMark:
		renderMarkHTML(n, sb)

	case kindHeading:
		style, ok := headingStyles[n.level]
		if !ok {
			style = headingStyles[3]
		}
		fmt.Fprintf(sb, `<div style="%s">`, style)
		renderHTML(n.children, sb)
		sb.WriteString(`</div>`)

	case kindSubtext:
		fmt.Fprintf(sb, `<div style="%s">`, styleSubtext)
		renderHTML(n.children, sb)
		sb.WriteString(`</div>`)

	case kindQuote:
		// A table rather than border-left: Outlook drops borders on divs.
		sb.WriteString(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0;"><tr>` +
			`<td width="3" style="width:3px;background-color:#4b5563;font-size:1px;line-height:1px;">&nbsp;</td>` +
			`<td style="padding-left:10px;color:#d1d5db;">`)
		renderHTML(n.children, sb)
		sb.WriteString(`</td></tr></table>`)

	case kindLink:
		fmt.Fprintf(sb, `<a href="%s" target="_blank" style="%s">`, html.EscapeString(n.url), styleLink)
		renderHTML(n.children, sb)
		sb.WriteString(`</a>`)

	// There are no names to resolve here, so mentions keep their raw form.
	case kindUserMention:
		fmt.Fprintf(sb, `<span style="%s">&lt;@%s&gt;</span>`, styleUserPill, html.EscapeString(n.value))

	case kindRoleMention:
		fmt.Fprintf(sb, `<span style="%s">&lt;@&amp;%s&gt;</span>`, styleRolePill, html.EscapeString(n.value))

	case kindChannelMention:
		fmt.Fprintf(sb, `<span style="%s">#channel</span>`, styleChanPill)

	case kindGlobalMention:
		fmt.Fprintf(sb, `<span style="%s">@%s</span>`, styleUserPill, html.EscapeString(n.value))

	case kindEmoji:
		fmt.Fprintf(sb, `<img src="%s" alt=":%s:" title=":%s:" width="20" height="20" style="display:inline-block;vertical-align:-4px;">`,
			html.EscapeString(emojiURL(n.url, n.animated)), html.EscapeString(n.value), html.EscapeString(n.value))

	case kindTimestamp:
		fmt.Fprintf(sb, `<span style="%s">%s</span>`, styleTimestamp, html.EscapeString(formatTimestamp(n.unix)))
	}
}

func renderMarkHTML(n mdNode, sb *strings.Builder) {
	openTag, closeTag := "", ""
	switch n.mark {
	case markBold:
		openTag, closeTag = `<strong>`, `</strong>`
	case markItalic:
		openTag, closeTag = `<em>`, `</em>`
	case markUnderline:
		openTag, closeTag = `<span style="text-decoration:underline;">`, `</span>`
	case markStrike:
		openTag, closeTag = `<span style="text-decoration:line-through;">`, `</span>`
	case markSpoiler:
		openTag, closeTag = fmt.Sprintf(`<span style="%s">`, styleSpoiler), `</span>`
	}

	sb.WriteString(openTag)
	renderHTML(n.children, sb)
	sb.WriteString(closeTag)
}

func emojiURL(id string, animated bool) string {
	ext := "png"
	if animated {
		ext = "gif"
	}
	return fmt.Sprintf("https://cdn.discordapp.com/emojis/%s.%s", id, ext)
}

// UTC, since there is no recipient timezone to render in.
func formatTimestamp(unix int64) string {
	return time.Unix(unix, 0).UTC().Format("2 Jan 2006, 15:04") + " UTC"
}

func renderText(nodes []mdNode, sb *strings.Builder) {
	for _, n := range nodes {
		renderNodeText(n, sb)
	}
}

func renderNodeText(n mdNode, sb *strings.Builder) {
	switch n.kind {
	case kindText:
		sb.WriteString(n.value)

	case kindCode:
		sb.WriteString(n.value)

	case kindCodeBlock:
		sb.WriteString("\n\n" + n.value + "\n\n")

	case kindMark:
		renderText(n.children, sb)

	case kindHeading:
		sb.WriteString("\n")
		renderText(n.children, sb)
		sb.WriteString("\n")

	case kindSubtext:
		renderText(n.children, sb)
		sb.WriteString("\n")

	case kindQuote:
		var inner strings.Builder
		renderText(n.children, &inner)
		for line := range strings.SplitSeq(strings.TrimRight(inner.String(), "\n"), "\n") {
			sb.WriteString("> " + line + "\n")
		}

	case kindLink:
		var label strings.Builder
		renderText(n.children, &label)
		if label.String() == n.url {
			sb.WriteString(n.url)
		} else {
			fmt.Fprintf(sb, "%s (%s)", label.String(), n.url)
		}

	case kindUserMention:
		fmt.Fprintf(sb, "<@%s>", n.value)

	case kindRoleMention:
		fmt.Fprintf(sb, "<@&%s>", n.value)

	case kindChannelMention:
		sb.WriteString("#channel")

	case kindGlobalMention:
		sb.WriteString("@" + n.value)

	case kindEmoji:
		fmt.Fprintf(sb, ":%s:", n.value)

	case kindTimestamp:
		sb.WriteString(formatTimestamp(n.unix))
	}
}
