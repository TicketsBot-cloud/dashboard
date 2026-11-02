package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest/ratelimit"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
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

func stubPremiumClient(t *testing.T, client premium.IPremiumLookupClient) {
	t.Helper()

	prev := rpc.PremiumClient
	t.Cleanup(func() { rpc.PremiumClient = prev })
	rpc.PremiumClient = client
}

func stubFlagGlobals(t *testing.T, ownerId uint64) {
	t.Helper()

	prevFlags, prevOwner := utils.FeatureFlags, config.Conf.Owner
	t.Cleanup(func() { utils.FeatureFlags, config.Conf.Owner = prevFlags, prevOwner })
	config.Conf.Owner = ownerId
}

func offlineFlags(t *testing.T, ruleset string) *featureflags.Client {
	t.Helper()

	client, err := featureflags.NewOffline(context.Background(), zap.NewNop(), ruleset, nil)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, client.Close()) })

	return client
}

type countingPremiumClient struct {
	premium.MockLookupClient
	lookups int
	err     error
}

func (c *countingPremiumClient) GetTierByGuildId(ctx context.Context, guildId uint64, includeVoting bool, token string, ratelimiter *ratelimit.Ratelimiter) (premium.PremiumTier, error) {
	c.lookups++
	if c.err != nil {
		return premium.None, c.err
	}

	return c.MockLookupClient.GetTierByGuildId(ctx, guildId, includeVoting, token, ratelimiter)
}

func TestHasPaidPremium(t *testing.T) {
	tests := []struct {
		name   string
		client premium.MockLookupClient
		want   bool
	}{
		{name: "voting only", client: premium.NewMockLookupClient(premium.Premium, model.EntitlementSourceVoting)},
		{name: "paid", client: premium.NewMockLookupClient(premium.Premium, model.EntitlementSourcePatreon), want: true},
		{name: "none", client: premium.NewMockLookupClient(premium.None, "")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stubPremiumClient(t, &tt.client)

			got, err := hasPaidPremium(context.Background(), 1, &botcontext.BotContext{})
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestComponentsV2BuilderEnabled(t *testing.T) {
	const userId = 42
	stubFlagGlobals(t, userId)
	utils.FeatureFlags = offlineFlags(t, `{"202608_COMPONENTS_V2_BUILDER": {"defaultValue": false, "rules": [{"condition": {"guild_id": "7", "premium_tier": {"$gte": 0}}, "force": true}]}}`)

	ctx := context.Background()
	require.True(t, componentsV2BuilderEnabled(ctx, userId, 7, premium.Premium))
	require.True(t, componentsV2BuilderEnabled(ctx, userId, 7, premium.Whitelabel))
	require.False(t, componentsV2BuilderEnabled(ctx, userId, 7, premium.None))
	require.False(t, componentsV2BuilderEnabled(ctx, userId, 8, premium.Premium))
}

func TestComponentsV2Gate(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const userId, guildId = 42, 7
	stubFlagGlobals(t, userId)
	flagOn := offlineFlags(t, `{"202608_COMPONENTS_V2_BUILDER": {"defaultValue": false, "rules": [{"condition": {"premium_tier": {"$gte": 0}}, "force": true}]}}`)
	flagOff := offlineFlags(t, `{"202608_COMPONENTS_V2_BUILDER": {"defaultValue": false}}`)

	paid := premium.NewMockLookupClient(premium.Premium, model.EntitlementSourcePatreon)
	voting := premium.NewMockLookupClient(premium.Premium, model.EntitlementSourceVoting)
	none := premium.NewMockLookupClient(premium.None, "")
	known, unpaid := premium.Premium, premium.None

	v2Body := panelBody{MessageUsesComponentsV2: true}
	v2Message := database.Panel{MessageUsesComponentsV2: true}

	tests := []struct {
		name                 string
		data                 panelBody
		stored               database.Panel
		client               premium.MockLookupClient
		lookupErr            error
		flagOn               bool
		votingTier, paidTier *premium.PremiumTier
		wantStatus           int
		wantPaid             bool
		wantLookups          int
	}{
		{name: "classic", client: none},
		{name: "back to classic without premium or the flag", stored: v2Message, client: none},
		{name: "entering with the flag off", data: v2Body, client: paid, wantStatus: http.StatusForbidden, wantLookups: 1},
		{name: "staying V2 with the flag off", data: v2Body, stored: v2Message, client: paid, wantPaid: true, wantLookups: 1},
		{name: "voting only", data: v2Body, client: voting, flagOn: true, wantStatus: http.StatusPaymentRequired, wantLookups: 2},
		{name: "welcome-only V2 with paid premium", data: panelBody{WelcomeMessageUsesComponentsV2: true}, client: paid, flagOn: true, wantPaid: true, wantLookups: 2},
		{name: "paid", data: v2Body, client: paid, flagOn: true, wantPaid: true, wantLookups: 2},
		{name: "a known paid tier answers both checks", data: v2Body, client: none, flagOn: true, paidTier: &known, wantPaid: true},
		{name: "a known unpaid tier still looks up the flag's tier", data: v2Body, client: voting, flagOn: true, paidTier: &unpaid, wantStatus: http.StatusPaymentRequired, wantLookups: 1},
		{name: "a known voting tier answers the flag check", data: v2Body, client: paid, flagOn: true, votingTier: &known, wantPaid: true, wantLookups: 1},
		{name: "a failed voting tier lookup", data: v2Body, client: paid, lookupErr: errors.New("premium unavailable"), flagOn: true, wantStatus: http.StatusInternalServerError, wantLookups: 1},
		{name: "a failed paid lookup", data: v2Body, stored: v2Message, client: paid, lookupErr: errors.New("premium unavailable"), wantStatus: http.StatusInternalServerError, wantLookups: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &countingPremiumClient{MockLookupClient: tt.client, err: tt.lookupErr}
			stubPremiumClient(t, client)

			utils.FeatureFlags = flagOff
			if tt.flagOn {
				utils.FeatureFlags = flagOn
			}

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			hasPaid, ok := componentsV2Gate(c, userId, guildId, &botcontext.BotContext{}, tt.data.entersComponentsV2(tt.stored), tt.data.usesComponentsV2(), tt.votingTier, tt.paidTier, "Failed to save")
			require.Equal(t, tt.wantLookups, client.lookups)

			if tt.wantStatus == 0 {
				require.True(t, ok)
				require.Equal(t, tt.wantPaid, hasPaid)
				require.False(t, c.Writer.Written())
				return
			}

			require.False(t, ok)
			require.Equal(t, tt.wantStatus, w.Code)

			if tt.wantStatus == http.StatusInternalServerError {
				require.Len(t, c.Errors, 1)
				require.Empty(t, w.Body.String())

				var apiError *app.ApiError
				require.ErrorAs(t, c.Errors.Last(), &apiError)
				require.Equal(t, "Failed to save", apiError.ExternalMessage)
				return
			}

			want := componentsV2UnavailableMessage
			if tt.wantStatus == http.StatusPaymentRequired {
				want = componentsV2PremiumMessage
			}

			var body map[string]any
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
			require.Equal(t, want, body["error"])
		})
	}
}
