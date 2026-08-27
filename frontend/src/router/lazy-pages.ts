import { lazy, type ComponentType } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyRetry(factory: () => Promise<{ default: ComponentType<any> }>) {
  return lazy(() =>
    factory().catch((err) => {
      const key = "chunk-retry";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return new Promise(() => {}); // never resolves — page is reloading
      }
      sessionStorage.removeItem(key);
      throw err;
    }),
  );
}

export const Servers = lazyRetry(() => import("@/pages/Servers"));
export const Callback = lazyRetry(() => import("@/pages/oauth2/Callback"));
export const NotFound = lazyRetry(() => import("@/pages/404"));

export const Overview = lazyRetry(() => import("@/pages/manage/Overview"));
export const GuildSettings = lazyRetry(() => import("@/pages/manage/GuildSettings"));
export const TranscriptsIndex = lazyRetry(() => import("@/pages/manage/transcripts/_index"));
export const TranscriptsView = lazyRetry(() => import("@/pages/manage/transcripts/view"));
export const GuildLayout = lazyRetry(() => import("@/pages/manage/GuildLayout"));

export const PanelsPage = lazyRetry(() => import("@/pages/manage/panels/_index"));
export const CreatePanelPage = lazyRetry(() => import("@/pages/manage/panels/create"));
export const EditPanelPage = lazyRetry(() => import("@/pages/manage/panels/edit"));
export const CreateMultiPanelPage = lazyRetry(() => import("@/pages/manage/multipanels/create"));
export const EditMultiPanelPage = lazyRetry(() => import("@/pages/manage/multipanels/edit"));

export const FormsPage = lazyRetry(() => import("@/pages/manage/forms/_index"));
export const CreateFormPage = lazyRetry(() => import("@/pages/manage/forms/create"));
export const EditFormPage = lazyRetry(() => import("@/pages/manage/forms/edit"));

export const TeamsPage = lazyRetry(() => import("@/pages/manage/teams/_index"));
export const TagsPage = lazyRetry(() => import("@/pages/manage/tags/_index"));
export const KBPage = lazyRetry(() => import("@/pages/manage/kb/_index"));
export const CreateKBArticlePage = lazyRetry(() => import("@/pages/manage/kb/create"));
export const EditKBArticlePage = lazyRetry(() => import("@/pages/manage/kb/edit"));
export const BlacklistPage = lazyRetry(() => import("@/pages/manage/blacklist/_index"));
export const AuditLogPage = lazyRetry(() => import("@/pages/manage/audit-log/_index"));
export const AnalyticsPage = lazyRetry(() => import("@/pages/manage/analytics/_index"));
export const StaffDetailPage = lazyRetry(() => import("@/pages/manage/analytics/staff"));
export const StaffOverridePage = lazyRetry(() => import("@/pages/manage/staff-override/_index"));

export const TicketsIndex = lazyRetry(() => import("@/pages/manage/tickets/_index"));
export const TicketsView = lazyRetry(() => import("@/pages/manage/tickets/view"));

export const IntegrationsPage = lazyRetry(() => import("@/pages/manage/integrations/_index"));
export const CreateIntegrationPage = lazyRetry(() => import("@/pages/manage/integrations/create"));
export const ViewIntegrationPage = lazyRetry(() => import("@/pages/manage/integrations/view"));
export const ActivateIntegrationPage = lazyRetry(
  () => import("@/pages/manage/integrations/activate"),
);
export const ConfigureIntegrationPage = lazyRetry(
  () => import("@/pages/manage/integrations/configure"),
);
export const ManageIntegrationPage = lazyRetry(() => import("@/pages/manage/integrations/manage"));

export const SetupLayout = lazyRetry(() => import("@/pages/manage/setup/SetupLayout"));

export const LogoutPage = lazyRetry(() => import("@/pages/Logout"));
export const UnsubscribePage = lazyRetry(() => import("@/pages/Unsubscribe"));
export const WhitelabelPage = lazyRetry(() => import("@/pages/Whitelabel"));
export const PremiumLayout = lazyRetry(() => import("@/pages/premium/PremiumLayout"));
export const PricingPage = lazyRetry(() => import("@/pages/premium/Pricing"));
export const SubscriptionPage = lazyRetry(() => import("@/pages/premium/Subscription"));

export const KBLayout = lazyRetry(() => import("@/pages/kb/KBLayout"));
export const KBHome = lazyRetry(() => import("@/pages/kb/_index"));
export const KBArticle = lazyRetry(() => import("@/pages/kb/article"));
export const KBSearchPage = lazyRetry(() => import("@/pages/kb/search"));
export const KBCategoryPage = lazyRetry(() => import("@/pages/kb/category"));

export const GalleryBrowsePage = lazyRetry(() => import("@/pages/gallery/_index"));
export const GalleryViewPage = lazyRetry(() => import("@/pages/gallery/view"));

export const AffiliatePage = lazyRetry(() => import("@/pages/Affiliate"));
export const NotificationsPage = lazyRetry(() => import("@/pages/Notifications"));
export const UserSettingsPage = lazyRetry(() => import("@/pages/UserSettings"));

export const AdminLayout = lazyRetry(() => import("@/pages/admin/AdminLayout"));
export const BotStaffPage = lazyRetry(() => import("@/pages/admin/bot-staff/_index"));
export const AdminGalleryPage = lazyRetry(() => import("@/pages/admin/gallery/_index"));
export const AdminIntegrationsPage = lazyRetry(() => import("@/pages/admin/integrations/_index"));
export const PremiumPage = lazyRetry(() => import("@/pages/admin/premium/_index"));
export const GlobalBlacklistPage = lazyRetry(() => import("@/pages/admin/global-blacklist/_index"));
export const ServerBlacklistPage = lazyRetry(() => import("@/pages/admin/server-blacklist/_index"));
export const AdminPolarProductsPage = lazyRetry(
  () => import("@/pages/admin/polar-products/_index"),
);
export const AdminSkusPage = lazyRetry(() => import("@/pages/admin/skus/_index"));
export const AdminAffiliatePage = lazyRetry(() => import("@/pages/admin/affiliate/_index"));
export const AdminAnalyticsPage = lazyRetry(() => import("@/pages/admin/analytics/_index"));
export const AdminFeatureFlagsPage = lazyRetry(() => import("@/pages/admin/flags/_index"));
export const AdminUtilitiesPage = lazyRetry(() => import("@/pages/admin/utilities/_index"));
export const AdminAuditLogPage = lazyRetry(() => import("@/pages/admin/audit-log/_index"));
