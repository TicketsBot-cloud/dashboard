package growthbook

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func newTestServer(t *testing.T, handler http.HandlerFunc) (*Client, func()) {
	t.Helper()

	server := httptest.NewServer(handler)

	return NewClient(server.URL, "secret-key", "sdk-test-key"), server.Close
}

// GrowthBook requires both enabled and rules on an environment object. Omitting
// enabled returns 400 "expected boolean, received undefined" rather than leaving
// it untouched, so the body shape is pinned here.
func TestReplaceRulesSendsCompleteEnvironmentObject(t *testing.T) {
	var body map[string]any
	var authorization string
	var path string

	client, closeServer := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		authorization = r.Header.Get("Authorization")

		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	})
	t.Cleanup(closeServer)

	coverage := 0.25
	enabled := true

	err := client.ReplaceRules(context.Background(), "202608_NEW_PRICING_PAGE", "dev", true, []FeatureRule{
		{Type: "rollout", Enabled: &enabled, Coverage: &coverage, HashAttribute: "guild_id", Value: "true"},
	})
	require.NoError(t, err)

	require.Equal(t, "/api/v1/features/202608_NEW_PRICING_PAGE", path)
	require.Equal(t, "Bearer secret-key", authorization)

	environments, ok := body["environments"].(map[string]any)
	require.True(t, ok, "body must carry environments")

	dev, ok := environments["dev"].(map[string]any)
	require.True(t, ok, "body must carry the named environment")

	require.Contains(t, dev, "enabled", "enabled is required by GrowthBook")
	require.Equal(t, true, dev["enabled"])
	require.Contains(t, dev, "rules")

	// Only the named environment is touched.
	require.Len(t, environments, 1)
}

func TestReplaceRulesPreservesDisabledState(t *testing.T) {
	var body map[string]any

	client, closeServer := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{}`))
	})
	t.Cleanup(closeServer)

	require.NoError(t, client.ReplaceRules(context.Background(), "flag", "production", false, nil))

	environments := body["environments"].(map[string]any)
	production := environments["production"].(map[string]any)

	require.Equal(t, false, production["enabled"], "a rules edit must not enable a disabled flag")
	// nil rules must serialise as an empty array, not null: they mean different
	// things and null fails validation.
	require.Equal(t, []any{}, production["rules"])
}

// An upstream failure must carry the status and body through, otherwise a version
// mismatch or validation error is indistinguishable from an empty result.
func TestUpstreamErrorsIncludeStatusAndBody(t *testing.T) {
	client, closeServer := newTestServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"Request body: [environments.dev.enabled] Invalid input"}`))
	})
	t.Cleanup(closeServer)

	err := client.ReplaceRules(context.Background(), "flag", "dev", true, nil)
	require.Error(t, err)
	require.Contains(t, err.Error(), "400")
	require.Contains(t, err.Error(), "environments.dev.enabled")
}

func TestNotConfiguredIsDistinguishable(t *testing.T) {
	for _, client := range []*Client{
		nil,
		NewClient("", "", ""),
		NewClient("https://gb", "", ""),
		NewClient("", "key", ""),
	} {
		require.False(t, client.Configured())

		err := client.ReplaceRules(context.Background(), "flag", "dev", true, nil)
		require.ErrorIs(t, err, ErrNotConfigured)
	}
}

func TestListFeaturesUnwrapsResponse(t *testing.T) {
	client, closeServer := newTestServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"features":[
			{"id":"202608_NEW_PRICING_PAGE","valueType":"boolean","defaultValue":"false",
			 "environments":{"dev":{"enabled":true,"rules":[]}}}
		]}`))
	})
	t.Cleanup(closeServer)

	features, err := client.ListFeatures(context.Background())
	require.NoError(t, err)
	require.Len(t, features, 1)
	require.Equal(t, "202608_NEW_PRICING_PAGE", features[0].Id)
	require.True(t, features[0].Environments["dev"].Enabled)
}

// GrowthBook filters the SDK payload by project, so a flag created without the
// connection's project is invisible to the SDK and silently evaluates to its
// default. Creates must carry it.
func TestCreateFeatureSendsProject(t *testing.T) {
	var body map[string]any

	client, closeServer := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{}`))
	})
	t.Cleanup(closeServer)

	require.NoError(t, client.CreateFeature(context.Background(), CreateFeatureRequest{
		Id:           "202609_THING",
		ValueType:    "boolean",
		Project:      "prj_abc",
		DefaultValue: "false",
		Owner:        "1",
		Environments: map[string]FeatureEnvironment{
			"dev": {Enabled: false, Rules: []FeatureRule{}},
		},
	}))

	require.Equal(t, "prj_abc", body["project"])

	// An unscoped connection needs no project, so it must be omitted rather than
	// sent as an empty string, which GrowthBook would reject.
	body = nil
	require.NoError(t, client.CreateFeature(context.Background(), CreateFeatureRequest{
		Id: "202609_OTHER", ValueType: "boolean", DefaultValue: "false", Owner: "1",
	}))
	require.NotContains(t, body, "project")
}

func TestSdkConnectionResolvesProjectAndEnvironment(t *testing.T) {
	var path string

	client, closeServer := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_, _ = w.Write([]byte(`{"sdkConnection":{"environment":"dev","project":"prj_abc"}}`))
	})
	t.Cleanup(closeServer)

	connection, err := client.SdkConnection(context.Background())
	require.NoError(t, err)

	require.Equal(t, "/api/v1/sdk-connections/lookup/sdk-test-key", path)
	require.Equal(t, "dev", connection.Environment)
	require.Equal(t, "prj_abc", connection.Project)
}

func TestSdkConnectionWithoutClientKey(t *testing.T) {
	client := NewClient("https://gb", "key", "")

	_, err := client.SdkConnection(context.Background())
	require.ErrorIs(t, err, ErrNoSdkClientKey)
}

func TestListEnvironmentsReturnsIds(t *testing.T) {
	client, closeServer := newTestServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"environments":[{"id":"production"},{"id":"dev"}]}`))
	})
	t.Cleanup(closeServer)

	names, err := client.ListEnvironments(context.Background())
	require.NoError(t, err)
	require.Equal(t, []string{"production", "dev"}, names)
}
