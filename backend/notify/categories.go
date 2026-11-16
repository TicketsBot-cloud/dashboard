package notify

import "github.com/ticketsbot-cloud/dashboard/backend/internal/admin"

const (
	CategoryAffiliate         = "affiliate"
	CategoryIntegrations      = "integrations"
	CategoryGdpr              = "gdpr"
	CategoryAdminGallery      = "admin_gallery"
	CategoryAdminAffiliates   = "admin_affiliates"
	CategoryAdminIntegrations = "admin_integrations"
)

const CategoryGroupAdmin = "admin"

type CategoryInfo struct {
	Key         string          `json:"key"`
	Label       string          `json:"label"`
	Description string          `json:"description"`
	MinTier     admin.AdminTier `json:"min_tier"`
	MinChannels int             `json:"min_channels"`
}

var AllCategories = []CategoryInfo{
	{Key: CategoryAffiliate, Label: "Affiliate", Description: "Application status, referrals, and credit updates", MinTier: admin.AdminTierNone},
	{Key: CategoryIntegrations, Label: "Integrations", Description: "Updates when your public integration request is approved, rejected, or unapproved", MinTier: admin.AdminTierNone},
	{Key: CategoryGdpr, Label: "GDPR requests", Description: "Updates when a GDPR request you made on the dashboard finishes or fails", MinTier: admin.AdminTierNone, MinChannels: 1},
	{Key: CategoryAdminGallery, Label: "Gallery Submissions", Description: "New gallery panel submissions for review", MinTier: admin.AdminTierAdmin},
	{Key: CategoryAdminAffiliates, Label: "Affiliate Applications", Description: "New affiliate applications pending approval", MinTier: admin.AdminTierOwner},
	{Key: CategoryAdminIntegrations, Label: "Integration Requests", Description: "Integration public access requests", MinTier: admin.AdminTierOwner},
}

func AdminCategoryKeys() []string {
	keys := make([]string, 0, len(AllCategories))
	for _, c := range AllCategories {
		if c.MinTier != admin.AdminTierNone {
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

func CategoryMinTier(key string) (admin.AdminTier, bool) {
	for _, c := range AllCategories {
		if c.Key == key {
			return c.MinTier, true
		}
	}
	return admin.AdminTierNone, false
}

func CategoryMinChannels(key string) int {
	for _, c := range AllCategories {
		if c.Key == key {
			return c.MinChannels
		}
	}
	return 0
}

// Below-minimum preferences are stored, shown and delivered with in-app on rather than refused.
func EffectiveInApp(category string, inApp, discordDm, emailUsable bool) bool {
	usable := 0
	for _, on := range []bool{inApp, discordDm, emailUsable} {
		if on {
			usable++
		}
	}
	return inApp || usable < CategoryMinChannels(category)
}

func CategoriesForTier(tier admin.AdminTier) []CategoryInfo {
	categories := make([]CategoryInfo, 0, len(AllCategories))
	for _, c := range AllCategories {
		if admin.TierSatisfies(tier, c.MinTier) {
			categories = append(categories, c)
		}
	}
	return categories
}

func IsCategoryVisibleTo(key string, tier admin.AdminTier) bool {
	minTier, ok := CategoryMinTier(key)
	if !ok {
		return false
	}
	return admin.TierSatisfies(tier, minTier)
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
