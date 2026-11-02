package email

import (
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"
	"time"
)

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

const (
	styleCode      = `background-color:#111827;color:#e5e7eb;padding:2px 6px;border-radius:4px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;`
	stylePre       = `background-color:#111827;border:1px solid #374151;border-radius:6px;padding:12px;margin:8px 0;overflow-x:auto;`
	stylePreCode   = `color:#e5e7eb;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;`
	styleSubtext   = `font-size:12px;line-height:1.5;color:#9ca3af;`
	styleParagraph = `margin:0 0 8px 0;`
	styleList      = `margin:4px 0;padding-left:24px;`
	styleListItem  = `margin:2px 0;`
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

var guildNavLabels = map[string]string{
	"home":         "Server Guide",
	"guide":        "Server Guide",
	"browse":       "Browse Channels",
	"customize":    "Channels & Roles",
	"linked-roles": "Linked Roles",
}

var reANSIEscape = regexp.MustCompile("\x1b\\[[0-9;]*m")

func codeBlockText(n mdNode) string {
	if strings.EqualFold(n.lang, "ansi") {
		return reANSIEscape.ReplaceAllString(n.text, "")
	}
	return n.text
}

func linkHref(url string) (string, bool) {
	scheme, _, ok := strings.Cut(url, ":")
	if !ok || strings.ContainsFunc(url, func(r rune) bool { return r <= ' ' || r == 0x7f }) {
		return "", false
	}
	switch strings.ToLower(scheme) {
	case "http", "https", "mailto", "tel", "sms":
		return url, true
	}
	return "", false
}

func dropNewlineAfterCodeBlock(nodes []mdNode, i int) mdNode {
	n := nodes[i]
	if n.kind == mdText && i > 0 && nodes[i-1].kind == mdCodeBlock {
		n.text = strings.TrimPrefix(n.text, "\n")
	}
	return n
}

func renderHTML(nodes []mdNode, sb *strings.Builder) {
	for i := range nodes {
		renderNodeHTML(dropNewlineAfterCodeBlock(nodes, i), sb)
	}
}

func renderNodeHTML(n mdNode, sb *strings.Builder) {
	switch n.kind {
	case mdText:
		sb.WriteString(strings.ReplaceAll(html.EscapeString(n.text), "\n", "<br>"))

	case mdBr:
		sb.WriteString("<br>")

	case mdCode:
		fmt.Fprintf(sb, `<code style="%s">%s</code>`, styleCode, html.EscapeString(n.text))

	case mdCodeBlock:
		fmt.Fprintf(sb, `<pre style="%s"><code style="%s">%s</code></pre>`,
			stylePre, stylePreCode, html.EscapeString(codeBlockText(n)))

	case mdMark:
		renderMarkHTML(n, sb)

	case mdHeading:
		style, ok := headingStyles[n.level]
		if !ok {
			style = headingStyles[3]
		}
		fmt.Fprintf(sb, `<div style="%s">`, style)
		renderHTML(n.children, sb)
		sb.WriteString(`</div>`)

	case mdSubtext:
		fmt.Fprintf(sb, `<div style="%s">`, styleSubtext)
		renderHTML(n.children, sb)
		sb.WriteString(`</div>`)

	case mdParagraph:
		fmt.Fprintf(sb, `<div style="%s">`, styleParagraph)
		renderHTML(n.children, sb)
		sb.WriteString(`</div>`)

	case mdQuote:
		// A table rather than border-left: Outlook drops borders on divs.
		sb.WriteString(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0;"><tr>` +
			`<td width="3" style="width:3px;background-color:#4b5563;font-size:1px;line-height:1px;">&nbsp;</td>` +
			`<td style="padding-left:10px;color:#d1d5db;">`)
		renderHTML(n.children, sb)
		sb.WriteString(`</td></tr></table>`)

	case mdList:
		tag := "ul"
		if n.ordered {
			tag = "ol"
		}
		fmt.Fprintf(sb, `<%s`, tag)
		if n.ordered && n.start != 1 {
			fmt.Fprintf(sb, ` start="%d"`, n.start)
		}
		fmt.Fprintf(sb, ` style="%s">`, styleList)
		for _, item := range n.items {
			fmt.Fprintf(sb, `<li style="%s">`, styleListItem)
			renderHTML(item, sb)
			sb.WriteString(`</li>`)
		}
		fmt.Fprintf(sb, `</%s>`, tag)

	case mdLink:
		href, ok := linkHref(n.url)
		if !ok {
			renderHTML(n.children, sb)
			return
		}
		fmt.Fprintf(sb, `<a href="%s" target="_blank" rel="noopener noreferrer" style="%s"`, html.EscapeString(href), styleLink)
		if n.title != "" {
			fmt.Fprintf(sb, ` title="%s"`, html.EscapeString(n.title))
		}
		sb.WriteString(`>`)
		renderHTML(n.children, sb)
		sb.WriteString(`</a>`)

	case mdUserMention:
		fmt.Fprintf(sb, `<span style="%s">&lt;@%s&gt;</span>`, styleUserPill, html.EscapeString(n.id))

	case mdRoleMention:
		fmt.Fprintf(sb, `<span style="%s">&lt;@&amp;%s&gt;</span>`, styleRolePill, html.EscapeString(n.id))

	case mdChannelMention:
		if href, ok := linkHref(n.url); ok {
			escaped := html.EscapeString(href)
			fmt.Fprintf(sb, `<a href="%s" target="_blank" rel="noopener noreferrer" style="%s">%s</a>`, escaped, styleLink, escaped)
			return
		}
		fmt.Fprintf(sb, `<span style="%s">#channel</span>`, styleChanPill)

	case mdGlobalMention:
		fmt.Fprintf(sb, `<span style="%s">@%s</span>`, styleUserPill, html.EscapeString(n.name))

	case mdCommandMention:
		fmt.Fprintf(sb, `<span style="%s">/%s</span>`, styleUserPill, html.EscapeString(n.name))

	case mdGuildNav:
		fmt.Fprintf(sb, `<span style="%s">%s</span>`, styleChanPill, html.EscapeString(guildNavLabels[n.name]))

	case mdEmoji:
		fmt.Fprintf(sb, `<img src="%s" alt=":%s:" title=":%s:" width="20" height="20" style="display:inline-block;vertical-align:-4px;">`,
			html.EscapeString(emojiURL(n.id, n.animated)), html.EscapeString(n.name), html.EscapeString(n.name))

	case mdTimestamp:
		fmt.Fprintf(sb, `<span style="%s">%s</span>`, styleTimestamp, html.EscapeString(formatTimestamp(n.unix, n.style)))
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

var timestampLayouts = map[byte]string{
	't': "15:04",
	'T': "15:04:05",
	'd': "02/01/2006",
	'D': "2 January 2006",
	'f': "2 January 2006 15:04",
	'F': "Monday, 2 January 2006 15:04",
	's': "02/01/2006 15:04",
	'S': "02/01/2006 15:04:05",
	// Emails are read later, so relative times are shown in full.
	'R': "2 January 2006 15:04",
}

func formatTimestamp(unix int64, style byte) string {
	layout, ok := timestampLayouts[style]
	if !ok {
		layout = timestampLayouts['f']
	}
	return time.Unix(unix, 0).UTC().Format(layout) + " UTC"
}

func renderText(nodes []mdNode, sb *strings.Builder) {
	for i := range nodes {
		renderNodeText(dropNewlineAfterCodeBlock(nodes, i), sb)
	}
}

func startLine(sb *strings.Builder) {
	if s := sb.String(); s != "" && !strings.HasSuffix(s, "\n") {
		sb.WriteByte('\n')
	}
}

func writeLines(sb *strings.Builder, nodes []mdNode, first, rest string) {
	var inner strings.Builder
	renderText(nodes, &inner)
	for i, line := range strings.Split(strings.TrimRight(inner.String(), "\n"), "\n") {
		prefix := rest
		if i == 0 {
			prefix = first
		}
		sb.WriteString(strings.TrimRight(prefix+line, " ") + "\n")
	}
}

func renderNodeText(n mdNode, sb *strings.Builder) {
	switch n.kind {
	case mdText, mdCode:
		sb.WriteString(n.text)

	case mdBr:
		sb.WriteString("\n")

	case mdCodeBlock:
		startLine(sb)
		sb.WriteString("```\n" + strings.TrimSuffix(codeBlockText(n), "\n") + "\n```\n")

	case mdMark:
		renderText(n.children, sb)

	case mdHeading, mdSubtext, mdParagraph:
		startLine(sb)
		renderText(n.children, sb)
		startLine(sb)

	case mdQuote:
		startLine(sb)
		writeLines(sb, n.children, "> ", "> ")

	case mdList:
		startLine(sb)
		for i, item := range n.items {
			marker := "- "
			if n.ordered {
				marker = strconv.Itoa(n.start+i) + ". "
			}
			writeLines(sb, item, marker, "  ")
		}

	case mdLink:
		var label strings.Builder
		renderText(n.children, &label)
		if label.String() == n.url {
			sb.WriteString(n.url)
		} else {
			fmt.Fprintf(sb, "%s (%s)", label.String(), n.url)
		}

	case mdUserMention:
		fmt.Fprintf(sb, "<@%s>", n.id)

	case mdRoleMention:
		fmt.Fprintf(sb, "<@&%s>", n.id)

	case mdChannelMention:
		if n.url != "" {
			sb.WriteString(n.url)
		} else {
			sb.WriteString("#channel")
		}

	case mdGlobalMention:
		sb.WriteString("@" + n.name)

	case mdCommandMention:
		sb.WriteString("/" + n.name)

	case mdGuildNav:
		sb.WriteString(guildNavLabels[n.name])

	case mdEmoji:
		fmt.Fprintf(sb, ":%s:", n.name)

	case mdTimestamp:
		sb.WriteString(formatTimestamp(n.unix, n.style))
	}
}
