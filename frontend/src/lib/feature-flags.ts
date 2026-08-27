/**
 * Flag keys read by the frontend.
 *
 * Kept in a leaf module so route files and components can both import them
 * without creating an import cycle through the router.
 *
 * A key here must also appear in the API's browserFlags allowlist
 * (dash-api/app/http/endpoints/api/user/featureflags.go), otherwise it is never
 * sent to the browser and reads as off. Rolling a flag out is done in Admin,
 * Feature Flags, and needs no deploy.
 */
export const PRICING_FLAG = "202608_NEW_PRICING_PAGE";
export const ANALYTICS_PANEL_FILTER_FLAG = "202608_ANALYTICS_PANEL_FILTER";
export const SETUP_ONBOARDING_WIZARD_FLAG = "202608_SETUP_ONBOARDING_WIZARD";

/**
 * Kill switch for panel management. On means panels are available; off locks
 * dashboard panel create/edit down (dash-api returns 503, the worker refuses new
 * tickets from existing panel buttons). See useFeatureLock.
 */
export const FEATURE_PANELS = "202608_FEATURE_PANELS";

/**
 * Kill switches for the remaining guild-configuration features. Same polarity
 * as FEATURE_PANELS: on means available, off locks the relevant dashboard
 * create/edit page down via the matching dash-api 503 guard. See useFeatureLock.
 */
export const FEATURE_FORMS = "202608_FEATURE_FORMS";
export const FEATURE_TAGS = "202608_FEATURE_TAGS";
export const FEATURE_TEAMS = "202608_FEATURE_TEAMS";
export const FEATURE_BLACKLIST = "202608_FEATURE_BLACKLIST";
export const FEATURE_WHITELABEL = "202608_FEATURE_WHITELABEL";
export const FEATURE_INTEGRATIONS = "202608_FEATURE_INTEGRATIONS";
export const FEATURE_AUTOMATIONS = "202608_FEATURE_AUTOMATIONS";
