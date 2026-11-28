package gallery

import (
	stdjson "encoding/json"
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/stretchr/testify/require"
)

func TestWelcomeMessageResponse(t *testing.T) {
	raw := []byte(`{"id":42,"guild_id":123,"title":"Hi","colour":16711680,"author_name":"Staff","author_icon_url":"https://a.png","footer_text":"Thanks","footer_icon_url":"https://f.png"}`)

	var got map[string]any
	require.NoError(t, stdjson.Unmarshal(WelcomeMessageResponse(raw), &got))

	require.NotContains(t, got, "id")
	require.NotContains(t, got, "guild_id")
	require.NotContains(t, got, "author_name")
	require.Equal(t, "Hi", got["title"])
	require.Equal(t, "#ff0000", got["colour"])
	require.Equal(t, map[string]any{"name": "Staff", "icon_url": "https://a.png", "url": nil}, got["author"])
	require.Equal(t, map[string]any{"text": "Thanks", "icon_url": "https://f.png"}, got["footer"])

	require.Nil(t, WelcomeMessageResponse(nil))
	require.Nil(t, WelcomeMessageResponse([]byte(`{"guild_id":"not a number"}`)))
}

func TestSnapshotResponse(t *testing.T) {
	tag := database.GalleryListing{
		ListingType:  database.GalleryListingTypeTag,
		SnapshotData: []byte(`{"content":"hello","embed":{"id":0,"guild_id":0,"title":"T","colour":null,"footer_text":"F","fields":[{"field_id":7,"embed_id":9,"name":"N","value":"V","inline":true}]}}`),
	}

	var got struct {
		Content string         `json:"content"`
		Embed   map[string]any `json:"embed"`
	}
	require.NoError(t, stdjson.Unmarshal(SnapshotResponse(tag), &got))

	require.Equal(t, "hello", got.Content)
	require.NotContains(t, got.Embed, "id")
	require.NotContains(t, got.Embed, "guild_id")
	require.Equal(t, map[string]any{"text": "F", "icon_url": nil}, got.Embed["footer"])
	require.Equal(t, []any{map[string]any{"name": "N", "value": "V", "inline": true}}, got.Embed["fields"])

	contentOnly := database.GalleryListing{ListingType: database.GalleryListingTypeTag, SnapshotData: []byte(`{"content":"hello"}`)}
	require.JSONEq(t, `{"content":"hello"}`, string(SnapshotResponse(contentOnly)))

	form := database.GalleryListing{ListingType: database.GalleryListingTypeForm, SnapshotData: []byte(`{"title":"F","inputs":[]}`)}
	require.Equal(t, `{"title":"F","inputs":[]}`, string(SnapshotResponse(form)))

	broken := database.GalleryListing{ListingType: database.GalleryListingTypeTag, SnapshotData: []byte(`{"embed":{"guild_id":"x"}}`)}
	require.Nil(t, SnapshotResponse(broken))
}
