package notify

import (
	"encoding/json"
	"testing"

	"github.com/TicketsBot-cloud/common/gdprrelay"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/stretchr/testify/require"
)

func TestCategoryMinChannels(t *testing.T) {
	require.Equal(t, 1, CategoryMinChannels(CategoryGdpr))

	for _, key := range []string{CategoryAffiliate, CategoryIntegrations, CategoryAdminGallery, CategoryAdminAffiliates, CategoryAdminIntegrations, "unknown"} {
		require.Zero(t, CategoryMinChannels(key), key)
	}
}

func TestEffectiveInApp(t *testing.T) {
	tests := []struct {
		category                      string
		inApp, discordDm, emailUsable bool
		want                          bool
	}{
		{category: CategoryAffiliate, want: false},
		{category: CategoryAffiliate, inApp: true, want: true},
		{category: CategoryGdpr, want: true},
		{category: CategoryGdpr, inApp: true, want: true},
		{category: CategoryGdpr, discordDm: true, want: false},
		{category: CategoryGdpr, emailUsable: true, want: false},
		{category: CategoryGdpr, inApp: true, discordDm: true, emailUsable: true, want: true},
	}

	for _, tt := range tests {
		require.Equal(t, tt.want, EffectiveInApp(tt.category, tt.inApp, tt.discordDm, tt.emailUsable), tt)
	}
}

func TestGdprResultText(t *testing.T) {
	tests := []struct {
		name       string
		payload    string
		wantTitle  string
		wantBody   string
		wantLink   string
		wantButton string
	}{
		{
			name:       "failed with error",
			payload:    `{"user_id":1,"request_id":7,"request_type":2,"status":"failed","error":"guild not found"}`,
			wantTitle:  "Your GDPR request failed",
			wantBody:   "Your message anonymization request couldn't be completed: guild not found",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
		{
			name:       "failed without error",
			payload:    `{"user_id":1,"request_id":7,"request_type":0,"status":"failed"}`,
			wantTitle:  "Your GDPR request failed",
			wantBody:   "Your transcript deletion request couldn't be completed. Please try again.",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
		{
			name:       "no data",
			payload:    `{"user_id":1,"request_id":7,"request_type":5,"status":"no_data","export_id":3}`,
			wantTitle:  "Nothing to export",
			wantBody:   "We found no data for your personal data export, so there is nothing to download. It doesn't count towards your 24-hour export limit.",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
		{
			name:       "server export ready",
			payload:    `{"user_id":1,"request_id":7,"request_type":4,"status":"completed","export_id":3}`,
			wantTitle:  "Your server data export is ready",
			wantBody:   "You can download it from the GDPR requests page for 30 days.",
			wantLink:   "/gdpr?export_id=3",
			wantButton: "Download",
		},
		{
			name:       "personal export ready",
			payload:    `{"user_id":1,"request_id":7,"request_type":5,"status":"completed","export_id":3}`,
			wantTitle:  "Your personal data export is ready",
			wantBody:   "You can download it from the GDPR requests page for 30 days.",
			wantLink:   "/gdpr?export_id=3",
			wantButton: "Download",
		},
		{
			name:       "transcript deletion completed",
			payload:    `{"user_id":1,"request_id":7,"request_type":0,"status":"completed","count":12}`,
			wantTitle:  "Your GDPR request is complete",
			wantBody:   "Deleted 12 transcripts.",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
		{
			name:       "one transcript deleted",
			payload:    `{"user_id":1,"request_id":7,"request_type":1,"status":"completed","count":1}`,
			wantTitle:  "Your GDPR request is complete",
			wantBody:   "Deleted 1 transcript.",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
		{
			name:       "no transcripts deleted",
			payload:    `{"user_id":1,"request_id":7,"request_type":0,"status":"completed","count":0}`,
			wantTitle:  "Your GDPR request is complete",
			wantBody:   "No transcripts were found to delete.",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
		{
			name:       "anonymization completed",
			payload:    `{"user_id":1,"request_id":7,"request_type":3,"status":"completed","count":34}`,
			wantTitle:  "Your GDPR request is complete",
			wantBody:   "Anonymized 34 messages.",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
		{
			name:       "one message anonymized",
			payload:    `{"user_id":1,"request_id":7,"request_type":2,"status":"completed","count":1}`,
			wantTitle:  "Your GDPR request is complete",
			wantBody:   "Anonymized 1 message.",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
		{
			name:       "no messages anonymized",
			payload:    `{"user_id":1,"request_id":7,"request_type":2,"status":"completed","count":0}`,
			wantTitle:  "Your GDPR request is complete",
			wantBody:   "No messages of yours were found to anonymize.",
			wantLink:   "/gdpr",
			wantButton: "Open dashboard",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var result gdprrelay.Notification
			require.NoError(t, json.Unmarshal([]byte(tt.payload), &result))
			require.EqualValues(t, 1, result.UserId)

			title, body := gdprResultText(result)
			require.Equal(t, tt.wantTitle, title)
			require.Equal(t, tt.wantBody, body)

			link, button := gdprResultLink(result)
			require.Equal(t, tt.wantLink, link)
			require.Equal(t, tt.wantButton, button)
		})
	}
}

func TestDmComponents(t *testing.T) {
	container := dmComponents("Title", "Body", "", "https://dashboard.example/admin")[0].ComponentData.(component.Container)
	require.Len(t, container.Components, 3, "a DM without a button label has no action row")

	container = dmComponents("Title", "Body", "Download", "https://dashboard.example/gdpr?export_id=3")[0].ComponentData.(component.Container)
	require.Len(t, container.Components, 4)

	row := container.Components[3].ComponentData.(component.ActionRow)
	require.Len(t, row.Components, 1)

	button := row.Components[0].ComponentData.(component.Button)
	require.Equal(t, "Download", button.Label)
	require.Equal(t, component.ButtonStyleLink, button.Style)
	require.Equal(t, "https://dashboard.example/gdpr?export_id=3", *button.Url)
}
