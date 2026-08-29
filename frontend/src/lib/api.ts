import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { API_URL } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth";
import { showApiErrorToast } from "@/lib/api-error";
import { router } from "@/router";
import type {
  User,
  FeatureFlagExperiment,
  FeatureFlagList,
  FeatureFlagRule,
  Guild,
  GuildChannel,
  GuildRole,
  GuildSettings,
  GuildEmoji,
  PremiumState,
  Panel,
  MultiPanel,
  MultiPanelRequest,
  Form,
  FormInput,
  FormInputOption,
  SupportHoursData,
  Ticket,
  OpenTicket,
  TicketLabel,
  TicketViewResponse,
  TranscriptPayload,
  Tag,
  Team,
  AuditLogResponse,
  AnalyticsOverview,
  BasicOverview,
  StaffAnalytics,
  StaffDetailAnalytics,
  PanelAnalyticsResponse,
  WhitelabelBot,
  WhitelabelError,
  BotStaffMember,
  GlobalBlacklistEntry,
  ServerBlacklistEntry,
  AdminEntitlement,
  PremiumKeyEntry,
  SkuWithDetails,
  SubscriptionSku,
  PolarProduct,
  PolarSubscription,
  PolarCheckoutResponse,
  UserEntitlement,
  LegacyEntitlement,
  Integration,
  TicketMember,
  KBArticle,
  KBCategory,
  KBCustomisation,
  KBGuildInfo,
  PermCheckResponse,
  GalleryListing,
  GallerySubmission,
  OnboardingState,
  AffiliateCode,
  AffiliateReferral,
  AffiliateStatusResponse,
  AdminAffiliateCode,
  AdminFlaggedReferral,
  AdminAdoptionData,
  AdminConfigData,
  AdminRetentionData,
  AdminUsageData,
  AffiliateRedeemResponse,
  Notification,
  NotificationPreference,
  UserSettings,
  WhitelabelRecreateStatus,
} from "@/types";

type FormInputMutation = Omit<Partial<FormInput>, "options"> & {
  options?: Array<
    Pick<FormInputOption, "label" | "value"> &
      Partial<Pick<FormInputOption, "id" | "form_input_id" | "position" | "description">>
  >;
};

const DEFAULT_TIMEOUT_MS = 10_000;
/** Discord-backed endpoints can be slow under load. */
const DISCORD_HEAVY_TIMEOUT_MS = 20_000;
/** Above the analytics handlers' own 10s deadline, so theirs is what fires. */
const ANALYTICS_TIMEOUT_MS = 20_000;

const MAX_CONCURRENT_REQUESTS = 4;
let activeRequests = 0;
const requestWaiters: Array<() => void> = [];

function acquireRequestSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestWaiters.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseRequestSlot() {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = requestWaiters.shift();
  if (next) next();
}

type RequestSlotConfig = { _requestSlot?: boolean };

/** Set on a request config when the caller shows its own error UI. */
type SkipErrorToastConfig = { _skipErrorToast?: boolean };
export const SKIP_ERROR_TOAST = {
  _skipErrorToast: true,
} as AxiosRequestConfig & SkipErrorToastConfig;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    "x-tickets": "true",
    "Content-Type": "application/json",
  },
});

// Request interceptor - concurrency limit + auth token
api.interceptors.request.use(
  async (config) => {
    await acquireRequestSlot();
    (config as RequestSlotConfig)._requestSlot = true;

    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = token;
    }

    return config;
  },
  (error) => {
    toast.error("Failed to send request");
    return Promise.reject(error);
  },
);

// Response interceptor - toast errors + auth redirect
api.interceptors.response.use(
  (response) => {
    if ((response.config as RequestSlotConfig)._requestSlot) {
      releaseRequestSlot();
    }
    return response;
  },
  (error: AxiosError) => {
    if ((error.config as RequestSlotConfig | undefined)?._requestSlot) {
      releaseRequestSlot();
    }

    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      setTimeout(() => {
        router.navigate("/");
      }, 2000);
    }

    // Bulk endpoints and opted-out callers manage their own error UI - skip the global toast
    const url = error.config?.url ?? "";
    const skipToast =
      url.includes("/tickets/bulk-") ||
      (error.config as SkipErrorToastConfig | undefined)?._skipErrorToast === true;

    if (!skipToast) {
      showApiErrorToast(error);
    }

    return Promise.reject(error);
  },
);

// ─── Typed API client ────────────────────────────────────────────────────────

export const apiClient = {
  auth: {
    callback: (code: string) => api.post(`/callback?code=${code}`),
    logout: () => api.post("/logout"),
  },

  user: {
    getCurrent: () => api.get<User>("/user/me"),
    update: (data: Partial<User>) => api.patch<User>("/user/me", data),
    getPermissionLevel: (guildId: string) =>
      api.get<{ success: boolean; permission_level: number }>("/user/permission-level", {
        params: { guild: guildId },
      }),
    /** Server-evaluated flags for the logged-in user; only allowlisted keys. */
    featureFlags: () => api.get<Record<string, unknown>>("/user/feature-flags"),
    /**
     * Same allowlisted flags, evaluated with guild context so "Specific
     * servers"/"Percentage of servers"/"Premium servers" targeting rules can match.
     * The caller fails closed on error, so a global error toast would be noise.
     */
    guildFeatureFlags: (guildId: string) =>
      api.get<Record<string, unknown>>(`/api/${guildId}/feature-flags`, SKIP_ERROR_TOAST),
  },

  whitelabel: {
    get: () =>
      api.get<WhitelabelBot>("/user/whitelabel/", {
        validateStatus: (s) => s === 200 || s === 404,
      }),
    create: (token: string, config?: AxiosRequestConfig) =>
      api.post<{ bot: WhitelabelBot; username: string }>("/user/whitelabel/", { token }, config),
    delete: (config?: AxiosRequestConfig) => api.delete("/user/whitelabel/", config),
    getErrors: () => api.get<{ errors: WhitelabelError[] }>("/user/whitelabel/errors"),
    resync: (config?: AxiosRequestConfig) =>
      api.post("/user/whitelabel/resync", {}, { timeout: 30000, ...config }),
    updateStatus: (status: string, statusType: string, config?: AxiosRequestConfig) =>
      api.post("/user/whitelabel/status", { status, status_type: statusType }, config),
    deleteStatus: (config?: AxiosRequestConfig) => api.delete("/user/whitelabel/status", config),
  },

  guilds: {
    reload: () =>
      api.post<{ success: boolean; guilds: Guild[]; reauthenticate_required?: boolean }>(
        "/user/guilds/reload",
      ),
    getAll: () => api.get<Guild[]>("/guilds"),
    getById: (guildId: string) => api.get<Guild>(`/guilds/${guildId}`),
    getInfo: (guildId: string) =>
      api.get<{ id: string | number; name: string; icon: string }>(`/api/${guildId}/guild`),
    getChannels: (guildId: string) =>
      api.get<GuildChannel[]>(`/api/${guildId}/channels`, { timeout: DISCORD_HEAVY_TIMEOUT_MS }),
    getRoles: (guildId: string) =>
      api.get<{ roles: GuildRole[] }>(`/api/${guildId}/roles`, {
        timeout: DISCORD_HEAVY_TIMEOUT_MS,
      }),
    getSettings: (guildId: string) => api.get<GuildSettings>(`/api/${guildId}/settings`),
    updateSettings: (guildId: string, settings: Partial<GuildSettings>) =>
      api.post<GuildSettings>(`/api/${guildId}/settings`, settings),
    getPremium: (guildId: string, includeVoting: boolean) =>
      api.get<PremiumState>(`/api/${guildId}/premium?include_voting=${includeVoting}`),
    getEmojis: (guildId: string) =>
      api.get<GuildEmoji[]>(`/api/${guildId}/emojis`, { timeout: DISCORD_HEAVY_TIMEOUT_MS }),
    searchMembers: (guildId: string, query: string) =>
      api.get<Array<{ user: User }>>(
        `/api/${guildId}/members/search?query=${encodeURIComponent(query)}`,
      ),
  },

  panels: {
    getByGuild: (guildId: string) => api.get<Panel[]>(`/api/${guildId}/panels`),
    getById: (guildId: string, panelId: string) =>
      api.get<Panel>(`/api/${guildId}/panels/${panelId}`),
    create: (guildId: string, panel: Partial<Panel>, config?: AxiosRequestConfig) =>
      api.post<Panel>(`/api/${guildId}/panels`, panel, config),
    update: (
      guildId: string,
      panelId: string,
      panel: Partial<Panel>,
      config?: AxiosRequestConfig,
    ) => api.patch<Panel>(`/api/${guildId}/panels/${panelId}`, panel, config),
    delete: (guildId: string, panelId: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/${guildId}/panels/${panelId}`, config),
    resend: (guildId: string, panelId: string, config?: AxiosRequestConfig) =>
      api.post(`/api/${guildId}/panels/${panelId}`, undefined, config),
    deleteCooldowns: (guildId: string, panelId: string) =>
      api.delete(`/api/${guildId}/panels/${panelId}/cooldowns`),
    getSupportHours: (guildId: string, panelId: string) =>
      api.get<SupportHoursData>(`/api/${guildId}/panels/${panelId}/support-hours`),
    setSupportHours: (guildId: string, panelId: string, data: SupportHoursData) =>
      api.post(`/api/${guildId}/panels/${panelId}/support-hours`, data),
    deleteSupportHours: (guildId: string, panelId: string) =>
      api.delete(`/api/${guildId}/panels/${panelId}/support-hours`),
    checkPermissions: (guildId: string) =>
      api.get<PermCheckResponse>(`/api/${guildId}/panels/perm-check`),
  },

  multiPanels: {
    getByGuild: (guildId: string) =>
      api.get<{ data: Array<{ id: number; title: string | null }> }>(
        `/api/${guildId}/multi-panels`,
      ),
    getById: (guildId: string, id: string) =>
      api.get<{ data: MultiPanel }>(`/api/${guildId}/multi-panels/${id}`),
    create: (guildId: string, data: MultiPanelRequest, config?: AxiosRequestConfig) =>
      api.post<MultiPanel>(`/api/${guildId}/multi-panels`, data, config),
    update: (guildId: string, id: string, data: Partial<MultiPanel>, config?: AxiosRequestConfig) =>
      api.patch<MultiPanel>(`/api/${guildId}/multi-panels/${id}`, data, config),
    delete: (guildId: string, id: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/${guildId}/multi-panels/${id}`, config),
    resend: (guildId: string, id: string, config?: AxiosRequestConfig) =>
      api.post(`/api/${guildId}/multi-panels/${id}`, undefined, config),
  },

  forms: {
    getByGuild: (guildId: string) => api.get<Form[]>(`/api/${guildId}/forms`),
    create: (guildId: string, data: Partial<Form>, config?: AxiosRequestConfig) =>
      api.post<Form>(`/api/${guildId}/forms`, data, config),
    update: (guildId: string, formId: string, data: Partial<Form>, config?: AxiosRequestConfig) =>
      api.patch<Form>(`/api/${guildId}/forms/${formId}`, data, config),
    updateInputs: (
      guildId: string,
      formId: string,
      data: { create: FormInputMutation[]; update: FormInputMutation[]; delete: number[] },
      config?: AxiosRequestConfig,
    ) => api.patch(`/api/${guildId}/forms/${formId}/inputs`, data, config),
    delete: (guildId: string, formId: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/${guildId}/forms/${formId}`, config),
  },

  tickets: {
    list: (guildId: string, body: unknown) =>
      api.post<{
        tickets: OpenTicket[];
        panel_titles: Record<string, string>;
        resolved_users: Record<string, { username: string; global_name?: string }>;
        labels: Record<string, TicketLabel[]>;
        self_id: string;
      }>(`/api/${guildId}/tickets`, body),
    getById: (guildId: string, ticketId: string) =>
      api.get<TicketViewResponse>(`/api/${guildId}/tickets/${ticketId}`, SKIP_ERROR_TOAST),
    close: (guildId: string, ticketId: string, reason: string) =>
      api.delete(`/api/${guildId}/tickets/${ticketId}`, { data: { reason } }),
    claim: (guildId: string, ticketId: string) =>
      api.post(`/api/${guildId}/tickets/${ticketId}/claim`),
    unclaim: (guildId: string, ticketId: string) =>
      api.delete(`/api/${guildId}/tickets/${ticketId}/claim`),
    transfer: (guildId: string, ticketId: string, userId: string) =>
      api.post(`/api/${guildId}/tickets/${ticketId}/transfer`, { user_id: userId }),
    closeRequest: (guildId: string, ticketId: string, reason?: string, closeDelay?: number) =>
      api.post(`/api/${guildId}/tickets/${ticketId}/close-request`, {
        reason: reason || null,
        close_delay: closeDelay || null,
      }),
    sendMessage: (guildId: string, ticketId: string, content: string) =>
      api.post(`/api/${guildId}/tickets/${ticketId}`, {
        message: { type: "message", content },
      }),
    sendTag: (guildId: string, ticketId: string, tagId: string) =>
      api.post(`/api/${guildId}/tickets/${ticketId}/tag`, { tag_id: tagId }),
    bulkClose: (guildId: string, ticketIds: number[], reason: string) =>
      api.post<{ closed: number[]; failed: Record<string, string>; background_count?: number }>(
        `/api/${guildId}/tickets/bulk-close`,
        { ticket_ids: ticketIds, reason },
        { timeout: 90000 },
      ),
    bulkCloseRequest: (
      guildId: string,
      ticketIds: number[],
      reason?: string,
      closeDelay?: number,
    ) =>
      api.post<{ sent: number[]; failed: Record<string, string>; background_count?: number }>(
        `/api/${guildId}/tickets/bulk-close-request`,
        { ticket_ids: ticketIds, reason: reason || null, close_delay: closeDelay || null },
        { timeout: 90000 },
      ),
    bulkSendMessage: (guildId: string, ticketIds: number[], content: string) =>
      api.post<{ sent: number[]; failed: Record<string, string>; background_count?: number }>(
        `/api/${guildId}/tickets/bulk-send-message`,
        { ticket_ids: ticketIds, content },
        { timeout: 90000 },
      ),
    bulkSendTag: (guildId: string, ticketIds: number[], tagId: string) =>
      api.post<{ sent: number[]; failed: Record<string, string>; background_count?: number }>(
        `/api/${guildId}/tickets/bulk-send-tag`,
        { ticket_ids: ticketIds, tag_id: tagId },
        { timeout: 90000 },
      ),
    getMembers: (guildId: string, ticketId: string) =>
      api.get<{ members: TicketMember[] }>(`/api/${guildId}/tickets/${ticketId}/members`),
    assignLabels: (guildId: string, ticketId: number, labelIds: number[]) =>
      api.put(`/api/${guildId}/tickets/${ticketId}/labels`, { label_ids: labelIds }),
    updateCloseReason: (guildId: string, ticketId: number, reason: string | null) =>
      api.patch(`/api/${guildId}/tickets/${ticketId}/close-reason`, { reason }),
  },

  ticketLabels: {
    getByGuild: (guildId: string) => api.get<TicketLabel[]>(`/api/${guildId}/ticket-labels`),
    create: (guildId: string, name: string, colour: number) =>
      api.post<TicketLabel>(`/api/${guildId}/ticket-labels`, { name, colour }),
    delete: (guildId: string, labelId: number) =>
      api.delete(`/api/${guildId}/ticket-labels/${labelId}`),
  },

  transcripts: {
    list: (guildId: string, body: unknown) =>
      api.post<{ transcripts: Ticket[]; total_pages: number; total_count: number }>(
        `/api/${guildId}/transcripts`,
        body,
      ),
    getById: (guildId: string, transcriptId: string) =>
      api.get<TranscriptPayload>(`/api/${guildId}/transcripts/${transcriptId}/render`),
  },

  tags: {
    getByGuild: (guildId: string) => api.get<Record<string, Tag>>(`/api/${guildId}/tags`),
    upsert: (guildId: string, tag: Tag, config?: AxiosRequestConfig) =>
      api.put<Tag>(`/api/${guildId}/tags`, tag, config),
    delete: (guildId: string, tagId: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/${guildId}/tags`, { ...config, data: { tag_id: tagId } }),
  },

  blacklist: {
    getByGuild: (guildId: string, page: number) =>
      api.get(`/api/${guildId}/blacklist?page=${page}`),
    add: (guildId: string, entityType: number, snowflake: string, config?: AxiosRequestConfig) =>
      api.post(`/api/${guildId}/blacklist`, { entity_type: entityType, snowflake }, config),
    removeUser: (guildId: string, userId: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/${guildId}/blacklist/user/${userId}`, config),
    removeRole: (guildId: string, roleId: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/${guildId}/blacklist/role/${roleId}`, config),
  },

  staffOverride: {
    get: (guildId: string) => api.get<{ has_override: boolean }>(`/api/${guildId}/staff-override`),
    create: (guildId: string, timePeriod: number) =>
      api.post(`/api/${guildId}/staff-override`, { time_period: timePeriod }),
    delete: (guildId: string) => api.delete(`/api/${guildId}/staff-override`),
  },

  teams: {
    getByGuild: (guildId: string) => api.get<Team[]>(`/api/${guildId}/team`),
    create: (guildId: string, name: string, config?: AxiosRequestConfig) =>
      api.post<Team>(`/api/${guildId}/team`, { name }, config),
    delete: (guildId: string, teamId: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/${guildId}/team/${teamId}`, config),
    getMembers: (guildId: string, teamId: string) => api.get(`/api/${guildId}/team/${teamId}`),
    getPermissions: (guildId: string, teamId: string) =>
      api.get(`/api/${guildId}/team/${teamId}/permissions`),
    updatePermissions: (
      guildId: string,
      teamId: string,
      data: unknown,
      config?: AxiosRequestConfig,
    ) => api.patch(`/api/${guildId}/team/${teamId}/permissions`, data, config),
    addMember: (
      guildId: string,
      teamId: string,
      memberId: string,
      type: number,
      config?: AxiosRequestConfig,
    ) => api.put(`/api/${guildId}/team/${teamId}/${memberId}?type=${type}`, undefined, config),
    removeMember: (
      guildId: string,
      teamId: string,
      memberId: string,
      type: number,
      config?: AxiosRequestConfig,
    ) => api.delete(`/api/${guildId}/team/${teamId}/${memberId}?type=${type}`, config),
  },

  auditLog: {
    list: (guildId: string, body: unknown) =>
      api.post<AuditLogResponse>(`/api/${guildId}/audit-logs`, body),
  },

  premium: {
    getProducts: () => api.get<PolarProduct[]>("/api/premium/products"),
    getSubscriptions: () => api.get<PolarSubscription[]>("/api/premium/@me/polar/subscriptions"),
    getEntitlements: () =>
      api.get<{
        entitlements: UserEntitlement[];
        legacy_entitlement: LegacyEntitlement | null;
        polar_subscriptions: PolarSubscription[];
        permitted_server_count?: number;
        selected_guilds?: string[];
      }>("/api/premium/@me/entitlements"),
    checkout: (productId: string, affiliateCode?: string) =>
      api.post<PolarCheckoutResponse>("/api/premium/@me/polar/checkout", {
        product_id: productId,
        ...(affiliateCode ? { affiliate_code: affiliateCode } : {}),
      }),
    changeSubscription: (subId: string, newProductId: string) =>
      api.post(`/api/premium/@me/polar/subscriptions/${subId}/change`, {
        new_product_id: newProductId,
      }),
    cancelSubscription: (subId: string) =>
      api.post(`/api/premium/@me/polar/subscriptions/${subId}/cancel`),
    uncancelSubscription: (subId: string) =>
      api.post(`/api/premium/@me/polar/subscriptions/${subId}/uncancel`),
    updateActiveGuilds: (guildIds: string[]) =>
      api.put("/api/premium/@me/active-guilds", { selected_guilds: guildIds }),
    getOrders: () =>
      api.get<{
        orders: {
          id: string;
          created_at: string;
          status: string;
          paid: boolean;
          total_amount: number;
          tax_amount: number;
          currency: string;
          billing_reason: string;
          invoice_number: string;
          product_name?: string;
          has_invoice: boolean;
          refunded_amount: number;
        }[];
      }>("/api/premium/@me/polar/orders"),
    getOrderInvoice: (orderId: string) =>
      api.get<{ invoice_url: string }>(`/api/premium/@me/polar/orders/${orderId}/invoice`),
  },

  integrations: {
    listAvailable: (guildId: string, page: number) =>
      api.get<{ integrations: Integration[]; total_pages: number; total_count: number }>(
        `/api/${guildId}/integrations/available?page=${page}`,
      ),
    listOwned: () => api.get<Integration[]>("/api/integrations/self"),
    create: (data: Partial<Integration>, config?: AxiosRequestConfig) =>
      api.post<Integration>("/api/integrations", data, config),
    view: (integrationId: string) =>
      api.get<Integration>(`/api/integrations/view/${integrationId}`),
    viewDetail: (integrationId: string) =>
      api.get<Integration>(`/api/integrations/view/${integrationId}/detail`),
    update: (integrationId: string, data: Partial<Integration>, config?: AxiosRequestConfig) =>
      api.patch<Integration>(`/api/integrations/${integrationId}`, data, config),
    delete: (integrationId: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/integrations/${integrationId}`, config),
    makePublic: (integrationId: string, data: unknown, config?: AxiosRequestConfig) =>
      api.post(`/api/integrations/${integrationId}/public`, data, config),
    getGuildStatus: (guildId: string, integrationId: string) =>
      api.get<{ active: boolean }>(`/api/${guildId}/integrations/${integrationId}`),
    addToGuild: (
      guildId: string,
      integrationId: string,
      secrets: Record<string, string>,
      config?: AxiosRequestConfig,
    ) => api.post(`/api/${guildId}/integrations/${integrationId}`, { secrets }, config),
    updateGuildSecrets: (
      guildId: string,
      integrationId: string,
      secrets: Record<string, string>,
      config?: AxiosRequestConfig,
    ) => api.patch(`/api/${guildId}/integrations/${integrationId}`, { secrets }, config),
    removeFromGuild: (guildId: string, integrationId: string, config?: AxiosRequestConfig) =>
      api.delete(`/api/${guildId}/integrations/${integrationId}`, config),
  },

  overview: {
    getBasic: (guildId: string) => api.get<BasicOverview>(`/api/${guildId}/overview`),
  },

  analytics: {
    getOverview: (guildId: string, days?: number, panels?: string, caseInsensitive?: boolean) => {
      const params = new URLSearchParams();
      if (days != null) params.set("days", String(days));
      if (panels) params.set("panels", panels);
      if (caseInsensitive) params.set("case_insensitive", "1");
      const qs = params.toString();
      return api.get<AnalyticsOverview>(`/api/${guildId}/analytics/overview${qs ? `?${qs}` : ""}`, {
        timeout: ANALYTICS_TIMEOUT_MS,
      });
    },
    getStaff: (guildId: string, days?: number, panels?: string) => {
      const params = new URLSearchParams();
      if (days != null) params.set("days", String(days));
      if (panels) params.set("panels", panels);
      const qs = params.toString();
      return api.get<StaffAnalytics>(`/api/${guildId}/analytics/staff${qs ? `?${qs}` : ""}`, {
        ...SKIP_ERROR_TOAST,
        timeout: ANALYTICS_TIMEOUT_MS,
      });
    },
    getStaffDetail: (guildId: string, userId: string) =>
      api.get<StaffDetailAnalytics>(`/api/${guildId}/analytics/staff/${userId}`),
    getPanels: (guildId: string, days?: number, panels?: string) => {
      const params = new URLSearchParams();
      if (days != null) params.set("days", String(days));
      if (panels) params.set("panels", panels);
      const qs = params.toString();
      return api.get<PanelAnalyticsResponse>(
        `/api/${guildId}/analytics/panels${qs ? `?${qs}` : ""}`,
        { timeout: ANALYTICS_TIMEOUT_MS },
      );
    },
  },

  kb: {
    listArticles: (guildId: string) => api.get<KBArticle[]>(`/api/${guildId}/kb/articles`),
    getArticle: (guildId: string, articleId: number) =>
      api.get<KBArticle>(`/api/${guildId}/kb/articles/${articleId}`),
    createArticle: (guildId: string, data: Partial<KBArticle>) =>
      api.post<KBArticle>(`/api/${guildId}/kb/articles`, data),
    updateArticle: (guildId: string, articleId: number, data: Partial<KBArticle>) =>
      api.patch<KBArticle>(`/api/${guildId}/kb/articles/${articleId}`, data),
    deleteArticle: (guildId: string, articleId: number) =>
      api.delete(`/api/${guildId}/kb/articles/${articleId}`),
    reorderArticles: (guildId: string, articleIds: number[]) =>
      api.patch<{ success: boolean }>(`/api/${guildId}/kb/reorder`, {
        article_ids: articleIds,
      }),
    listCategories: (guildId: string) => api.get<KBCategory[]>(`/api/${guildId}/kb/categories`),
    createCategory: (guildId: string, data: Partial<KBCategory>) =>
      api.post<KBCategory>(`/api/${guildId}/kb/categories`, data),
    updateCategory: (guildId: string, catId: number, data: Partial<KBCategory>) =>
      api.patch<KBCategory>(`/api/${guildId}/kb/categories/${catId}`, data),
    deleteCategory: (guildId: string, catId: number) =>
      api.delete(`/api/${guildId}/kb/categories/${catId}`),
    getSettings: (guildId: string) => api.get<KBCustomisation>(`/api/${guildId}/kb/settings`),
    updateSettings: (guildId: string, data: Partial<KBCustomisation>) =>
      api.patch<KBCustomisation>(`/api/${guildId}/kb/settings`, data),
  },

  kbPublic: {
    getInfo: (guildId: string) => api.get<KBGuildInfo>(`/api/kb/public/${guildId}/info`),
    listArticles: (guildId: string) => api.get<KBArticle[]>(`/api/kb/public/${guildId}/articles`),
    getArticle: (guildId: string, slug: string) =>
      api.get<KBArticle>(`/api/kb/public/${guildId}/articles/${slug}`),
    listCategories: (guildId: string) =>
      api.get<KBCategory[]>(`/api/kb/public/${guildId}/categories`),
    search: (guildId: string, query: string) =>
      api.get<KBArticle[]>(`/api/kb/public/${guildId}/search?q=${encodeURIComponent(query)}`),

    // Visitors are unauthenticated: a 401 toast would log them out mid-article.
    submitFeedback: (guildId: string, slug: string, helpful: boolean) =>
      api.post<{ success: boolean }>(
        `/api/kb/public/${guildId}/articles/${slug}/feedback`,
        { helpful },
        SKIP_ERROR_TOAST,
      ),
  },

  onboarding: {
    get: (guildId: string) => api.get<OnboardingState>(`/api/${guildId}/onboarding`),
    update: (
      guildId: string,
      body: { current_step?: number; completed?: boolean; skipped?: boolean },
    ) => api.post<{ success: boolean }>(`/api/${guildId}/onboarding`, body),
    getFeaturedListings: (guildId: string) =>
      api.get<GalleryListing[]>(`/api/${guildId}/gallery/featured`),
  },

  gallery: {
    browse: (params: {
      category?: string;
      tag?: string;
      search?: string;
      sort?: string;
      page?: number;
      type?: string;
    }) => api.get<{ listings: GalleryListing[]; total: number }>("/api/gallery", { params }),
    getById: (id: number) => api.get<GalleryListing>(`/api/gallery/${id}`),
    submit: (
      guildId: string,
      panelId: number,
      body: { name: string; description: string; category: string; tags: string[] },
    ) => api.post(`/api/${guildId}/gallery/submit/${panelId}`, body),
    submitTag: (
      guildId: string,
      tagId: string,
      body: { name: string; description: string; category: string; tags: string[] },
    ) => api.post(`/api/${guildId}/gallery/submit-tag/${tagId}`, body),
    submitForm: (
      guildId: string,
      formId: number,
      body: { name: string; description: string; category: string; tags: string[] },
    ) => api.post(`/api/${guildId}/gallery/submit-form/${formId}`, body),
    submissions: (guildId: string) =>
      api.get<GallerySubmission[]>(`/api/${guildId}/gallery/submissions`),
    resubmit: (
      guildId: string,
      listingId: number,
      body: { name: string; description: string; category: string; tags: string[] },
      sourceQuery?: string,
    ) => api.put(`/api/${guildId}/gallery/submissions/${listingId}${sourceQuery || ""}`, body),
    withdraw: (guildId: string, listingId: number) =>
      api.delete(`/api/${guildId}/gallery/submissions/${listingId}`),
    import: (
      guildId: string,
      listingId: number,
      body: { channel_id?: string; category_id?: string },
    ) => api.post<{ panel_id: number }>(`/api/${guildId}/gallery/import/${listingId}`, body),
    importTag: (guildId: string, listingId: number, body: { tag_id: string }) =>
      api.post<{ tag_id: string }>(`/api/${guildId}/gallery/import-tag/${listingId}`, body),
    importForm: (guildId: string, listingId: number, body: { title?: string }) =>
      api.post<{ form_id: number }>(`/api/${guildId}/gallery/import-form/${listingId}`, body),
  },

  affiliate: {
    get: () => api.get<AffiliateStatusResponse>("/api/affiliate/@me"),
    apply: (email?: string, code?: string) =>
      api.post<{ code: AffiliateCode }>("/api/affiliate/@me/apply", {
        ...(email ? { email } : {}),
        ...(code ? { code } : {}),
      }),
    getReferrals: (page = 1, perPage = 25) =>
      api.get<{ referrals: AffiliateReferral[]; total: number; page: number; per_page: number }>(
        `/api/affiliate/@me/referrals?page=${page}&per_page=${perPage}`,
      ),
    redeem: () => api.post<AffiliateRedeemResponse>("/api/affiliate/@me/redeem"),
    verifyEmail: (code: string) => api.post("/api/affiliate/@me/verify-email", { code }),
    resendVerification: () => api.post("/api/affiliate/@me/resend-verification"),
  },

  notifications: {
    list: (category?: string, page = 1, perPage = 25) =>
      api.get<{ notifications: Notification[]; total: number }>("/user/notifications", {
        params: { category, page, per_page: perPage },
      }),
    unreadCount: () => api.get<{ count: number }>("/user/notifications/unread-count"),
    markAsRead: (id: number) => api.post(`/user/notifications/${id}/read`),
    markAllAsRead: () => api.post("/user/notifications/read-all"),
  },

  unsubscribe: {
    process: (token: string) =>
      api.get<{ success: boolean; category: string }>(`/unsubscribe`, {
        params: { token },
        headers: { Accept: "application/json" },
      }),
  },

  settings: {
    get: () => api.get<UserSettings>("/user/settings"),
    updateEmail: (email: string) => api.put("/user/settings/email", { email }),
    deleteEmail: () => api.delete("/user/settings/email"),
    getNotificationPreferences: () =>
      api.get<NotificationPreference[]>("/user/settings/notifications"),
    updateNotificationPreferences: (prefs: NotificationPreference[]) =>
      api.put("/user/settings/notifications", prefs),
    verifyEmail: (code: string) => api.post("/user/settings/verify-email", { code }),
    resendVerification: () => api.post("/user/settings/resend-verification"),
  },

  admin: {
    verify: () =>
      api.get("/api/admin/server-blacklist", {
        validateStatus: (s) => s === 200 || s === 401,
      }),
    botStaff: {
      list: () => api.get<BotStaffMember[]>("/api/admin/bot-staff"),
      add: (userId: string, tier: string) => api.post(`/api/admin/bot-staff/${userId}`, { tier }),
      update: (userId: string, tier: string) => api.put(`/api/admin/bot-staff/${userId}`, { tier }),
      remove: (userId: string) => api.delete(`/api/admin/bot-staff/${userId}`),
      setGlobalView: (userId: string, enabled: boolean) =>
        api.put(`/api/admin/bot-staff/${userId}/global-view`, { enabled }),
    },
    auditLog: {
      list: (body: unknown) => api.post<AuditLogResponse>("/api/admin/audit-logs", body),
    },
    globalBlacklist: {
      list: () => api.get<GlobalBlacklistEntry[]>("/api/admin/global-blacklist"),
      add: (userId: string) => api.post(`/api/admin/global-blacklist/${userId}`),
      remove: (userId: string) => api.delete(`/api/admin/global-blacklist/${userId}`),
    },
    serverBlacklist: {
      list: () => api.get<ServerBlacklistEntry[]>("/api/admin/server-blacklist"),
      add: (guildId: string, data?: { reason?: string }) =>
        api.post(`/api/admin/server-blacklist/${guildId}`, data),
      remove: (guildId: string) => api.delete(`/api/admin/server-blacklist/${guildId}`),
    },
    featureFlags: {
      list: () => api.get<FeatureFlagList>("/api/admin/feature-flags"),
      experiments: () => api.get<FeatureFlagExperiment[]>("/api/admin/feature-flags/experiments"),
      create: (data: {
        key: string;
        description: string;
        value_type: string;
        default_value: string;
        /**
         * Opts a boolean flag into starting enabled in every environment, for a
         * FEATURE_* kill switch guarding an already-shipped feature. Only valid
         * when value_type is "boolean".
         */
        start_enabled?: boolean;
      }) => api.post("/api/admin/feature-flags", data),
      toggle: (key: string, environment: string, enabled: boolean, reason?: string) =>
        api.post(`/api/admin/feature-flags/${encodeURIComponent(key)}/toggle`, {
          environment,
          enabled,
          reason,
        }),
      /**
       * Replaces the whole ordered rule list for one environment.
       * expectedUpdatedAt is the flag's updated_at as last loaded; the server
       * rejects with 409 if someone else changed the flag since then.
       */
      updateRules: (
        key: string,
        environment: string,
        rules: FeatureFlagRule[],
        expectedUpdatedAt: string,
        reason?: string,
      ) =>
        api.put(
          `/api/admin/feature-flags/${encodeURIComponent(key)}/environments/${encodeURIComponent(environment)}/rules`,
          { rules, expected_updated_at: expectedUpdatedAt, reason },
        ),
    },
    polarProducts: {
      list: () => api.get<PolarProduct[]>("/api/admin/polar-products"),
      lookup: (polarProductId: string) =>
        api.get<{ name: string; price: number; currency: string; interval: string }>(
          `/api/admin/polar-products/lookup?polar_product_id=${encodeURIComponent(polarProductId)}`,
        ),
      create: (data: unknown) => api.post("/api/admin/polar-products", data),
      update: (id: string, data: unknown) => api.put(`/api/admin/polar-products/${id}`, data),
      delete: (id: string) => api.delete(`/api/admin/polar-products/${id}`),
    },
    skus: {
      list: () => api.get<SkuWithDetails[]>("/api/admin/skus"),
      listSubscriptionSkus: () => api.get<SubscriptionSku[]>("/api/admin/skus"),
      create: (data: unknown) => api.post("/api/admin/skus", data),
      update: (id: string, data: unknown) => api.put(`/api/admin/skus/${id}`, data),
      delete: (id: string) => api.delete(`/api/admin/skus/${id}`),
    },
    entitlements: {
      list: (page: number, perPage = 25) =>
        api.get<{
          entitlements: AdminEntitlement[];
          total: number;
          page: number;
          per_page: number;
        }>(`/api/admin/entitlements?page=${page}&per_page=${perPage}`),
    },
    gallery: {
      list: (params?: { status?: string; type?: string }) =>
        api.get<GallerySubmission[]>("/api/admin/gallery", { params }),
      approve: (id: number) => api.post(`/api/admin/gallery/${id}/approve`),
      reject: (id: number, reason: string) =>
        api.post(`/api/admin/gallery/${id}/reject`, { reason }),
      update: (id: number, body: { category?: string; featured?: boolean }) =>
        api.put(`/api/admin/gallery/${id}`, body),
      remove: (id: number) => api.delete(`/api/admin/gallery/${id}`),
    },
    integrations: {
      list: (status: "pending" | "approved" | "rejected", page = 1, limit = 25) =>
        api.get(`/api/admin/integrations`, { params: { status, page, limit } }),
      detail: (id: number) => api.get<Integration>(`/api/admin/integrations/${id}`),
      approve: (id: number) => api.post(`/api/admin/integrations/${id}/approve`),
      reject: (id: number, reason: string) =>
        api.post(`/api/admin/integrations/${id}/reject`, { reason }),
      unapprove: (id: number, reason?: string) =>
        api.post(`/api/admin/integrations/${id}/unapprove`, reason ? { reason } : {}),
    },
    premiumKeys: {
      list: (page: number, perPage = 25) =>
        api.get<{
          keys: PremiumKeyEntry[];
          total: number;
          page: number;
          per_page: number;
        }>(`/api/admin/premium-keys?page=${page}&per_page=${perPage}`),
      generate: (data: unknown) => api.post("/api/admin/premium-keys/generate", data),
    },
    affiliate: {
      listCodes: (status?: string, page = 1, perPage = 25) =>
        api.get<{ codes: AdminAffiliateCode[]; total: number; page: number; per_page: number }>(
          "/api/admin/affiliate",
          {
            params: { ...(status ? { status } : {}), page, per_page: perPage },
          },
        ),
      approve: (codeId: string) => api.post(`/api/admin/affiliate/${codeId}/approve`),
      revoke: (codeId: string) => api.post(`/api/admin/affiliate/${codeId}/revoke`),
      updateRates: (
        codeId: string,
        data: { discount_basis_points: number; credit_percentage: number | null },
      ) => api.put(`/api/admin/affiliate/${codeId}/rates`, data),
      updateCode: (codeId: string, code: string) =>
        api.put(`/api/admin/affiliate/${codeId}/code`, { code }),
      createCode: (data: {
        user_id: string;
        code: string;
        discount_basis_points: number;
        credit_percentage: number | null;
      }) => api.post<AdminAffiliateCode>("/api/admin/affiliate", data),
      listReferrals: (codeId: string, page = 1, perPage = 10) =>
        api.get<{ referrals: AffiliateReferral[]; total: number; page: number; per_page: number }>(
          `/api/admin/affiliate/${codeId}/referrals`,
          { params: { page, per_page: perPage } },
        ),
      listFlagged: () =>
        api.get<{ referrals: AdminFlaggedReferral[]; total: number }>(
          "/api/admin/affiliate/flagged",
        ),
      voidReferral: (referralId: string, reason: string) =>
        api.post(`/api/admin/affiliate/referrals/${referralId}/void`, { reason }),
    },
    analytics: {
      getUsage: () => api.get<AdminUsageData>("/api/admin/analytics/usage"),
      getAdoption: () => api.get<AdminAdoptionData>("/api/admin/analytics/adoption"),
      getRetention: () => api.get<AdminRetentionData>("/api/admin/analytics/retention"),
      getConfigPatterns: () => api.get<AdminConfigData>("/api/admin/analytics/config-patterns"),
    },
    utilities: {
      recreateMainCommands: (adminOnly: boolean) =>
        api.post<{
          success: boolean;
          admin_only: boolean;
          global_count: number;
          admin_count: number;
          admin_skipped: boolean;
        }>("/api/admin/utilities/commands/main", { admin_only: adminOnly }, { timeout: 30000 }),
      // 202 = started, 409 = a run is already in progress; both are handled by the caller.
      recreateAllWhitelabel: () =>
        api.post<{ started: boolean; total: number }>(
          "/api/admin/utilities/commands/whitelabel/all",
          {},
          { validateStatus: (s) => s === 202 || s === 409 },
        ),
      whitelabelRecreateStatus: () =>
        api.get<WhitelabelRecreateStatus>("/api/admin/utilities/commands/whitelabel/all/status"),
    },
  },
};
