package api

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/stretchr/testify/require"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"go.uber.org/zap"
)

func testPanel(panelId int, label, customId string) database.PanelWithCustomization {
	return database.PanelWithCustomization{
		Panel: database.Panel{
			PanelId:     panelId,
			ButtonLabel: label,
			CustomId:    customId,
			ButtonStyle: int(component.ButtonStylePrimary),
		},
	}
}

func marshalToMap(t *testing.T, v any) map[string]any {
	t.Helper()

	raw, err := json.Marshal(v)
	require.NoError(t, err)

	var decoded map[string]any
	require.NoError(t, json.Unmarshal(raw, &decoded))
	return decoded
}

func TestV2EditData(t *testing.T) {
	data := v2EditData([]component.Component{text("hello")})
	decoded := marshalToMap(t, data)

	require.EqualValues(t, message.FlagComponentsV2, decoded["flags"])
	require.Equal(t, []any{}, decoded["embeds"], "a V2 edit must send an explicit empty embeds array")
	require.Equal(t, "", decoded["content"])
	require.Equal(t, map[string]any{"replied_user": false}, decoded["allowed_mentions"], "an empty allowed_mentions object allows no mentions")
	require.Len(t, decoded["components"], 1)
}

func TestPanelMessageData_BuildEditData(t *testing.T) {
	t.Run("v2 appends the open ticket row to the authored tree", func(t *testing.T) {
		p := &panelMessageData{
			UsesComponentsV2: true,
			Components:       []component.Component{text("hello")},
			ButtonLabel:      "Open a ticket",
			CustomId:         "open_ticket",
		}

		data := p.buildEditData()

		require.Equal(t, message.SumFlags(message.FlagComponentsV2), data.Flags)
		require.NotNil(t, data.AllowedMentions)
		require.NotNil(t, data.Embeds)
		require.Empty(t, data.Embeds)
		require.Len(t, data.Components, 2)
		require.Equal(t, component.ComponentTextDisplay, data.Components[0].Type)
		require.Equal(t, component.ComponentActionRow, data.Components[1].Type)
	})

	t.Run("classic is unchanged", func(t *testing.T) {
		p := &panelMessageData{Title: "Support", ButtonLabel: "Open a ticket", CustomId: "open_ticket"}

		data := p.buildEditData()
		decoded := marshalToMap(t, data)

		require.Zero(t, data.Flags)
		require.Nil(t, data.AllowedMentions)
		require.NotContains(t, decoded, "allowed_mentions")
		require.Len(t, data.Embeds, 1)
		require.Len(t, data.Components, 1)
	})
}

func TestMultiPanelMessageData_BuildEditData(t *testing.T) {
	t.Run("v2", func(t *testing.T) {
		d := &multiPanelMessageData{UsesComponentsV2: true}
		data := d.buildEditData([]component.Component{text("hello")})

		require.Equal(t, message.SumFlags(message.FlagComponentsV2), data.Flags)
		require.NotNil(t, data.AllowedMentions)
		require.Empty(t, data.Embeds)
		require.Len(t, data.Components, 1)
	})

	t.Run("classic is unchanged", func(t *testing.T) {
		d := &multiPanelMessageData{Embed: embed.NewEmbed()}
		data := d.buildEditData([]component.Component{row(linkBtn("Go", "https://example.com"))})

		require.Zero(t, data.Flags)
		require.Nil(t, data.AllowedMentions)
		require.Len(t, data.Embeds, 1)
		require.Len(t, data.Components, 1)
	})
}

func rowButtons(t *testing.T, c component.Component) []component.Button {
	t.Helper()

	r, ok := c.ComponentData.(component.ActionRow)
	require.True(t, ok)

	buttons := make([]component.Button, len(r.Components))
	for i, child := range r.Components {
		buttons[i], ok = child.ComponentData.(component.Button)
		require.True(t, ok)
	}
	return buttons
}

func TestBuildComponents_Classic(t *testing.T) {
	panels := []database.PanelWithCustomization{testPanel(1, "One", "c1"), testPanel(2, "Two", "c2")}

	t.Run("ignores any tree", func(t *testing.T) {
		d := multiPanelMessageData{Components: []component.Component{row(panelBtn(1))}}

		tree, system := d.buildComponents(panels)
		require.Nil(t, tree)
		require.Len(t, system, 1)
		require.Len(t, rowButtons(t, system[0]), 2)
	})

	t.Run("splits button rows at 5", func(t *testing.T) {
		many := make([]database.PanelWithCustomization, 11)
		for i := range many {
			many[i] = testPanel(i+1, "P", "c")
		}

		_, system := (&multiPanelMessageData{}).buildComponents(many)
		require.Len(t, system, 3)
		require.Len(t, rowButtons(t, system[0]), 5)
		require.Len(t, rowButtons(t, system[1]), 5)
		require.Len(t, rowButtons(t, system[2]), 1)
	})

	t.Run("exactly 5 panels is one row", func(t *testing.T) {
		five := []database.PanelWithCustomization{testPanel(1, "P", "a"), testPanel(2, "P", "b"), testPanel(3, "P", "c"), testPanel(4, "P", "d"), testPanel(5, "P", "e")}

		_, system := (&multiPanelMessageData{}).buildComponents(five)
		require.Len(t, system, 1)
	})

	t.Run("dropdown uses the configured placeholder", func(t *testing.T) {
		d := multiPanelMessageData{SelectMenu: true, SelectMenuPlaceholder: strPtr("Pick one")}

		_, system := d.buildComponents(panels)
		require.Len(t, system, 1)

		sm := system[0].ComponentData.(component.ActionRow).Components[0].ComponentData.(component.SelectMenu)
		require.Equal(t, "multipanel", sm.CustomId)
		require.Equal(t, "Pick one", sm.Placeholder)
		require.Len(t, sm.Options, 2)
	})

	t.Run("dropdown falls back to the default placeholder", func(t *testing.T) {
		d := multiPanelMessageData{SelectMenu: true}

		_, system := d.buildComponents(panels)
		sm := system[0].ComponentData.(component.ActionRow).Components[0].ComponentData.(component.SelectMenu)
		require.Equal(t, "Select a topic...", sm.Placeholder)
	})

	t.Run("no panels appends nothing", func(t *testing.T) {
		tree, system := (&multiPanelMessageData{}).buildComponents(nil)
		require.Nil(t, tree)
		require.Nil(t, system)
	})
}

func TestBuildComponents_V2(t *testing.T) {
	panels := []database.PanelWithCustomization{testPanel(1, "One", "c1"), testPanel(2, "Two", "c2"), testPanel(3, "Three", "c3")}

	t.Run("placed panels are resolved and the rest are appended", func(t *testing.T) {
		d := multiPanelMessageData{UsesComponentsV2: true, Components: []component.Component{text("intro"), row(panelBtn(2))}}

		tree, system := d.buildComponents(panels)
		require.Len(t, tree, 2)

		placed := rowButtons(t, tree[1])
		require.Len(t, placed, 1)
		require.Equal(t, "c2", placed[0].CustomId)
		require.Equal(t, "Two", placed[0].Label)

		require.Len(t, system, 1)
		appended := rowButtons(t, system[0])
		require.Len(t, appended, 2)
		require.Equal(t, "c1", appended[0].CustomId)
		require.Equal(t, "c3", appended[1].CustomId)
	})

	t.Run("everything placed appends nothing", func(t *testing.T) {
		d := multiPanelMessageData{UsesComponentsV2: true, Components: []component.Component{row(panelBtn(1), panelBtn(2), panelBtn(3))}}

		_, system := d.buildComponents(panels)
		require.Nil(t, system)
	})

	t.Run("placed dropdown lists only unplaced panels, wherever the buttons sit", func(t *testing.T) {
		d := multiPanelMessageData{
			UsesComponentsV2: true,
			SelectMenu:       true,
			Components:       []component.Component{row(dropdownNode()), container(row(panelBtn(1)))},
		}

		tree, system := d.buildComponents(panels)
		require.Nil(t, system, "a placed dropdown replaces the appended one")
		require.Len(t, tree, 2)

		sm := tree[0].ComponentData.(component.ActionRow).Components[0].ComponentData.(component.SelectMenu)
		require.Equal(t, "multipanel", sm.CustomId)
		require.Len(t, sm.Options, 2)
		require.Equal(t, "c2", sm.Options[0].Value)
		require.Equal(t, "c3", sm.Options[1].Value)
	})

	t.Run("placed and appended dropdowns share the configured placeholder", func(t *testing.T) {
		placeholder := strPtr("Choose")

		placed := multiPanelMessageData{UsesComponentsV2: true, SelectMenu: true, SelectMenuPlaceholder: placeholder, Components: []component.Component{row(dropdownNode())}}
		tree, _ := placed.buildComponents(panels)
		require.Equal(t, "Choose", tree[0].ComponentData.(component.ActionRow).Components[0].ComponentData.(component.SelectMenu).Placeholder)

		appended := multiPanelMessageData{UsesComponentsV2: true, SelectMenu: true, SelectMenuPlaceholder: placeholder}
		_, system := appended.buildComponents(panels)
		require.Equal(t, "Choose", system[0].ComponentData.(component.ActionRow).Components[0].ComponentData.(component.SelectMenu).Placeholder)
	})

	t.Run("dropdown mode without a placed dropdown appends one", func(t *testing.T) {
		d := multiPanelMessageData{UsesComponentsV2: true, SelectMenu: true, Components: []component.Component{text("hi"), row(panelBtn(1))}}

		_, system := d.buildComponents(panels)
		require.Len(t, system, 1)

		sm := system[0].ComponentData.(component.ActionRow).Components[0].ComponentData.(component.SelectMenu)
		require.Len(t, sm.Options, 2)
	})

	t.Run("a dropdown with nothing left to list is dropped with its row", func(t *testing.T) {
		d := multiPanelMessageData{
			UsesComponentsV2: true,
			SelectMenu:       true,
			Components:       []component.Component{text("hi"), row(dropdownNode()), row(panelBtn(1), panelBtn(2), panelBtn(3))},
		}

		tree, system := d.buildComponents(panels)
		require.Nil(t, system)
		require.Len(t, tree, 2)
		require.Equal(t, component.ComponentTextDisplay, tree[0].Type)
		require.Equal(t, component.ComponentActionRow, tree[1].Type)
	})

	t.Run("a placed dropdown is dropped in button mode", func(t *testing.T) {
		d := multiPanelMessageData{UsesComponentsV2: true, Components: []component.Component{text("hi"), row(dropdownNode())}}

		tree, system := d.buildComponents(panels)
		require.Len(t, tree, 1)
		require.Len(t, system, 1)
		require.Len(t, rowButtons(t, system[0]), 3)
	})

	t.Run("a second dropdown is dropped", func(t *testing.T) {
		d := multiPanelMessageData{UsesComponentsV2: true, SelectMenu: true, Components: []component.Component{row(dropdownNode()), row(dropdownNode())}}

		tree, _ := d.buildComponents(panels)
		require.Len(t, tree, 1)
	})

	t.Run("a placement of a panel no longer in the multi-panel is dropped with what it empties", func(t *testing.T) {
		d := multiPanelMessageData{
			UsesComponentsV2: true,
			Components: []component.Component{
				text("hi"),
				row(panelBtn(99)),
				container(row(panelBtn(98))),
				section(panelBtn(97), text("side")),
				row(panelBtn(98), panelBtn(1)),
			},
		}

		tree, system := d.buildComponents(panels)
		require.Len(t, tree, 2)
		require.Equal(t, component.ComponentTextDisplay, tree[0].Type)
		require.Len(t, rowButtons(t, tree[1]), 1)
		require.Len(t, rowButtons(t, system[0]), 2)
	})

	t.Run("a panel placed twice is only resolved once", func(t *testing.T) {
		d := multiPanelMessageData{UsesComponentsV2: true, Components: []component.Component{row(panelBtn(1)), row(panelBtn(1))}}

		tree, _ := d.buildComponents(panels)
		require.Len(t, tree, 1)
	})

	t.Run("a link button and a section with a link accessory are kept", func(t *testing.T) {
		d := multiPanelMessageData{UsesComponentsV2: true, Components: []component.Component{
			row(linkBtn("Docs", "https://example.com")),
			section(linkBtn("More", "https://example.com/more"), text("side")),
			section(thumb("https://example.com/a.png"), text("pic")),
			gallery("https://example.com/1.png"),
			component.BuildSeparator(component.Separator{}),
		}}

		tree, _ := d.buildComponents(panels)
		require.Len(t, tree, 5)
	})
}

// A "panel:" marker, or any custom_id the guild authored, must never reach Discord.
func TestBuildComponents_NoMarkerReachesDiscord(t *testing.T) {
	panels := []database.PanelWithCustomization{testPanel(1, "One", "c1"), testPanel(2, "Two", "c2")}

	hostile := []component.Component{
		row(panelBtn(1), panelBtn(99)),
		row(component.BuildButton(component.Button{Label: "x", Style: component.ButtonStylePrimary, CustomId: "panel:abc"})),
		row(component.BuildButton(component.Button{Label: "x", Style: component.ButtonStylePrimary, CustomId: "panel:01"})),
		row(component.BuildButton(component.Button{Label: "x", Style: component.ButtonStylePrimary, CustomId: "close"})),
		row(component.BuildButton(component.Button{Label: "x", Style: component.ButtonStyleLink, CustomId: "panel:2", Url: strPtr("https://example.com")})),
		container(row(panelBtn(98)), section(panelBtn(97), text("a")), row(panelBtn(2))),
		section(component.BuildButton(component.Button{Label: "x", Style: component.ButtonStylePrimary, CustomId: "panel:5"}), text("a")),
		row(component.BuildSelectMenu(component.SelectMenu{CustomId: "something-else"})),
		component.BuildLabel(component.Label{Label: "x"}),
		component.Component{Type: component.ComponentInputText, ComponentData: component.InputText{}},
		component.BuildFile(component.File{}),
	}

	for _, dropdownMode := range []bool{false, true} {
		d := multiPanelMessageData{UsesComponentsV2: true, SelectMenu: dropdownMode, Components: hostile}

		tree, system := d.buildComponents(panels)

		raw, err := json.Marshal(append(tree, system...))
		require.NoError(t, err)

		require.False(t, strings.Contains(string(raw), "panel:"), "marker leaked into the outgoing payload: %s", raw)
		require.NotContains(t, string(raw), `"custom_id":"close"`)
		require.NotContains(t, string(raw), "something-else")
		require.NotContains(t, string(raw), `"type":19`)
		require.NotContains(t, string(raw), `"type":13`)
	}
}

func TestMapComponentTree_DropsParentsThatCannotRender(t *testing.T) {
	dropAll := func(component.Component) (component.Component, bool) { return component.Component{}, false }
	keepAll := func(c component.Component) (component.Component, bool) { return c, true }

	tree := []component.Component{
		container(row(linkBtn("Go", "https://example.com"))),
		section(thumb("https://example.com/a.png"), text("a")),
	}

	require.Empty(t, mapComponentTree(tree, dropAll))
	require.Len(t, mapComponentTree(tree, keepAll), 2)
	require.Empty(t, mapComponentTree(nil, keepAll))
}

func TestCorruptStoredTreeStaysComponentsV2(t *testing.T) {
	log.Logger = zap.NewNop()

	corrupt := strPtr("{not json")
	valid := strPtr(`[{"type":10,"content":"hi"}]`)

	t.Run("panel", func(t *testing.T) {
		tests := []struct {
			name           string
			components     *string
			wantComponents int
		}{
			{"corrupt tree renders empty", corrupt, 0},
			{"wrong json shape renders empty", strPtr(`{"a":1}`), 0},
			{"null column is an empty tree", nil, 0},
			{"valid tree is kept", valid, 1},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := panelIntoMessageData(database.Panel{MessageUsesComponentsV2: true, MessageComponents: tt.components, CustomId: "open"}, false)
				require.True(t, data.UsesComponentsV2)
				require.Len(t, data.Components, tt.wantComponents)

				edit := data.buildEditData()
				require.NotZero(t, edit.Flags)
				require.Empty(t, edit.Embeds)
				require.Len(t, edit.Components, tt.wantComponents+1, "the open ticket row is still rendered")
			})
		}
	})

	t.Run("multi-panel", func(t *testing.T) {
		tests := []struct {
			name           string
			components     *string
			wantComponents int
		}{
			{"corrupt tree renders empty", corrupt, 0},
			{"valid tree is kept", valid, 1},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				data := multiPanelIntoMessageData(database.MultiPanel{UsesComponentsV2: true, Components: tt.components}, footerPolicy{})
				require.True(t, data.UsesComponentsV2)
				require.Nil(t, data.Embed)
				require.Len(t, data.Components, tt.wantComponents)

				tree, system := data.buildComponents([]database.PanelWithCustomization{testPanel(1, "One", "c1")})
				require.Len(t, tree, tt.wantComponents)
				require.Len(t, system, 1, "the system rows still render")
			})
		}
	})

	t.Run("a classic panel is unaffected", func(t *testing.T) {
		data := panelIntoMessageData(database.Panel{MessageComponents: corrupt}, false)
		require.False(t, data.UsesComponentsV2)
	})
}
