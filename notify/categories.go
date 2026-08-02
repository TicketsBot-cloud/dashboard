package notify

const (
	CategoryAffiliate         = "affiliate"
	CategoryIntegrations      = "integrations"
	CategoryAdminGallery      = "admin_gallery"
	CategoryAdminAffiliates   = "admin_affiliates"
	CategoryAdminIntegrations = "admin_integrations"
)

const CategoryGroupAdmin = "admin"

type CategoryInfo struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Description string `json:"description"`
	AdminOnly   bool   `json:"admin_only"`
}

var AllCategories = []CategoryInfo{
	{Key: CategoryAffiliate, Label: "Affiliate", Description: "Application status, referrals, and credit updates", AdminOnly: false},
	{Key: CategoryIntegrations, Label: "Integrations", Description: "Updates when your public integration request is approved, rejected, or unapproved", AdminOnly: false},
	{Key: CategoryAdminGallery, Label: "Gallery Submissions", Description: "New gallery panel submissions for review", AdminOnly: true},
	{Key: CategoryAdminAffiliates, Label: "Affiliate Applications", Description: "New affiliate applications pending approval", AdminOnly: true},
	{Key: CategoryAdminIntegrations, Label: "Integration Requests", Description: "Integration public access requests", AdminOnly: true},
}

func AdminCategoryKeys() []string {
	keys := make([]string, 0, len(AllCategories))
	for _, c := range AllCategories {
		if c.AdminOnly {
			keys = append(keys, c.Key)
		}
	}
	return keys
}

func IsValidCategory(key string) bool {
	for _, c := range AllCategories {
		if c.Key == key {
			return true
		}
	}
	return false
}

func ResolveCategoryFilter(param string) ([]string, bool) {
	switch {
	case param == "":
		return nil, true
	case param == CategoryGroupAdmin:
		return AdminCategoryKeys(), true
	case IsValidCategory(param):
		return []string{param}, true
	default:
		return nil, false
	}
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
