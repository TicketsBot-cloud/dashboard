package notify

const (
	CategoryAffiliate         = "affiliate"
	CategoryAdminGallery      = "admin_gallery"
	CategoryAdminAffiliates   = "admin_affiliates"
	CategoryAdminIntegrations = "admin_integrations"
)

type CategoryInfo struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Description string `json:"description"`
	AdminOnly   bool   `json:"admin_only"`
}

var AllCategories = []CategoryInfo{
	{Key: CategoryAffiliate, Label: "Affiliate", Description: "Application status, referrals, and credit updates", AdminOnly: false},
	{Key: CategoryAdminGallery, Label: "Gallery Submissions", Description: "New gallery panel submissions for review", AdminOnly: true},
	{Key: CategoryAdminAffiliates, Label: "Affiliate Applications", Description: "New affiliate applications pending approval", AdminOnly: true},
	{Key: CategoryAdminIntegrations, Label: "Integration Requests", Description: "Integration public access requests", AdminOnly: true},
}

type DefaultPreference struct {
	DiscordDm bool
	Email     bool
	InApp     bool
}

var DefaultPreferences = DefaultPreference{
	DiscordDm: false,
	Email:     false,
	InApp:     true,
}
