// Package growthbook is a thin client for GrowthBook's management REST API.
//
// This is a different credential and a different surface from the SDK the worker
// and this API use to evaluate flags: the SDK uses a read-only client key scoped
// to one environment, whereas this uses an API key that can mutate flag state.
// That key must never reach the browser, which is why the dashboard talks to
// GrowthBook through handlers here rather than directly.
//
// Only read operations and the atomic toggle are implemented. Authoring targeting
// rules goes through GrowthBook's revision workflow (open a draft, edit rules,
// publish), and a partial implementation of that could silently discard work
// another editor had in progress. Rule authoring stays in GrowthBook's own UI and
// the dashboard deep-links to it.
package growthbook

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ErrNotConfigured is returned when no API key is set, so handlers can answer
// with a clear message instead of a confusing upstream failure.
var ErrNotConfigured = errors.New("growthbook: management API not configured")

// ErrNoSdkClientKey means the project a new flag belongs to cannot be resolved,
// because this deployment has no SDK client key configured.
var ErrNoSdkClientKey = errors.New("growthbook: no SDK client key configured")

// apiVersion is v1 deliberately. GrowthBook Cloud marks v1 deprecated in favour
// of v2, but both are mounted in the self-hosted 5.0.0 release we run, and v1 is
// the version whose request contract is verified against. Move to v2 when
// upgrading GrowthBook, checking the toggle request body shape first.
const apiVersion = "v1"

type Client struct {
	baseUrl string
	apiKey  string
	// sdkClientKey is the read-only SDK key this deployment evaluates flags with.
	// It is held here only to look up which project and environment that key is
	// scoped to, so flags created from the dashboard land where the SDK can see
	// them.
	sdkClientKey string
	http         *http.Client
}

func NewClient(baseUrl, apiKey, sdkClientKey string) *Client {
	return &Client{
		baseUrl:      strings.TrimSuffix(baseUrl, "/"),
		apiKey:       apiKey,
		sdkClientKey: sdkClientKey,
		http: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SdkConnection describes the connection a client key belongs to.
type SdkConnection struct {
	Environment string `json:"environment"`
	Project     string `json:"project"`
}

// SdkConnection resolves the project and environment our own SDK key is scoped to.
//
// This matters because GrowthBook filters the SDK payload by project: a feature
// with no project is invisible to a connection scoped to one, so it silently
// evaluates to its default everywhere. Creating flags into the project the SDK
// actually reads avoids that, without another config value to keep in sync.
func (c *Client) SdkConnection(ctx context.Context) (SdkConnection, error) {
	if c.sdkClientKey == "" {
		return SdkConnection{}, ErrNoSdkClientKey
	}

	var response struct {
		SdkConnection SdkConnection `json:"sdkConnection"`
	}

	if err := c.do(ctx, http.MethodGet, "/sdk-connections/lookup/"+c.sdkClientKey, nil, &response); err != nil {
		return SdkConnection{}, err
	}

	return response.SdkConnection, nil
}

func (c *Client) Configured() bool {
	return c != nil && c.baseUrl != "" && c.apiKey != ""
}

// Feature is the subset of GrowthBook's feature object the dashboard renders.
// Deliberately partial: this client never writes a feature back wholesale, so
// there is no risk of dropping fields it does not model.
type Feature struct {
	Id           string                        `json:"id"`
	Description  string                        `json:"description"`
	Archived     bool                          `json:"archived"`
	ValueType    string                        `json:"valueType"`
	DefaultValue string                        `json:"defaultValue"`
	Owner        string                        `json:"owner"`
	DateCreated  time.Time                     `json:"dateCreated"`
	DateUpdated  time.Time                     `json:"dateUpdated"`
	Tags         []string                      `json:"tags"`
	Environments map[string]FeatureEnvironment `json:"environments"`
}

type FeatureEnvironment struct {
	Enabled bool          `json:"enabled"`
	Rules   []FeatureRule `json:"rules"`
}

// FeatureRule is used for both reading and writing. Optional fields are pointers
// or omitempty so a write only sends what it means: sending coverage: 0 on a force
// rule, or an empty hashAttribute on a rollout, would change behaviour.
//
// Condition is a JSON-encoded string upstream, not an object, so it is carried as
// a string and marshalled by the translation layer.
type FeatureRule struct {
	Id            string   `json:"id,omitempty"`
	Type          string   `json:"type"`
	Description   string   `json:"description,omitempty"`
	Enabled       *bool    `json:"enabled,omitempty"`
	Condition     string   `json:"condition,omitempty"`
	Coverage      *float64 `json:"coverage,omitempty"`
	HashAttribute string   `json:"hashAttribute,omitempty"`
	HashVersion   *int     `json:"hashVersion,omitempty"`
	ExperimentKey string   `json:"trackingKey,omitempty"`
	Value         string   `json:"value,omitempty"`
}

// IsEnabled treats an absent enabled field as enabled, matching GrowthBook's
// documented default.
func (r FeatureRule) IsEnabled() bool {
	return r.Enabled == nil || *r.Enabled
}

func (r FeatureRule) CoverageOr(fallback float64) float64 {
	if r.Coverage == nil {
		return fallback
	}

	return *r.Coverage
}

type Experiment struct {
	Id            string                `json:"id"`
	Name          string                `json:"name"`
	TrackingKey   string                `json:"trackingKey"`
	Status        string                `json:"status"`
	Archived      bool                  `json:"archived"`
	HashAttribute string                `json:"hashAttribute"`
	DateCreated   time.Time             `json:"dateCreated"`
	DateUpdated   time.Time             `json:"dateUpdated"`
	Variations    []ExperimentVariation `json:"variations"`
}

type ExperimentVariation struct {
	VariationId string `json:"variationId"`
	Key         string `json:"key"`
	Name        string `json:"name"`
}

func (c *Client) ListFeatures(ctx context.Context) ([]Feature, error) {
	var response struct {
		Features []Feature `json:"features"`
	}

	if err := c.do(ctx, http.MethodGet, "/features?limit=100", nil, &response); err != nil {
		return nil, err
	}

	return response.Features, nil
}

func (c *Client) ListExperiments(ctx context.Context) ([]Experiment, error) {
	var response struct {
		Experiments []Experiment `json:"experiments"`
	}

	if err := c.do(ctx, http.MethodGet, "/experiments?limit=100", nil, &response); err != nil {
		return nil, err
	}

	return response.Experiments, nil
}

// ToggleFeature enables or disables a feature in the named environments and
// publishes immediately. This is atomic upstream, so unlike a full feature
// update it cannot clobber rules edited elsewhere.
func (c *Client) ToggleFeature(ctx context.Context, featureId string, environments map[string]bool, reason string) error {
	body := struct {
		Reason       string          `json:"reason,omitempty"`
		Environments map[string]bool `json:"environments"`
	}{
		Reason:       reason,
		Environments: environments,
	}

	return c.do(ctx, http.MethodPost, "/features/"+featureId+"/toggle", body, nil)
}

// GetFeature fetches one feature. Used immediately before a rule write so the
// rules array being sent is built from current state.
func (c *Client) GetFeature(ctx context.Context, featureId string) (*Feature, error) {
	var response struct {
		Feature Feature `json:"feature"`
	}

	if err := c.do(ctx, http.MethodGet, "/features/"+featureId, nil, &response); err != nil {
		return nil, err
	}

	return &response.Feature, nil
}

// ReplaceRules sets the rule list for one environment.
//
// POST /features/{id} publishes a new revision immediately, and merges only at
// the top level: an environment object it receives must be complete, because
// `enabled` and `rules` are both required. Omitting `enabled` returns
// 400 "expected boolean, received undefined" rather than leaving it untouched.
//
// So the caller passes the current enabled state through, and must read it
// immediately beforehand. The rules array also replaces wholesale, which is why
// callers send the complete desired list and guard against concurrent edits.
func (c *Client) ReplaceRules(
	ctx context.Context,
	featureId, environment string,
	enabled bool,
	rules []FeatureRule,
) error {
	// Never send null: an absent array and an empty array mean different things,
	// and "no rules" must serialise as [].
	if rules == nil {
		rules = []FeatureRule{}
	}

	body := map[string]any{
		"environments": map[string]any{
			environment: map[string]any{
				"enabled": enabled,
				"rules":   rules,
			},
		},
	}

	return c.do(ctx, http.MethodPost, "/features/"+featureId, body, nil)
}

// CreateFeatureRequest is the minimum needed to create a flag.
type CreateFeatureRequest struct {
	Id          string `json:"id"`
	Description string `json:"description,omitempty"`
	ValueType   string `json:"valueType"`
	// Project must match the SDK connection's project or the SDK never sees the
	// flag. Omitted when empty, which is correct for a single-project org that
	// uses unscoped connections.
	Project      string                        `json:"project,omitempty"`
	DefaultValue string                        `json:"defaultValue"`
	Owner        string                        `json:"owner"`
	Tags         []string                      `json:"tags,omitempty"`
	Environments map[string]FeatureEnvironment `json:"environments,omitempty"`
}

func (c *Client) CreateFeature(ctx context.Context, req CreateFeatureRequest) error {
	return c.do(ctx, http.MethodPost, "/features", req, nil)
}

// ListEnvironments reports the environments configured in GrowthBook, so the
// dashboard can offer real names rather than assuming production and staging.
func (c *Client) ListEnvironments(ctx context.Context) ([]string, error) {
	var response struct {
		Environments []struct {
			Id string `json:"id"`
		} `json:"environments"`
	}

	if err := c.do(ctx, http.MethodGet, "/environments", nil, &response); err != nil {
		return nil, err
	}

	names := make([]string, 0, len(response.Environments))
	for _, environment := range response.Environments {
		names = append(names, environment.Id)
	}

	return names, nil
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	if !c.Configured() {
		return ErrNotConfigured
	}

	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("growthbook: encoding request: %w", err)
		}

		reader = bytes.NewReader(encoded)
	}

	url := fmt.Sprintf("%s/api/%s%s", c.baseUrl, apiVersion, path)

	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return fmt.Errorf("growthbook: building request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("growthbook: %s %s: %w", method, path, err)
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		// Include the upstream status and a bounded slice of its body. A version
		// mismatch shows up as a 404 here, and without this it would be
		// indistinguishable from an empty result.
		snippet, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("growthbook: %s %s returned %d: %s",
			method, path, res.StatusCode, strings.TrimSpace(string(snippet)))
	}

	if out == nil {
		return nil
	}

	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("growthbook: decoding response: %w", err)
	}

	return nil
}
