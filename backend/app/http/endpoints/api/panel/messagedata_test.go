package api

import (
	"encoding/json"
	"testing"

	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Regression coverage for a live bug: Discord rejected an edit to an already-V2 panel
// message ("components[0]: Value of field \"type\" must be one of (1,)") because Flags
// was only set on the first Classic-to-V2 transition. EditMessageData.Flags has no
// `omitempty`, so leaving it unset on a V2-to-V2 edit sent an explicit "flags":0, and
// Discord validated the submitted Components tree against Classic (ActionRow-only) rules.

func TestPanelMessageData_BuildEditData_FlagsAlwaysSetInV2Mode(t *testing.T) {
	textDisplay := component.Component{
		Type:          component.ComponentTextDisplay,
		ComponentData: component.TextDisplay{Content: "hello"},
	}

	cases := []struct {
		name         string
		wasAlreadyV2 bool
	}{
		{"first classic-to-v2 transition", false},
		{"ongoing v2-to-v2 edit", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := &panelMessageData{
				UsesComponentsV2: true,
				Components:       []component.Component{textDisplay},
				ButtonLabel:      "Open a ticket",
				CustomId:         "open_ticket",
			}

			data := p.buildEditData(tc.wasAlreadyV2)

			require.Equal(t, message.SumFlags(message.FlagComponentsV2), data.Flags, "Flags must always be the V2 flag in V2 mode, regardless of wasAlreadyV2")

			// Guard the underlying wire-format assumption directly: Flags has no
			// omitempty, so a zero value would previously have serialised as
			// "flags":0 rather than being omitted.
			raw, err := json.Marshal(data)
			require.NoError(t, err)

			var decoded map[string]interface{}
			require.NoError(t, json.Unmarshal(raw, &decoded))
			assert.EqualValues(t, message.FlagComponentsV2, decoded["flags"], "flags must be non-zero on the wire")

			// The guild-authored tree plus the system-appended open-ticket button
			// must both be present, and the top-level type must remain valid for V2.
			require.Len(t, data.Components, 2)
			assert.Equal(t, component.ComponentTextDisplay, data.Components[0].Type)
			assert.Equal(t, component.ComponentActionRow, data.Components[1].Type)
		})
	}
}

func TestPanelMessageData_BuildEditData_ClassicModeUnaffected(t *testing.T) {
	p := &panelMessageData{
		UsesComponentsV2: false,
		Title:            "Support",
		ButtonLabel:      "Open a ticket",
		CustomId:         "open_ticket",
	}

	data := p.buildEditData(false)

	assert.Zero(t, data.Flags)
	require.Len(t, data.Embeds, 1)
	require.Len(t, data.Components, 1)
}

func TestMultiPanelMessageData_BuildEditData_FlagsAlwaysSetInV2Mode(t *testing.T) {
	textDisplay := component.Component{
		Type:          component.ComponentTextDisplay,
		ComponentData: component.TextDisplay{Content: "hello"},
	}

	systemComponents := []component.Component{
		component.BuildActionRow(component.BuildButton(component.Button{
			Label:    "Support",
			CustomId: "multipanel_0",
			Style:    component.ButtonStylePrimary,
		})),
	}

	cases := []struct {
		name         string
		wasAlreadyV2 bool
	}{
		{"first classic-to-v2 transition", false},
		{"ongoing v2-to-v2 edit", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			d := &multiPanelMessageData{
				UsesComponentsV2: true,
				Components:       []component.Component{textDisplay},
			}

			data := d.buildEditData(d.Components, systemComponents, tc.wasAlreadyV2)

			require.Equal(t, message.SumFlags(message.FlagComponentsV2), data.Flags, "Flags must always be the V2 flag in V2 mode, regardless of wasAlreadyV2")

			raw, err := json.Marshal(data)
			require.NoError(t, err)

			var decoded map[string]interface{}
			require.NoError(t, json.Unmarshal(raw, &decoded))
			assert.EqualValues(t, message.FlagComponentsV2, decoded["flags"], "flags must be non-zero on the wire")

			require.Len(t, data.Components, 2)
			assert.Equal(t, component.ComponentTextDisplay, data.Components[0].Type)
			assert.Equal(t, component.ComponentActionRow, data.Components[1].Type)
		})
	}
}

func TestMultiPanelMessageData_BuildEditData_ClassicModeUnaffected(t *testing.T) {
	d := &multiPanelMessageData{
		UsesComponentsV2: false,
		Embed:            embed.NewEmbed(),
	}

	systemComponents := []component.Component{
		component.BuildActionRow(component.BuildButton(component.Button{
			Label:    "Support",
			CustomId: "multipanel_0",
			Style:    component.ButtonStylePrimary,
		})),
	}

	data := d.buildEditData(d.Components, systemComponents, false)

	assert.Zero(t, data.Flags)
	require.Len(t, data.Components, 1)
}
