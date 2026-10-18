package api

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/TicketsBot-cloud/gdl/objects/guild/emoji"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/stretchr/testify/require"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/validation"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

func strPtr(s string) *string { return &s }

func text(content string) component.Component {
	return component.BuildTextDisplay(component.TextDisplay{Content: content})
}

func texts(n int) []component.Component {
	out := make([]component.Component, n)
	for i := range out {
		out[i] = text(fmt.Sprintf("line %d", i))
	}
	return out
}

func linkBtn(label, url string) component.Component {
	return component.BuildButton(component.Button{Label: label, Style: component.ButtonStyleLink, Url: strPtr(url)})
}

func panelBtn(id int) component.Component {
	return component.BuildButton(component.Button{Label: "ignored", Style: component.ButtonStylePrimary, CustomId: fmt.Sprintf("panel:%d", id)})
}

func dropdownNode() component.Component {
	return component.BuildSelectMenu(component.SelectMenu{CustomId: "multipanel", Placeholder: "ignored"})
}

func row(children ...component.Component) component.Component {
	return component.BuildActionRow(children...)
}

func container(children ...component.Component) component.Component {
	return component.BuildContainer(component.Container{Components: children})
}

func section(accessory component.Component, children ...component.Component) component.Component {
	return component.BuildSection(component.Section{Components: children, Accessory: accessory})
}

func thumb(url string) component.Component {
	return component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: url}})
}

func gallery(urls ...string) component.Component {
	items := make([]component.MediaGalleryItem, len(urls))
	for i, u := range urls {
		items[i] = component.MediaGalleryItem{Media: component.UnfurledMediaItem{Url: u}}
	}
	return component.BuildMediaGallery(component.MediaGallery{Items: items})
}

func urlOfLength(n int) string {
	prefix := "https://example.com/"
	return prefix + strings.Repeat("a", n-len(prefix))
}

func intPtr(i int) *int { return &i }

func containerWithColour(colour int, children ...component.Component) component.Component {
	return component.BuildContainer(component.Container{Components: children, AccentColor: &colour})
}

func separatorWithSpacing(spacing *int) component.Component {
	return component.BuildSeparator(component.Separator{Spacing: spacing})
}

var multiPanelRules = treeRules{validPanelIds: map[int]bool{1: true, 2: true, 3: true}, dropdownMode: true}

func TestValidateComponentTree(t *testing.T) {
	longAlt := func(n int) *string { return strPtr(strings.Repeat("a", n)) }

	tests := []struct {
		name    string
		tree    []component.Component
		rules   treeRules
		wantErr string
	}{
		{name: "empty tree", tree: nil},
		{name: "text display", tree: []component.Component{text("hello")}},
		{name: "blank text display", tree: []component.Component{text("   \n\t")}, wantErr: "Text display"},
		{name: "empty text display", tree: []component.Component{text("")}, wantErr: "Text display"},

		// Component count, no reservation.
		{name: "40 components", tree: texts(40)},
		{name: "41 components", tree: texts(41), wantErr: "Too many components"},
		{name: "38 components with 2 reserved", tree: texts(38), rules: treeRules{reserved: 2}},
		{name: "39 components with 2 reserved", tree: texts(39), rules: treeRules{reserved: 2}, wantErr: "2 reserved"},
		{name: "no top level limit below 40", tree: texts(25)},
		{name: "nested components all count", tree: []component.Component{container(texts(20)...), container(texts(19)...)}, wantErr: "Too many components"},
		{name: "nested components exactly at limit", tree: []component.Component{container(texts(20)...), container(texts(18)...)}},

		// Total text.
		{name: "4000 characters of text", tree: []component.Component{text(strings.Repeat("a", 2000)), text(strings.Repeat("b", 2000))}},
		{name: "4001 characters of text", tree: []component.Component{text(strings.Repeat("a", 2000)), text(strings.Repeat("b", 2001))}, wantErr: "4000"},
		{name: "link button labels do not count towards the text total", tree: []component.Component{text(strings.Repeat("a", 4000)), row(linkBtn("Go", "https://example.com"))}},
		{name: "section text counts towards the text total", tree: []component.Component{section(thumb("https://example.com/a.png"), text(strings.Repeat("a", 2000))), text(strings.Repeat("b", 2000))}},
		{name: "section text over the text total", tree: []component.Component{section(thumb("https://example.com/a.png"), text(strings.Repeat("a", 2001))), text(strings.Repeat("b", 2000))}, wantErr: "4000"},
		{name: "multibyte characters are counted as characters", tree: []component.Component{text(strings.Repeat("é", 4000))}},

		// URLs.
		{name: "link button url at 512", tree: []component.Component{row(linkBtn("Go", urlOfLength(512)))}},
		{name: "link button url at 513", tree: []component.Component{row(linkBtn("Go", urlOfLength(513)))}, wantErr: "512"},
		{name: "http url", tree: []component.Component{row(linkBtn("Go", "http://example.com"))}},
		{name: "ftp url", tree: []component.Component{row(linkBtn("Go", "ftp://example.com"))}, wantErr: "http"},
		{name: "javascript url", tree: []component.Component{row(linkBtn("Go", "javascript:alert(1)"))}, wantErr: "http"},
		{name: "relative url", tree: []component.Component{row(linkBtn("Go", "/docs"))}, wantErr: "http"},
		{name: "scheme without host", tree: []component.Component{row(linkBtn("Go", "https://"))}, wantErr: "http"},
		{name: "empty url", tree: []component.Component{row(linkBtn("Go", ""))}, wantErr: "Link button"},
		{name: "url with no hostname", tree: []component.Component{row(linkBtn("Go", "https://:80"))}, wantErr: "domain"},
		{name: "url with a lone dot as hostname", tree: []component.Component{row(linkBtn("Go", "https://."))}, wantErr: "domain"},
		{name: "url with a dotless hostname", tree: []component.Component{row(linkBtn("Go", "https://localhost/x"))}, wantErr: "domain"},
		{name: "url with an empty label", tree: []component.Component{row(linkBtn("Go", "https://a..com"))}, wantErr: "domain"},
		{name: "url with a leading dot", tree: []component.Component{row(linkBtn("Go", "https://.com"))}, wantErr: "domain"},
		{name: "url with a trailing dot", tree: []component.Component{row(linkBtn("Go", "https://example.com./x"))}},
		{name: "url with a single slash after the scheme", tree: []component.Component{row(linkBtn("Go", "https:/example.com"))}, wantErr: "http"},
		{name: "url with no slashes after the scheme", tree: []component.Component{row(linkBtn("Go", "https:example.com"))}, wantErr: "http"},
		{name: "media url with a single slash after the scheme", tree: []component.Component{gallery("https:/example.com/a.png")}, wantErr: "Media gallery"},
		{name: "media url with a dotless hostname", tree: []component.Component{gallery("https://localhost/a.png")}, wantErr: "domain"},
		{name: "media url with a space", tree: []component.Component{gallery("https://a.com/a b.png")}, wantErr: "spaces or control"},
		{name: "media url at 513", tree: []component.Component{gallery(urlOfLength(513))}, wantErr: "512"},
		{name: "url with a port", tree: []component.Component{row(linkBtn("Go", "https://example.com:8443/x?y=1#z"))}},
		{name: "url with a space", tree: []component.Component{row(linkBtn("Go", "https://a.com/a b"))}, wantErr: "spaces or control"},
		{name: "url with a tab", tree: []component.Component{row(linkBtn("Go", "https://a.com/a\tb"))}, wantErr: "spaces or control"},
		{name: "url with a newline", tree: []component.Component{row(linkBtn("Go", "https://a.com/\n"))}, wantErr: "spaces or control"},
		{name: "url with a null byte", tree: []component.Component{row(linkBtn("Go", "https://a.com/\x00"))}, wantErr: "spaces or control"},
		{name: "url with a right to left override", tree: []component.Component{row(linkBtn("Go", "https://a.com/\u202Efdp.exe"))}, wantErr: "spaces or control"},
		{name: "url with a bidi isolate", tree: []component.Component{row(linkBtn("Go", "https://a.com/\u2066"))}, wantErr: "spaces or control"},
		{name: "url with a left to right mark", tree: []component.Component{row(linkBtn("Go", "https://a.com/\u200E"))}, wantErr: "spaces or control"},
		{name: "url with non bidi unicode", tree: []component.Component{row(linkBtn("Go", "https://a.com/caf\u00e9"))}},
		{name: "url with userinfo", tree: []component.Component{row(linkBtn("Go", "https://user:pw@evil.com/"))}, wantErr: "username"},
		{name: "url with a username only", tree: []component.Component{row(linkBtn("Go", "https://user@evil.com/"))}, wantErr: "username"},
		{name: "media url with userinfo", tree: []component.Component{gallery("https://user:pw@evil.com/a.png")}, wantErr: "Media gallery"},

		// Container accent colour and separator spacing.
		{name: "container without an accent colour", tree: []component.Component{container(text("a"))}},
		{name: "container accent colour at 0", tree: []component.Component{containerWithColour(0, text("a"))}},
		{name: "container accent colour at 0xFFFFFF", tree: []component.Component{containerWithColour(0xFFFFFF, text("a"))}},
		{name: "container accent colour above 0xFFFFFF", tree: []component.Component{containerWithColour(0x1000000, text("a"))}, wantErr: "accent colour"},
		{name: "container accent colour below 0", tree: []component.Component{containerWithColour(-1, text("a"))}, wantErr: "accent colour"},
		{name: "separator without spacing", tree: []component.Component{separatorWithSpacing(nil)}},
		{name: "separator spacing 1", tree: []component.Component{separatorWithSpacing(intPtr(1))}},
		{name: "separator spacing 2", tree: []component.Component{separatorWithSpacing(intPtr(2))}},
		{name: "separator spacing 0", tree: []component.Component{separatorWithSpacing(intPtr(0))}, wantErr: "spacing"},
		{name: "separator spacing 3", tree: []component.Component{separatorWithSpacing(intPtr(3))}, wantErr: "spacing"},
		{name: "separator spacing negative", tree: []component.Component{separatorWithSpacing(intPtr(-1))}, wantErr: "spacing"},
		{name: "link button with an emoji", tree: []component.Component{row(component.BuildButton(component.Button{Label: "Go", Style: component.ButtonStyleLink, Url: strPtr("https://example.com"), Emoji: &emoji.Emoji{Name: "x"}}))}, wantErr: "emoji"},

		// Thumbnail and gallery.
		{name: "thumbnail with alt text at 1024", tree: []component.Component{section(component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/a.png"}, Description: longAlt(1024)}), text("hi"))}},
		{name: "thumbnail with alt text at 1025", tree: []component.Component{section(component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/a.png"}, Description: longAlt(1025)}), text("hi"))}, wantErr: "Thumbnail"},
		{name: "thumbnail with bad url", tree: []component.Component{section(thumb("not a url"), text("hi"))}, wantErr: "Thumbnail"},
		{name: "thumbnail with no url", tree: []component.Component{section(thumb(""), text("hi"))}, wantErr: "Thumbnail"},
		{name: "standalone thumbnail", tree: []component.Component{thumb("https://example.com/a.png")}, wantErr: "Thumbnail"},
		{name: "gallery with 1 item", tree: []component.Component{gallery("https://example.com/1.png")}},
		{name: "gallery with 10 items", tree: []component.Component{gallery(strings.Split(strings.Repeat("https://example.com/1.png,", 10), ",")[:10]...)}},
		{name: "gallery with 11 items", tree: []component.Component{gallery(strings.Split(strings.Repeat("https://example.com/1.png,", 11), ",")[:11]...)}, wantErr: "Media gallery"},
		{name: "gallery with 0 items", tree: []component.Component{gallery()}, wantErr: "Media gallery"},
		{name: "gallery with bad scheme", tree: []component.Component{gallery("ftp://example.com/1.png")}, wantErr: "Media gallery"},
		{name: "gallery item alt text at 1024", tree: []component.Component{component.BuildMediaGallery(component.MediaGallery{Items: []component.MediaGalleryItem{{Media: component.UnfurledMediaItem{Url: "https://example.com/1.png"}, Description: longAlt(1024)}}})}},
		{name: "avatar placeholder in a gallery where allowed", tree: []component.Component{gallery(types.AvatarUrlPlaceholder)}, rules: treeRules{allowAvatarPlaceholder: true}},
		{name: "avatar placeholder in a thumbnail where allowed", tree: []component.Component{section(thumb(types.AvatarUrlPlaceholder), text("hi"))}, rules: treeRules{allowAvatarPlaceholder: true}},
		{name: "avatar placeholder in a gallery by default", tree: []component.Component{gallery(types.AvatarUrlPlaceholder)}, wantErr: "Media gallery"},
		{name: "avatar placeholder in a thumbnail by default", tree: []component.Component{section(thumb(types.AvatarUrlPlaceholder), text("hi"))}, wantErr: "Thumbnail"},
		{name: "avatar placeholder in a link button even where allowed", tree: []component.Component{row(linkBtn("Go", types.AvatarUrlPlaceholder))}, rules: treeRules{allowAvatarPlaceholder: true}, wantErr: "Link button"},
		{name: "allowing the placeholder still rejects other bad media urls", tree: []component.Component{gallery("not a url")}, rules: treeRules{allowAvatarPlaceholder: true}, wantErr: "Media gallery"},
		{name: "gallery item alt text at 1025", tree: []component.Component{component.BuildMediaGallery(component.MediaGallery{Items: []component.MediaGalleryItem{{Media: component.UnfurledMediaItem{Url: "https://example.com/1.png"}, Description: longAlt(1025)}}})}, wantErr: "Media gallery"},

		// Section.
		{name: "section with 1 text display", tree: []component.Component{section(thumb("https://example.com/a.png"), texts(1)...)}},
		{name: "section with 3 text displays", tree: []component.Component{section(thumb("https://example.com/a.png"), texts(3)...)}},
		{name: "section with 4 text displays", tree: []component.Component{section(thumb("https://example.com/a.png"), texts(4)...)}, wantErr: "Section"},
		{name: "section with 0 text displays", tree: []component.Component{section(thumb("https://example.com/a.png"))}, wantErr: "Section"},
		{name: "section with a non text child", tree: []component.Component{section(thumb("https://example.com/a.png"), text("a"), gallery("https://example.com/1.png"))}, wantErr: "Section"},
		{name: "section without accessory", tree: []component.Component{section(component.Component{}, text("a"))}, wantErr: "accessory"},
		{name: "section with text display accessory", tree: []component.Component{section(text("x"), text("a"))}, wantErr: "accessory"},
		{name: "section with link button accessory", tree: []component.Component{section(linkBtn("Go", "https://example.com"), text("a"))}},
		{name: "section with panel button accessory in a multi-panel", tree: []component.Component{section(panelBtn(1), text("a"))}, rules: multiPanelRules},
		{name: "section with panel button accessory outside a multi-panel", tree: []component.Component{section(panelBtn(1), text("a"))}, wantErr: "Panel button"},
		{name: "section with a dropdown accessory", tree: []component.Component{section(dropdownNode(), text("a"))}, rules: multiPanelRules, wantErr: "accessory"},

		// File, container.
		{name: "file", tree: []component.Component{component.BuildFile(component.File{File: component.UnfurledMediaItem{Url: "https://example.com/a.pdf"}})}, wantErr: "File"},
		{name: "container with text", tree: []component.Component{container(text("a"))}},
		{name: "empty container", tree: []component.Component{container()}, wantErr: "Container"},
		{name: "container in container", tree: []component.Component{container(container(text("a")))}, wantErr: "Container"},
		{name: "container holding rows, sections and galleries", tree: []component.Component{container(text("a"), section(thumb("https://example.com/a.png"), text("b")), gallery("https://example.com/1.png"), row(linkBtn("Go", "https://example.com")), component.BuildSeparator(component.Separator{}))}},
		{name: "separator", tree: []component.Component{component.BuildSeparator(component.Separator{})}},

		// Buttons.
		{name: "link button", tree: []component.Component{row(linkBtn("Go", "https://example.com"))}},
		{name: "link button with blank label", tree: []component.Component{row(linkBtn("   ", "https://example.com"))}, wantErr: "Link button"},
		{name: "link button label at 80", tree: []component.Component{row(linkBtn(strings.Repeat("a", 80), "https://example.com"))}},
		{name: "link button label at 81", tree: []component.Component{row(linkBtn(strings.Repeat("a", 81), "https://example.com"))}, wantErr: "Link button"},
		{name: "link style button with a custom id", tree: []component.Component{row(component.BuildButton(component.Button{Label: "Go", Style: component.ButtonStyleLink, Url: strPtr("https://example.com"), CustomId: "x"}))}, wantErr: "never both"},
		{name: "link button with a panel custom id", tree: []component.Component{row(component.BuildButton(component.Button{Label: "Go", Style: component.ButtonStyleLink, Url: strPtr("https://example.com"), CustomId: "panel:1"}))}, rules: multiPanelRules, wantErr: "never both"},
		{name: "link style without a url", tree: []component.Component{row(component.BuildButton(component.Button{Label: "Go", Style: component.ButtonStyleLink}))}, wantErr: "Link button"},
		{name: "url on a non link style", tree: []component.Component{row(component.BuildButton(component.Button{Label: "Go", Style: component.ButtonStylePrimary, Url: strPtr("https://example.com")}))}, wantErr: "Link button"},
		{name: "link button with a sku", tree: []component.Component{row(component.BuildButton(component.Button{Label: "Go", Style: component.ButtonStyleLink, Url: strPtr("https://example.com"), SkuId: new(uint64)}))}, wantErr: "Link button"},
		{name: "arbitrary custom id", tree: []component.Component{row(component.BuildButton(component.Button{Label: "Go", Style: component.ButtonStylePrimary, CustomId: "close"}))}, rules: multiPanelRules, wantErr: "Button"},
		{name: "no custom id and no url", tree: []component.Component{row(component.BuildButton(component.Button{Label: "Go", Style: component.ButtonStylePrimary}))}, rules: multiPanelRules, wantErr: "Button"},
		{name: "panel placement", tree: []component.Component{row(panelBtn(1), panelBtn(2))}, rules: multiPanelRules},
		{name: "panel placement outside a multi-panel", tree: []component.Component{row(panelBtn(1))}, wantErr: "Panel button"},
		{name: "panel placement of an unknown panel", tree: []component.Component{row(panelBtn(99))}, rules: multiPanelRules, wantErr: "not part of this multi-panel"},
		{name: "panel placed twice", tree: []component.Component{row(panelBtn(1)), row(panelBtn(1))}, rules: multiPanelRules, wantErr: "more than once"},
		{name: "panel marker without an id", tree: []component.Component{row(component.BuildButton(component.Button{Style: component.ButtonStylePrimary, CustomId: "panel:"}))}, rules: multiPanelRules, wantErr: "Button"},
		{name: "panel marker with a non numeric id", tree: []component.Component{row(component.BuildButton(component.Button{Style: component.ButtonStylePrimary, CustomId: "panel:abc"}))}, rules: multiPanelRules, wantErr: "Button"},
		{name: "panel marker with a leading zero", tree: []component.Component{row(component.BuildButton(component.Button{Style: component.ButtonStylePrimary, CustomId: "panel:01"}))}, rules: multiPanelRules, wantErr: "Button"},
		{name: "panel marker with a sign", tree: []component.Component{row(component.BuildButton(component.Button{Style: component.ButtonStylePrimary, CustomId: "panel:+1"}))}, rules: multiPanelRules, wantErr: "Button"},
		{name: "panel marker with id zero", tree: []component.Component{row(component.BuildButton(component.Button{Style: component.ButtonStylePrimary, CustomId: "panel:0"}))}, rules: multiPanelRules, wantErr: "Button"},
		{name: "panel marker with an overflowing id", tree: []component.Component{row(component.BuildButton(component.Button{Style: component.ButtonStylePrimary, CustomId: "panel:99999999999999999999"}))}, rules: multiPanelRules, wantErr: "Button"},
		{name: "bare button outside a row", tree: []component.Component{linkBtn("Go", "https://example.com")}, wantErr: "action row"},

		// Dropdown.
		{name: "placed dropdown", tree: []component.Component{row(dropdownNode())}, rules: multiPanelRules},
		{name: "placed dropdown without dropdown mode", tree: []component.Component{row(dropdownNode())}, rules: treeRules{validPanelIds: map[int]bool{1: true}}, wantErr: "Dropdown"},
		{name: "placed dropdown outside a multi-panel", tree: []component.Component{row(dropdownNode())}, wantErr: "Dropdown"},
		{name: "placed dropdown twice", tree: []component.Component{row(dropdownNode()), row(dropdownNode())}, rules: multiPanelRules, wantErr: "only be placed once"},
		{name: "dropdown with another custom id", tree: []component.Component{row(component.BuildSelectMenu(component.SelectMenu{CustomId: "other"}))}, rules: multiPanelRules, wantErr: "Dropdown"},
		{name: "dropdown sharing a row", tree: []component.Component{row(dropdownNode(), panelBtn(1))}, rules: multiPanelRules, wantErr: "only component"},
		{name: "bare dropdown outside a row", tree: []component.Component{dropdownNode()}, rules: multiPanelRules, wantErr: "action row"},

		// Action row.
		{name: "empty action row", tree: []component.Component{row()}, wantErr: "Action row"},
		{name: "action row of 5", tree: []component.Component{row(linkBtn("1", "https://example.com"), linkBtn("2", "https://example.com"), linkBtn("3", "https://example.com"), linkBtn("4", "https://example.com"), linkBtn("5", "https://example.com"))}},
		{name: "action row of 6", tree: []component.Component{row(linkBtn("1", "https://example.com"), linkBtn("2", "https://example.com"), linkBtn("3", "https://example.com"), linkBtn("4", "https://example.com"), linkBtn("5", "https://example.com"), linkBtn("6", "https://example.com"))}, wantErr: "Action row"},
		{name: "action row mixing link and panel buttons", tree: []component.Component{row(linkBtn("1", "https://example.com"), panelBtn(1))}, rules: multiPanelRules},
		{name: "action row holding text", tree: []component.Component{row(text("x"))}, wantErr: "Action row"},

		// Interactive and unsupported types.
		{name: "text input", tree: []component.Component{component.Component{Type: component.ComponentInputText, ComponentData: component.InputText{}}}, wantErr: "not allowed"},
		{name: "label", tree: []component.Component{component.BuildLabel(component.Label{Label: "x"})}, wantErr: "not allowed"},
		{name: "user select in a row", tree: []component.Component{row(component.Component{Type: component.ComponentUserSelect, ComponentData: component.UserSelect{}})}, rules: multiPanelRules, wantErr: "Action row"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := validateComponentTree(tt.tree, tt.rules)

			if tt.wantErr == "" {
				require.NoError(t, err)
				return
			}

			require.Error(t, err)

			var inputErr *validation.InvalidInputError
			require.True(t, errors.As(err, &inputErr), "a rejection must be a client-facing validation error")
			require.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

func TestValidateComponentTree_Result(t *testing.T) {
	tree := []component.Component{
		text("a"),
		container(row(panelBtn(1), panelBtn(3)), section(linkBtn("Go", "https://example.com"), text("b"))),
		row(dropdownNode()),
	}

	result, err := validateComponentTree(tree, multiPanelRules)
	require.NoError(t, err)
	require.Equal(t, map[int]bool{1: true, 3: true}, result.placed)
	require.True(t, result.dropdownUsed)
	// text, container, row, 2 buttons, section, text, accessory, row, select
	require.Equal(t, 10, result.count)
}

func TestParsePanelPlacement(t *testing.T) {
	tests := []struct {
		customId string
		wantId   int
		wantOk   bool
	}{
		{"panel:1", 1, true},
		{"panel:123456789", 123456789, true},
		{"panel:1234567890", 0, false},
		{"panel:", 0, false},
		{"panel:0", 0, false},
		{"panel:-1", 0, false},
		{"panel:01", 0, false},
		{"panel: 1", 0, false},
		{"panel:1 ", 0, false},
		{"Panel:1", 0, false},
		{"panel", 0, false},
		{"multipanel", 0, false},
		{"", 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.customId, func(t *testing.T) {
			id, ok := parsePanelPlacement(tt.customId)
			require.Equal(t, tt.wantOk, ok)
			require.Equal(t, tt.wantId, id)
		})
	}
}

func TestCheckComponentBudget(t *testing.T) {
	tests := []struct {
		name     string
		count    int
		reserved int
		wantErr  bool
	}{
		{"empty", 0, 0, false},
		{"at the limit", 40, 0, false},
		{"over the limit", 41, 0, true},
		{"at the limit with a reservation", 35, 5, false},
		{"over the limit with a reservation", 36, 5, true},
		{"reservation alone is over", 0, 41, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := checkComponentBudget(tt.count, tt.reserved)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestNormaliseComponentTree(t *testing.T) {
	junkMedia := component.UnfurledMediaItem{Url: "https://example.com/a.png", ProxyUrl: "https://proxy", ContentType: "image/png", Height: 10, Width: 20}
	cleanMedia := component.UnfurledMediaItem{Url: "https://example.com/a.png"}
	alt := strPtr("alt")
	spoiler := true

	tests := []struct {
		name string
		in   component.Component
		want component.Component
	}{
		{
			name: "thumbnail keeps url, description and spoiler only",
			in:   component.BuildThumbnail(component.Thumbnail{Media: junkMedia, Description: alt, Spoiler: &spoiler}),
			want: component.BuildThumbnail(component.Thumbnail{Media: cleanMedia, Description: alt, Spoiler: &spoiler}),
		},
		{
			name: "gallery items keep url, description and spoiler only",
			in:   component.BuildMediaGallery(component.MediaGallery{Items: []component.MediaGalleryItem{{Media: junkMedia, Description: alt, Spoiler: &spoiler}, {Media: junkMedia}}}),
			want: component.BuildMediaGallery(component.MediaGallery{Items: []component.MediaGalleryItem{{Media: cleanMedia, Description: alt, Spoiler: &spoiler}, {Media: cleanMedia}}}),
		},
		{
			name: "dropdown keeps only its custom id",
			in: component.BuildSelectMenu(component.SelectMenu{
				CustomId: "multipanel", Placeholder: "x", MinValues: intPtr(3), MaxValues: intPtr(9), Disabled: true,
				Options: []component.SelectOption{{Label: "a", Value: "b"}},
			}),
			want: component.BuildSelectMenu(component.SelectMenu{CustomId: "multipanel"}),
		},
		{
			name: "placement button keeps style and custom id only",
			in:   component.BuildButton(component.Button{Label: "x", CustomId: "panel:3", Style: component.ButtonStyleDanger, Emoji: &emoji.Emoji{Name: "x"}, SkuId: new(uint64), Disabled: true}),
			want: component.BuildButton(component.Button{CustomId: "panel:3", Style: component.ButtonStyleDanger}),
		},
		{
			name: "placement button with an unsupported style becomes primary",
			in:   component.BuildButton(component.Button{CustomId: "panel:3", Style: component.ButtonStylePremium}),
			want: component.BuildButton(component.Button{CustomId: "panel:3", Style: component.ButtonStylePrimary}),
		},
		{
			name: "placement button with style zero becomes primary",
			in:   component.BuildButton(component.Button{CustomId: "panel:3"}),
			want: component.BuildButton(component.Button{CustomId: "panel:3", Style: component.ButtonStylePrimary}),
		},
		{
			name: "link button keeps label, url and disabled",
			in:   component.BuildButton(component.Button{Label: "Go", Url: strPtr("https://example.com"), Style: component.ButtonStyleLink, CustomId: "x", SkuId: new(uint64)}),
			want: component.BuildButton(component.Button{Label: "Go", Url: strPtr("https://example.com"), Style: component.ButtonStyleLink}),
		},
		{
			name: "nested nodes are normalised",
			in: container(
				section(component.BuildThumbnail(component.Thumbnail{Media: junkMedia}), text("hi")),
				row(component.BuildSelectMenu(component.SelectMenu{CustomId: "multipanel", Placeholder: "x"})),
			),
			want: container(
				section(component.BuildThumbnail(component.Thumbnail{Media: cleanMedia}), text("hi")),
				row(component.BuildSelectMenu(component.SelectMenu{CustomId: "multipanel"})),
			),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normaliseComponentTree([]component.Component{tt.in})
			require.Equal(t, []component.Component{tt.want}, got)
		})
	}

	t.Run("nil stays nil", func(t *testing.T) {
		require.Nil(t, normaliseComponentTree(nil))
	})

	t.Run("the input is not mutated", func(t *testing.T) {
		in := []component.Component{component.BuildThumbnail(component.Thumbnail{Media: junkMedia})}
		normaliseComponentTree(in)
		require.Equal(t, junkMedia, in[0].ComponentData.(component.Thumbnail).Media)
	})

	t.Run("junk never reaches the stored json", func(t *testing.T) {
		in := []component.Component{
			component.BuildThumbnail(component.Thumbnail{Media: junkMedia}),
			row(component.BuildSelectMenu(component.SelectMenu{CustomId: "multipanel", Placeholder: "SECRET"})),
			row(component.BuildButton(component.Button{Label: "SECRET", CustomId: "panel:1", Style: component.ButtonStylePrimary})),
		}

		stored, err := marshalComponents(normaliseComponentTree(in))
		require.NoError(t, err)
		require.NotContains(t, *stored, "SECRET")
		require.NotContains(t, *stored, "https://proxy")
		require.NotContains(t, *stored, "image/png")
	})
}

func TestIsPanelButtonStyle(t *testing.T) {
	tests := []struct {
		style component.ButtonStyle
		want  bool
	}{
		{0, false},
		{component.ButtonStylePrimary, true},
		{component.ButtonStyleSecondary, true},
		{component.ButtonStyleSuccess, true},
		{component.ButtonStyleDanger, true},
		{component.ButtonStyleLink, false},
		{component.ButtonStylePremium, false},
		{7, false},
		{255, false},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprint(tt.style), func(t *testing.T) {
			require.Equal(t, tt.want, isPanelButtonStyle(tt.style))
		})
	}
}
