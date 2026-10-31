package api

import (
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/stretchr/testify/require"
)

func TestPanelEntersComponentsV2(t *testing.T) {
	classic := database.Panel{PanelId: 1}
	v2Message := database.Panel{PanelId: 1, MessageUsesComponentsV2: true}
	v2Welcome := database.Panel{PanelId: 1, WelcomeMessageUsesComponentsV2: true}
	v2Both := database.Panel{PanelId: 1, MessageUsesComponentsV2: true, WelcomeMessageUsesComponentsV2: true}

	tests := []struct {
		name   string
		data   panelBody
		stored database.Panel
		want   bool
	}{
		{name: "create, classic", data: panelBody{}},
		{name: "create, v2 message", data: panelBody{MessageUsesComponentsV2: true}, want: true},
		{name: "create, v2 welcome", data: panelBody{WelcomeMessageUsesComponentsV2: true}, want: true},
		{name: "update, classic stays classic", data: panelBody{}, stored: classic},
		{name: "update, message switches to v2", data: panelBody{MessageUsesComponentsV2: true}, stored: classic, want: true},
		{name: "update, welcome switches to v2", data: panelBody{WelcomeMessageUsesComponentsV2: true}, stored: classic, want: true},
		{name: "update, v2 message stays v2", data: panelBody{MessageUsesComponentsV2: true}, stored: v2Message},
		{name: "update, v2 message goes back to classic", data: panelBody{}, stored: v2Message},
		{name: "update, welcome switches to v2 beside a v2 message", data: panelBody{MessageUsesComponentsV2: true, WelcomeMessageUsesComponentsV2: true}, stored: v2Message, want: true},
		{name: "update, message switches to v2 beside a v2 welcome", data: panelBody{MessageUsesComponentsV2: true, WelcomeMessageUsesComponentsV2: true}, stored: v2Welcome, want: true},
		{name: "update, both stay v2", data: panelBody{MessageUsesComponentsV2: true, WelcomeMessageUsesComponentsV2: true}, stored: v2Both},
		{name: "update, both go back to classic", data: panelBody{}, stored: v2Both},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, tt.data.entersComponentsV2(tt.stored))
		})
	}
}

func TestMultiPanelEntersComponentsV2(t *testing.T) {
	classic := database.MultiPanel{Id: 1}
	v2 := database.MultiPanel{Id: 1, UsesComponentsV2: true}

	tests := []struct {
		name   string
		data   multiPanelCreateData
		stored database.MultiPanel
		want   bool
	}{
		{name: "create, classic", data: multiPanelCreateData{}},
		{name: "create, v2", data: multiPanelCreateData{UsesComponentsV2: true}, want: true},
		{name: "update, classic stays classic", data: multiPanelCreateData{}, stored: classic},
		{name: "update, switches to v2", data: multiPanelCreateData{UsesComponentsV2: true}, stored: classic, want: true},
		{name: "update, stays v2", data: multiPanelCreateData{UsesComponentsV2: true}, stored: v2},
		{name: "update, goes back to classic", data: multiPanelCreateData{}, stored: v2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, tt.data.entersComponentsV2(tt.stored))
		})
	}
}
