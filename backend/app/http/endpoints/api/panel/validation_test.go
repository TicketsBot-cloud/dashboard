package api

import (
	"fmt"
	"strings"
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/stretchr/testify/require"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

func TestValidateMessageComponents(t *testing.T) {
	tests := []struct {
		name    string
		data    panelBody
		paid    bool
		wantErr string
	}{
		{name: "classic mode skips the tree and the premium check", data: panelBody{MessageComponents: texts(60)}},
		{name: "v2 without paid premium", data: panelBody{MessageUsesComponentsV2: true, MessageComponents: texts(1)}, wantErr: "premium"},
		{name: "v2 with paid premium", data: panelBody{MessageUsesComponentsV2: true, MessageComponents: texts(1)}, paid: true},
		{name: "empty tree is allowed for the panel message", data: panelBody{MessageUsesComponentsV2: true}, paid: true},
		{name: "38 components leave room for the open ticket row", data: panelBody{MessageUsesComponentsV2: true, MessageComponents: texts(38)}, paid: true},
		{name: "39 components do not", data: panelBody{MessageUsesComponentsV2: true, MessageComponents: texts(39)}, paid: true, wantErr: "Too many components"},
		{name: "panel placement is not available", data: panelBody{MessageUsesComponentsV2: true, MessageComponents: []component.Component{row(panelBtn(1))}}, paid: true, wantErr: "Panel button"},
		{name: "avatar placeholder is rejected as a gallery url", data: panelBody{MessageUsesComponentsV2: true, MessageComponents: []component.Component{gallery(types.AvatarUrlPlaceholder)}}, paid: true, wantErr: "Media gallery"},
		{name: "avatar placeholder is rejected as a thumbnail url", data: panelBody{MessageUsesComponentsV2: true, MessageComponents: []component.Component{section(thumb(types.AvatarUrlPlaceholder), text("a"))}}, paid: true, wantErr: "Thumbnail"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateMessageComponents(PanelValidationContext{Data: tt.data, HasPaidPremium: tt.paid})()

			if tt.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.ErrorContains(t, err, tt.wantErr)
		})
	}
}

func TestValidateMessageComponents_VotingPremiumIsNotEnough(t *testing.T) {
	err := validateMessageComponents(PanelValidationContext{
		Data:      panelBody{MessageUsesComponentsV2: true, MessageComponents: texts(1)},
		IsPremium: true,
	})()
	require.ErrorContains(t, err, "premium")
}

func TestValidateWelcomeMessageComponents(t *testing.T) {
	// Defaults: all three buttons visible, so 5 + 3 + 1 = 9 reserved.
	tests := []struct {
		name    string
		data    panelBody
		paid    bool
		wantErr string
	}{
		{name: "classic mode skips everything", data: panelBody{}},
		{name: "classic mode without premium ignores a tree that would fail", data: panelBody{WelcomeMessageComponents: append(texts(60), gallery("not a url"))}},
		{name: "without paid premium", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: texts(1)}, wantErr: "premium"},
		{name: "empty tree", data: panelBody{WelcomeMessageUsesComponentsV2: true}, paid: true, wantErr: "at least one component"},
		{name: "empty non-nil tree", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: []component.Component{}}, paid: true, wantErr: "at least one component"},
		{name: "31 components with all buttons visible", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: texts(31)}, paid: true},
		{name: "32 components with all buttons visible", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: texts(32)}, paid: true, wantErr: "Too many components"},
		{name: "35 components with every button hidden", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: texts(35), HideCloseButton: true, HideCloseWithReasonButton: true, HideClaimButton: true}, paid: true},
		{name: "36 components with every button hidden", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: texts(36), HideCloseButton: true, HideCloseWithReasonButton: true, HideClaimButton: true}, paid: true, wantErr: "Too many components"},
		{name: "claim is not shown in thread mode", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: texts(32), UseThreads: true}, paid: true},
		{name: "thread mode with one more", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: texts(33), UseThreads: true}, paid: true, wantErr: "Too many components"},
		{name: "avatar placeholder as a gallery url", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: []component.Component{gallery(types.AvatarUrlPlaceholder)}}, paid: true},
		{name: "avatar placeholder as a thumbnail url", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: []component.Component{section(thumb(types.AvatarUrlPlaceholder), text("a"))}}, paid: true},
		{name: "avatar placeholder as a link button url", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: []component.Component{row(linkBtn("Go", types.AvatarUrlPlaceholder))}}, paid: true, wantErr: "Link button"},
		{name: "avatar placeholder embedded in a longer url", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: []component.Component{gallery("https://example.com/" + types.AvatarUrlPlaceholder)}}, paid: true, wantErr: "Media gallery"},
		{name: "avatar placeholder with surrounding spaces", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: []component.Component{gallery(" " + types.AvatarUrlPlaceholder)}}, paid: true, wantErr: "Media gallery"},
		{name: "avatar placeholder in upper case", data: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: []component.Component{gallery("%AVATAR_URL%")}}, paid: true, wantErr: "Media gallery"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateWelcomeMessageComponents(PanelValidationContext{Data: tt.data, HasPaidPremium: tt.paid})()

			if tt.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.ErrorContains(t, err, tt.wantErr)
		})
	}
}

func TestWelcomeMessageReserved(t *testing.T) {
	tests := []struct {
		name string
		data panelBody
		want int
	}{
		{"all buttons", panelBody{}, 9},
		{"close only", panelBody{HideCloseWithReasonButton: true, HideClaimButton: true}, 7},
		{"none", panelBody{HideCloseButton: true, HideCloseWithReasonButton: true, HideClaimButton: true}, 5},
		{"thread mode drops claim", panelBody{UseThreads: true}, 8},
		{"thread mode with only claim visible", panelBody{UseThreads: true, HideCloseButton: true, HideCloseWithReasonButton: true}, 5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, welcomeMessageReserved(tt.data))
		})
	}
}

func TestClassicValidatorsAreSkippedInV2(t *testing.T) {
	badUrl := strPtr("not a url")
	emptyEmbed := &types.CustomEmbed{}

	t.Run("image and thumbnail", func(t *testing.T) {
		classic := PanelValidationContext{Data: panelBody{ImageUrl: badUrl, ThumbnailUrl: badUrl}}
		require.Error(t, validateImageUrl(classic)())
		require.Error(t, validateThumbnailUrl(classic)())

		v2 := PanelValidationContext{Data: panelBody{ImageUrl: badUrl, ThumbnailUrl: badUrl, MessageUsesComponentsV2: true}}
		require.NoError(t, validateImageUrl(v2)())
		require.NoError(t, validateThumbnailUrl(v2)())
	})

	t.Run("welcome embed", func(t *testing.T) {
		classic := PanelValidationContext{Data: panelBody{WelcomeMessage: emptyEmbed}}
		require.ErrorContains(t, validateWelcomeMessage(classic)(), "does not contain any content")

		v2 := PanelValidationContext{Data: panelBody{WelcomeMessage: emptyEmbed, WelcomeMessageUsesComponentsV2: true}}
		require.NoError(t, validateWelcomeMessage(v2)())
	})

	t.Run("the welcome embed check follows the welcome flag, not the message flag", func(t *testing.T) {
		ctx := PanelValidationContext{Data: panelBody{WelcomeMessage: emptyEmbed, MessageUsesComponentsV2: true}}
		require.Error(t, validateWelcomeMessage(ctx)())
	})
}

func TestClassicEmbedForV2(t *testing.T) {
	title := strPtr("Hello")
	badUrl := strPtr("javascript:alert(1)")

	tests := []struct {
		name string
		in   *types.CustomEmbed
		keep bool
	}{
		{"nil", nil, false},
		{"empty embed", &types.CustomEmbed{}, false},
		{"embed with a title", &types.CustomEmbed{Title: title}, true},
		{"embed with an invalid image url", &types.CustomEmbed{Title: title, ImageUrl: badUrl}, false},
		{"embed over the character limit", &types.CustomEmbed{Description: strPtr(strings.Repeat("a", 4096)), Title: strPtr(strings.Repeat("b", 2000))}, false},
		{"embed with fields only", &types.CustomEmbed{Fields: []types.Field{{Name: "a", Value: "b"}}}, true},
		{"embed title at 256 characters", &types.CustomEmbed{Title: strPtr(strings.Repeat("a", 256))}, true},
		{"embed title over 256 characters fails its struct tags", &types.CustomEmbed{Title: strPtr(strings.Repeat("a", 257))}, false},
		{"embed field with an empty name fails its struct tags", &types.CustomEmbed{Fields: []types.Field{{Name: "", Value: "b"}}}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := classicEmbedForV2(tt.in)
			if tt.keep {
				require.Same(t, tt.in, got)
			} else {
				require.Nil(t, got)
			}
		})
	}
}

func TestNormaliseMultiPanelName(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    *string
		wantErr bool
	}{
		{"blank", "", nil, false},
		{"whitespace only", "  \t\n", nil, false},
		{"trimmed", "  Support  ", strPtr("Support"), false},
		{"100 characters", strings.Repeat("a", 100), strPtr(strings.Repeat("a", 100)), false},
		{"101 characters", strings.Repeat("a", 101), nil, true},
		{"100 characters plus padding", "  " + strings.Repeat("a", 100) + "  ", strPtr(strings.Repeat("a", 100)), false},
		{"100 multibyte characters", strings.Repeat("é", 100), strPtr(strings.Repeat("é", 100)), false},
		{"101 multibyte characters", strings.Repeat("é", 101), nil, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normaliseMultiPanelName(tt.in)
			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func panelConfigs(ids ...int) []panelConfiguration {
	configs := make([]panelConfiguration, len(ids))
	for i, id := range ids {
		configs[i] = panelConfiguration{PanelId: id}
	}
	return configs
}

func TestValidateMultiPanelComponents(t *testing.T) {
	threePanels := panelConfigs(1, 2, 3)

	tests := []struct {
		name    string
		data    multiPanelCreateData
		wantErr string
	}{
		{name: "classic mode skips the tree", data: multiPanelCreateData{Panels: threePanels, Components: texts(60)}},

		// Button mode appends ceil(unplaced / 5) rows plus the buttons.
		{name: "button mode, 3 unplaced reserves 4", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: texts(36)}},
		{name: "button mode, 3 unplaced and one over", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: texts(37)}, wantErr: "Too many components"},
		{name: "button mode, placing a panel frees a slot but keeps the placed button", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: append(texts(33), row(panelBtn(1)))}},
		{name: "button mode, placing a panel uses the full budget", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: append(texts(35), row(panelBtn(1)))}},
		{name: "button mode, placing a panel one over", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: append(texts(36), row(panelBtn(1)))}, wantErr: "Too many components"},
		{name: "button mode, everything placed reserves nothing", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: append(texts(36), row(panelBtn(1), panelBtn(2), panelBtn(3)))}},
		{name: "button mode, everything placed one over", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: append(texts(37), row(panelBtn(1), panelBtn(2), panelBtn(3)))}, wantErr: "Too many components"},
		{name: "button mode, 6 unplaced reserves 2 rows and 6 buttons", data: multiPanelCreateData{UsesComponentsV2: true, Panels: panelConfigs(1, 2, 3, 4, 5, 6), Components: texts(32)}},
		{name: "button mode, 6 unplaced and one over", data: multiPanelCreateData{UsesComponentsV2: true, Panels: panelConfigs(1, 2, 3, 4, 5, 6), Components: texts(33)}, wantErr: "Too many components"},
		{name: "button mode, 5 unplaced reserves 1 row", data: multiPanelCreateData{UsesComponentsV2: true, Panels: panelConfigs(1, 2, 3, 4, 5), Components: texts(34)}},

		// Dropdown mode appends row plus select, unless a dropdown is placed.
		{name: "dropdown mode reserves 2", data: multiPanelCreateData{UsesComponentsV2: true, SelectMenu: true, Panels: threePanels, Components: texts(38)}},
		{name: "dropdown mode reserves 2, one over", data: multiPanelCreateData{UsesComponentsV2: true, SelectMenu: true, Panels: threePanels, Components: texts(39)}, wantErr: "Too many components"},
		{name: "placed dropdown reserves nothing extra", data: multiPanelCreateData{UsesComponentsV2: true, SelectMenu: true, Panels: threePanels, Components: append(texts(38), row(dropdownNode()))}},
		{name: "placed dropdown over the limit", data: multiPanelCreateData{UsesComponentsV2: true, SelectMenu: true, Panels: threePanels, Components: append(texts(39), row(dropdownNode()))}, wantErr: "Too many components"},
		{name: "dropdown mode with every panel placed reserves nothing", data: multiPanelCreateData{UsesComponentsV2: true, SelectMenu: true, Panels: threePanels, Components: append(texts(36), row(panelBtn(1), panelBtn(2), panelBtn(3)))}},
		{name: "placed dropdown with every panel placed as a button", data: multiPanelCreateData{UsesComponentsV2: true, SelectMenu: true, Panels: threePanels, Components: []component.Component{row(panelBtn(1), panelBtn(2), panelBtn(3)), row(dropdownNode())}}, wantErr: "nothing to list"},
		{name: "placed dropdown in button mode", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: []component.Component{row(dropdownNode())}}, wantErr: "Dropdown"},

		{name: "empty tree", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels}},
		{name: "placement of a panel outside the list", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: []component.Component{row(panelBtn(9))}}, wantErr: "not part of this multi-panel"},
		{name: "avatar placeholder is rejected as a gallery url", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: []component.Component{gallery(types.AvatarUrlPlaceholder)}}, wantErr: "Media gallery"},
		{name: "avatar placeholder is rejected as a thumbnail url", data: multiPanelCreateData{UsesComponentsV2: true, Panels: threePanels, Components: []component.Component{section(thumb(types.AvatarUrlPlaceholder), text("a"))}}, wantErr: "Thumbnail"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateMultiPanelComponents(tt.data)

			if tt.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.ErrorContains(t, err, tt.wantErr)
		})
	}
}

func TestMultiPanelReserved(t *testing.T) {
	tests := []struct {
		name           string
		dropdownMode   bool
		dropdownPlaced bool
		unplaced       int
		want           int
	}{
		{"button mode, none", false, false, 0, 0},
		{"button mode, 1", false, false, 1, 2},
		{"button mode, 5", false, false, 5, 6},
		{"button mode, 6", false, false, 6, 8},
		{"button mode, 15", false, false, 15, 18},
		{"dropdown mode, none", true, false, 0, 0},
		{"dropdown mode, some", true, false, 4, 2},
		{"dropdown mode, placed", true, true, 4, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, multiPanelReserved(tt.dropdownMode, tt.dropdownPlaced, tt.unplaced))
		})
	}
}

func TestStripUnknownPlacements(t *testing.T) {
	tests := []struct {
		name   string
		panels []panelConfiguration
		in     []component.Component
		want   int
	}{
		{"nothing to strip", panelConfigs(1, 2), []component.Component{text("a"), row(panelBtn(1), panelBtn(2))}, 2},
		{"unknown button is removed from a mixed row", panelConfigs(1), []component.Component{row(panelBtn(1), panelBtn(2))}, 1},
		{"a row left empty is removed", panelConfigs(1), []component.Component{text("a"), row(panelBtn(2))}, 1},
		{"a container left empty is removed", panelConfigs(1), []component.Component{container(row(panelBtn(2)))}, 0},
		{"a section whose accessory is removed goes with it", panelConfigs(1), []component.Component{section(panelBtn(2), text("a"))}, 0},
		{"a section with a known accessory stays", panelConfigs(2), []component.Component{section(panelBtn(2), text("a"))}, 1},
		{"link buttons and the dropdown are untouched", panelConfigs(1), []component.Component{row(linkBtn("Go", "https://example.com")), row(dropdownNode())}, 2},
		{"a malformed marker is left for validation to reject", panelConfigs(1), []component.Component{row(component.BuildButton(component.Button{CustomId: "panel:abc"}))}, 1},
		{"empty tree", panelConfigs(1), nil, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := multiPanelCreateData{Panels: tt.panels, Components: tt.in}
			d.stripUnknownPlacements()
			require.Len(t, d.Components, tt.want)
		})
	}
}

func TestStripUnknownPlacements_ThenValidates(t *testing.T) {
	d := multiPanelCreateData{
		UsesComponentsV2: true,
		Panels:           panelConfigs(1, 2),
		Components:       []component.Component{text("a"), row(panelBtn(1), panelBtn(7))},
	}

	_, err := validateComponentTree(d.Components, treeRules{validPanelIds: map[int]bool{1: true, 2: true}})
	require.Error(t, err, "the stale placement fails validation until it is stripped")

	d.stripUnknownPlacements()
	require.NoError(t, validateMultiPanelComponents(d))
}

func TestValidateDropdownLabels(t *testing.T) {
	panels := []database.Panel{
		{PanelId: 10, ButtonLabel: "", Title: "Ten"},
		{PanelId: 20, ButtonLabel: "Twenty", Title: "Twenty"},
	}

	t.Run("config is matched by panel id, not slice position", func(t *testing.T) {
		configs := []panelConfiguration{
			{PanelId: 20},
			{PanelId: 10, CustomLabel: strPtr("Custom ten")},
		}

		require.NoError(t, validateDropdownLabels(panels, configs))
	})

	t.Run("a panel with no label anywhere is rejected", func(t *testing.T) {
		configs := []panelConfiguration{{PanelId: 10}, {PanelId: 20}}

		require.ErrorContains(t, validateDropdownLabels(panels, configs), "Ten")
	})

	t.Run("an empty custom label falls back to the button label", func(t *testing.T) {
		configs := []panelConfiguration{{PanelId: 10, CustomLabel: strPtr("")}, {PanelId: 20, CustomLabel: strPtr("")}}

		require.Error(t, validateDropdownLabels(panels, configs))
	})
}

func TestDropHiddenClassicEmbed(t *testing.T) {
	invalid := func() *types.CustomEmbed { return &types.CustomEmbed{Title: strPtr(strings.Repeat("a", 257))} }
	valid := func() *types.CustomEmbed { return &types.CustomEmbed{Title: strPtr("ok")} }

	tests := []struct {
		name     string
		body     panelBody
		wantKept bool
		wantErr  bool
	}{
		{name: "v2 welcome with an invalid hidden embed is dropped", body: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessage: invalid()}},
		{name: "v2 welcome with a valid hidden embed is kept", body: panelBody{WelcomeMessageUsesComponentsV2: true, WelcomeMessage: valid()}, wantKept: true},
		{name: "v2 welcome with no embed", body: panelBody{WelcomeMessageUsesComponentsV2: true}},
		{name: "classic welcome with an invalid embed is still rejected", body: panelBody{WelcomeMessage: invalid()}, wantKept: true, wantErr: true},
		{name: "the message flag alone does not drop the welcome embed", body: panelBody{MessageUsesComponentsV2: true, WelcomeMessage: invalid()}, wantKept: true, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.body.dropHiddenClassicEmbed()
			require.Equal(t, tt.wantKept, tt.body.WelcomeMessage != nil)

			err := validate.Struct(tt.body)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestValidateButtonStyle(t *testing.T) {
	tests := []struct {
		style   component.ButtonStyle
		wantErr bool
	}{
		{0, true},
		{component.ButtonStylePrimary, false},
		{component.ButtonStyleSecondary, false},
		{component.ButtonStyleSuccess, false},
		{component.ButtonStyleDanger, false},
		{component.ButtonStyleLink, true},
		{component.ButtonStylePremium, true},
		{7, true},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprint(tt.style), func(t *testing.T) {
			err := validateButtonStyle(PanelValidationContext{Data: panelBody{ButtonStyle: tt.style}})()
			if tt.wantErr {
				require.ErrorContains(t, err, "Invalid button style")
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestRetainClassicFields(t *testing.T) {
	stored := database.Panel{
		Title:        "Stored title",
		Content:      "Stored content",
		Colour:       0x112233,
		ImageUrl:     strPtr("https://example.com/stored.png"),
		ThumbnailUrl: strPtr("https://example.com/stored-thumb.png"),
	}
	goodUrl := strPtr("https://example.com/new.png")

	tests := []struct {
		name string
		in   panelBody
		want panelBody
	}{
		{
			name: "classic mode is untouched",
			in:   panelBody{Title: "", Content: "", Colour: 0},
			want: panelBody{Title: "", Content: "", Colour: 0},
		},
		{
			name: "v2 request omitting everything keeps the stored values",
			in:   panelBody{MessageUsesComponentsV2: true},
			want: panelBody{MessageUsesComponentsV2: true, Title: "Stored title", Content: "Stored content", Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
		{
			name: "v2 request with valid values replaces them",
			in:   panelBody{MessageUsesComponentsV2: true, Title: "New", Content: "New content", Colour: 0xFFFFFF, ImageUrl: goodUrl, ThumbnailUrl: goodUrl},
			want: panelBody{MessageUsesComponentsV2: true, Title: "New", Content: "New content", Colour: 0xFFFFFF, ImageUrl: goodUrl, ThumbnailUrl: goodUrl},
		},
		{
			name: "title at 80 characters is accepted",
			in:   panelBody{MessageUsesComponentsV2: true, Title: strings.Repeat("a", 80)},
			want: panelBody{MessageUsesComponentsV2: true, Title: strings.Repeat("a", 80), Content: "Stored content", Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
		{
			name: "title at 81 characters keeps the stored one",
			in:   panelBody{MessageUsesComponentsV2: true, Title: strings.Repeat("a", 81)},
			want: panelBody{MessageUsesComponentsV2: true, Title: "Stored title", Content: "Stored content", Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
		{
			name: "whitespace title keeps the stored one",
			in:   panelBody{MessageUsesComponentsV2: true, Title: "   "},
			want: panelBody{MessageUsesComponentsV2: true, Title: "Stored title", Content: "Stored content", Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
		{
			name: "content at 4096 characters is accepted",
			in:   panelBody{MessageUsesComponentsV2: true, Content: strings.Repeat("a", 4096)},
			want: panelBody{MessageUsesComponentsV2: true, Title: "Stored title", Content: strings.Repeat("a", 4096), Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
		{
			name: "content at 4097 characters keeps the stored one",
			in:   panelBody{MessageUsesComponentsV2: true, Content: strings.Repeat("a", 4097)},
			want: panelBody{MessageUsesComponentsV2: true, Title: "Stored title", Content: "Stored content", Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
		{
			name: "colour above 0xFFFFFF keeps the stored one",
			in:   panelBody{MessageUsesComponentsV2: true, Colour: 0x1000000},
			want: panelBody{MessageUsesComponentsV2: true, Title: "Stored title", Content: "Stored content", Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
		{
			name: "invalid urls never replace the stored ones",
			in:   panelBody{MessageUsesComponentsV2: true, ImageUrl: strPtr("javascript:alert(1)"), ThumbnailUrl: strPtr("not a url")},
			want: panelBody{MessageUsesComponentsV2: true, Title: "Stored title", Content: "Stored content", Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
		{
			name: "url over 255 characters keeps the stored one",
			in:   panelBody{MessageUsesComponentsV2: true, ImageUrl: strPtr("https://example.com/" + strings.Repeat("a", 236))},
			want: panelBody{MessageUsesComponentsV2: true, Title: "Stored title", Content: "Stored content", Colour: 0x112233, ImageUrl: stored.ImageUrl, ThumbnailUrl: stored.ThumbnailUrl},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.in.retainClassicFields(stored)
			require.Equal(t, tt.want, tt.in)
		})
	}

	t.Run("nothing stored and nothing valid supplied leaves urls nil", func(t *testing.T) {
		body := panelBody{MessageUsesComponentsV2: true, ImageUrl: strPtr("nope")}
		body.retainClassicFields(database.Panel{Title: "t", Content: "c"})
		require.Nil(t, body.ImageUrl)
		require.Nil(t, body.ThumbnailUrl)
	})
}

func TestValidClassicUrlOrNil(t *testing.T) {
	tests := []struct {
		name string
		in   *string
		want bool
	}{
		{"nil", nil, false},
		{"valid", strPtr("https://example.com/a.png"), true},
		{"javascript scheme", strPtr("javascript:alert(1)"), false},
		{"no scheme", strPtr("example.com/a.png"), false},
		{"255 characters", strPtr("https://example.com/" + strings.Repeat("a", 235)), true},
		{"256 characters", strPtr("https://example.com/" + strings.Repeat("a", 236)), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := validClassicUrlOrNil(tt.in)
			if tt.want {
				require.Same(t, tt.in, got)
			} else {
				require.Nil(t, got)
			}
		})
	}
}
