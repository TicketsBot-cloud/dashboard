package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestJsonKeys(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		want    map[string]bool
		wantErr bool
	}{
		{name: "top-level keys only", body: `{"name":"x","welcome_message":{"title":"y"}}`, want: map[string]bool{"name": true, "welcome_message": true}},
		{name: "null counts as present", body: `{"name":null,"message_components":null}`, want: map[string]bool{"name": true, "message_components": true}},
		{name: "keys are matched case-insensitively, as binding does", body: `{"Name":"x","MESSAGE_USES_COMPONENTS_V2":true}`, want: map[string]bool{"name": true, "message_uses_components_v2": true}},
		{name: "only the first value is read, as binding does", body: `{"name":"x"} {"title":"y"}`, want: map[string]bool{"name": true}},
		{name: "null body has no keys", body: `null`, want: map[string]bool{}},
		{name: "malformed", body: `{"name":`, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := jsonKeys([]byte(tt.body))
			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func bindTestBody(t *testing.T, body string, obj any) (map[string]bool, error) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(body))

	return bindJSONWithKeys(c, obj)
}

func TestBindJSONWithKeys(t *testing.T) {
	var data panelBody
	keys, err := bindTestBody(t, `{"title":"Help","name":null}`, &data)
	require.NoError(t, err)
	require.Equal(t, "Help", data.Title)
	require.Nil(t, data.Name)
	require.Equal(t, map[string]bool{"title": true, "name": true}, keys)

	_, err = bindTestBody(t, `{"title":`, &data)
	require.Error(t, err)
}

func TestPanelKeepStoredWhenAbsent(t *testing.T) {
	messageTree := `[{"type":10,"content":"message"}]`
	welcomeTree := `[{"type":10,"content":"welcome"}]`
	stored := database.Panel{
		MessageUsesComponentsV2:        true,
		MessageComponents:              &messageTree,
		WelcomeMessageUsesComponentsV2: true,
		WelcomeMessageComponents:       &welcomeTree,
		Name:                           strPtr("Billing"),
	}

	t.Run("absent keys keep the stored values", func(t *testing.T) {
		data := panelBody{Title: "Help"}
		require.NoError(t, data.keepStoredWhenAbsent(map[string]bool{"title": true}, stored))

		require.Equal(t, "Help", data.Title)
		require.True(t, data.MessageUsesComponentsV2)
		require.True(t, data.WelcomeMessageUsesComponentsV2)
		require.Equal(t, stored.Name, data.Name)

		got, err := marshalComponents(data.MessageComponents)
		require.NoError(t, err)
		require.JSONEq(t, messageTree, *got)

		got, err = marshalComponents(data.WelcomeMessageComponents)
		require.NoError(t, err)
		require.JSONEq(t, welcomeTree, *got)
	})

	t.Run("present keys keep the request's values, including false and null", func(t *testing.T) {
		data := panelBody{WelcomeMessageComponents: texts(1)}
		keys := map[string]bool{
			"message_uses_components_v2":         true,
			"message_components":                 true,
			"welcome_message_uses_components_v2": true,
			"welcome_message_components":         true,
			"name":                               true,
		}

		require.NoError(t, data.keepStoredWhenAbsent(keys, stored))
		require.Equal(t, panelBody{WelcomeMessageComponents: texts(1)}, data)
	})

	t.Run("each key is decided on its own", func(t *testing.T) {
		data := panelBody{MessageComponents: texts(2), WelcomeMessageUsesComponentsV2: false}
		keys := map[string]bool{"message_components": true, "welcome_message_uses_components_v2": true}

		require.NoError(t, data.keepStoredWhenAbsent(keys, stored))
		require.True(t, data.MessageUsesComponentsV2)
		require.Len(t, data.MessageComponents, 2)
		require.False(t, data.WelcomeMessageUsesComponentsV2)
		require.Nil(t, data.WelcomeMessageComponents)
		require.Equal(t, stored.Name, data.Name)
	})

	t.Run("nothing stored stays classic and unnamed", func(t *testing.T) {
		var data panelBody
		require.NoError(t, data.keepStoredWhenAbsent(map[string]bool{}, database.Panel{}))
		require.Equal(t, panelBody{}, data)
	})

	t.Run("a corrupt stored V2 tree fails only when its key is absent", func(t *testing.T) {
		corrupt := database.Panel{MessageUsesComponentsV2: true, MessageComponents: strPtr("{not json")}

		var data panelBody
		require.Error(t, data.keepStoredWhenAbsent(map[string]bool{}, corrupt))
		require.NoError(t, data.keepStoredWhenAbsent(map[string]bool{"message_components": true}, corrupt))
	})

	t.Run("a classic message never parses its retained tree", func(t *testing.T) {
		corrupt := database.Panel{MessageComponents: strPtr("{not json"), WelcomeMessageComponents: strPtr("{not json")}

		var data panelBody
		require.NoError(t, data.keepStoredWhenAbsent(map[string]bool{}, corrupt))
		require.Nil(t, data.MessageComponents)
		require.Nil(t, data.WelcomeMessageComponents)
	})
}

func TestMultiPanelKeepStoredWhenAbsent(t *testing.T) {
	tree := `[{"type":10,"content":"stored"}]`
	stored := database.MultiPanel{UsesComponentsV2: true, Components: &tree, Name: strPtr("Help desk")}

	t.Run("absent keys keep the stored values", func(t *testing.T) {
		data := multiPanelCreateData{SelectMenu: true}
		require.NoError(t, data.keepStoredWhenAbsent(map[string]bool{"select_menu": true}, stored))

		require.True(t, data.SelectMenu)
		require.True(t, data.UsesComponentsV2)
		require.Equal(t, "Help desk", data.Name)

		got, err := marshalComponents(data.Components)
		require.NoError(t, err)
		require.JSONEq(t, tree, *got)
	})

	t.Run("present keys keep the request's values, including false and null", func(t *testing.T) {
		var data multiPanelCreateData
		keys := map[string]bool{"uses_components_v2": true, "components": true, "name": true}

		require.NoError(t, data.keepStoredWhenAbsent(keys, stored))
		require.Equal(t, multiPanelCreateData{}, data)
	})

	t.Run("an absent name with nothing stored stays blank", func(t *testing.T) {
		var data multiPanelCreateData
		require.NoError(t, data.keepStoredWhenAbsent(map[string]bool{}, database.MultiPanel{}))
		require.Equal(t, multiPanelCreateData{}, data)
	})

	t.Run("a corrupt stored V2 tree fails only when its key is absent", func(t *testing.T) {
		corrupt := database.MultiPanel{UsesComponentsV2: true, Components: strPtr(`{"a":1}`)}

		var data multiPanelCreateData
		require.Error(t, data.keepStoredWhenAbsent(map[string]bool{}, corrupt))
		require.NoError(t, data.keepStoredWhenAbsent(map[string]bool{"components": true}, corrupt))
	})

	t.Run("a classic message never parses its retained tree", func(t *testing.T) {
		corrupt := database.MultiPanel{Components: strPtr(`{"a":1}`)}

		var data multiPanelCreateData
		require.NoError(t, data.keepStoredWhenAbsent(map[string]bool{}, corrupt))
		require.Nil(t, data.Components)
	})
}

func TestOldClientBodyKeepsStoredComponentsV2AndName(t *testing.T) {
	tree := `[{"type":10,"content":"stored"}]`

	t.Run("panel", func(t *testing.T) {
		stored := database.Panel{MessageUsesComponentsV2: true, MessageComponents: &tree, Name: strPtr("Billing")}

		var data panelBody
		keys, err := bindTestBody(t, `{"title":"Help","content":"Open a ticket","channel_id":"1","welcome_message":null}`, &data)
		require.NoError(t, err)
		require.NoError(t, data.keepStoredWhenAbsent(keys, stored))

		require.True(t, data.MessageUsesComponentsV2)
		require.Len(t, data.MessageComponents, 1)
		require.Equal(t, strPtr("Billing"), data.trimmedName())
		require.False(t, data.entersComponentsV2(stored))
	})

	t.Run("multi-panel", func(t *testing.T) {
		stored := database.MultiPanel{UsesComponentsV2: true, Components: &tree, Name: strPtr("Help desk")}

		var data multiPanelCreateData
		keys, err := bindTestBody(t, `{"channel_id":"1","select_menu":false,"panels":[{"panel_id":1},{"panel_id":2}],"embed":{"title":"Pick"}}`, &data)
		require.NoError(t, err)
		require.NoError(t, data.keepStoredWhenAbsent(keys, stored))

		require.True(t, data.UsesComponentsV2)
		require.Len(t, data.Components, 1)

		name, err := normaliseMultiPanelName(data.Name)
		require.NoError(t, err)
		require.Equal(t, strPtr("Help desk"), name)
		require.False(t, data.entersComponentsV2(stored))
	})
}

// The body a dashboard from before Components V2 sends: the GET response minus its read-only keys.
func TestEchoedGetBodyKeepsStoredTrees(t *testing.T) {
	tree := `[{"type":10,"content":"stored"}]`

	t.Run("panel", func(t *testing.T) {
		stored := database.Panel{PanelId: 1, Title: "Help", MessageUsesComponentsV2: true, MessageComponents: &tree, WelcomeMessageUsesComponentsV2: true, WelcomeMessageComponents: &tree, Name: strPtr("Billing")}
		raw, err := json.Marshal(stored)
		require.NoError(t, err)

		var echo map[string]any
		require.NoError(t, json.Unmarshal(raw, &echo))
		for _, key := range []string{"panel_id", "guild_id", "welcome_message_embed", "force_disabled", "emoji_name", "emoji_id", "emoji_animated"} {
			delete(echo, key)
		}
		require.IsType(t, "", echo["message_components"])
		body, err := json.Marshal(echo)
		require.NoError(t, err)

		var data panelBody
		keys, err := bindTestBody(t, string(body), &data)
		require.NoError(t, err)
		require.False(t, keys["message_components"])
		require.False(t, keys["welcome_message_components"])
		require.True(t, keys["message_uses_components_v2"])
		require.True(t, keys["name"])

		require.NoError(t, data.keepStoredWhenAbsent(keys, stored))
		require.True(t, data.MessageUsesComponentsV2)
		require.Len(t, data.MessageComponents, 1)
		require.Len(t, data.WelcomeMessageComponents, 1)
		require.Equal(t, strPtr("Billing"), data.trimmedName())
		require.False(t, data.entersComponentsV2(stored))
	})

	t.Run("multi-panel", func(t *testing.T) {
		stored := database.MultiPanel{UsesComponentsV2: true, Components: &tree, Name: strPtr("Help desk")}
		body := `{"id":3,"name":"Help desk","channel_id":"1","guild_id":"2","message_id":"4","select_menu":false,"panels":[{"panel_id":1},{"panel_id":2}],"embed":{"title":"Pick"},"uses_components_v2":true,"components":"[{\"type\":10,\"content\":\"stored\"}]"}`

		var data multiPanelCreateData
		keys, err := bindTestBody(t, body, &data)
		require.NoError(t, err)
		require.False(t, keys["components"])

		require.NoError(t, data.keepStoredWhenAbsent(keys, stored))
		require.True(t, data.UsesComponentsV2)
		require.Len(t, data.Components, 1)
		require.Equal(t, "Help desk", data.Name)
		require.False(t, data.entersComponentsV2(stored))
	})

	t.Run("array trees and other bodies bind as before", func(t *testing.T) {
		var data panelBody
		keys, err := bindTestBody(t, `{"message_components":[{"type":10,"content":"new"}],"Title":"x"}`, &data)
		require.NoError(t, err)
		require.True(t, keys["message_components"])
		require.Len(t, data.MessageComponents, 1)
		require.Equal(t, "x", data.Title)

		_, err = bindTestBody(t, `{"message_components":`, &data)
		require.Error(t, err)

		_, err = bindTestBody(t, `[]`, &data)
		require.Error(t, err)
	})
}
