import type {
  APIAttachment,
  APIEmbed,
  APIMessageTopLevelComponent,
  Snowflake,
} from "discord-api-types/v10";

export interface PremiumState {
  premium: boolean;
  tier: number;
}

export type AdminTier = "owner" | "admin" | "helper" | "";

export type EntitlementTier = "whitelabel" | "premium";

export interface User {
  id: Snowflake;
  username: string;
  avatar: string;
  bot?: boolean;
  admin_tier: AdminTier;
}

/**
 * Ticket staff permission tier for a guild (`permission.PermissionLevel`).
 * @see common/permission/permissionlevel.go, Everyone (0), Support (1), Admin (2)
 */
export type GuildPermissionLevel = 0 | 1 | 2;

export interface Guild {
  id: Snowflake;
  icon?: string;
  name: string;
  permission_level: number;
  permission_source?: string;
  premium?: boolean;
  channels?: Array<GuildChannel>;
  roles?: Array<GuildRole>;
  teams?: Array<Team>;

  access?: GuildAccess; // Access level for the user in this guild
}

export interface GuildAccess {
  /** User's `permission.PermissionLevel` for this guild (0–2). */
  permission_level: number;
  success: boolean; // Indicates if the user has access to the server
}

export interface Team {
  id: number;
  name: string;
  on_call_role_id?: Snowflake;
}

export interface GuildChannel {
  id: Snowflake;
  type: number; // 0: GUILD_TEXT, 2: GUILD_VOICE, 4: GUILD_CATEGORY, etc.
  guild_id: string;
  position: number;
  permission_overwrites: Array<{
    id: string;
    type: number; // 0: role, 1: member
    allow: string; // Bitwise permissions
    deny: string; // Bitwise permissions
  }>;
  name: string;
  topic: string;
  nsfw: boolean;
  last_message_id: string;
  bitrate: number; // For voice channels
  user_limit: number; // For voice channels
  rate_limit_per_user: number; // For text channels
  recipients?: Array<{
    id: Snowflake;
    username: string;
    discriminator: string;
    avatar: string;
  }>;
  icon: string;
  owner_id: Snowflake; // For threads
  application_id: Snowflake; // For threads
  parent_id?: Snowflake; // For threads and categories
  last_pin_timestamp: string; // ISO 8601 format
  rtc_region?: string; // For voice channels
  video_quality_mode?: number; // 1: AUTO, 2: FULL, etc.
  message_count?: number; // For threads
  member_count?: number; // For threads
  member?: {
    id: Snowflake; // User ID
    user_id: string; // User ID
    join_timestamp: string; // ISO 8601 format
    flags: number; // Flags for the member
  };
  // Additional fields can be added as needed
}

export interface GuildSettings {
  context_menu_permission_level: string;
  context_menu_add_sender: boolean;
  context_menu_panel?: number;
  anonymise_dashboard_responses: boolean;
  claim_settings: {
    switch_panel_claim_behavior: number;
  };
  colours: {
    [key: string]: string;
  };
  language: string;
  locales: Array<{
    iso_short_code: string;
    local_name: string;
  }>;
}

export interface TicketLabel {
  label_id: number;
  name: string;
  colour: number;
}

export interface Ticket {
  ticket_id: number;
  username: string;
  close_reason?: string;
  closed_by?: number;
  rating?: number;
  has_transcript: boolean;
  labels: TicketLabel[];
}

export interface TicketUser {
  id: Snowflake;
  username: string;
}

export interface TicketMember extends TicketUser {
  avatar: string;
}

export interface OpenTicket {
  id: number;
  panel_id: number | null;
  opened_at: string;
  user_id: Snowflake;
  claimed_by: Snowflake | null;
  last_response_time: string;
  last_response_is_staff?: boolean;
}

export interface TicketViewData {
  id: number;
  panel_id: number | null;
  opened_at: string;
  opener: TicketUser;
  claimer: TicketUser | null;
}

export interface TicketPermissions {
  add_reactions: boolean;
  send_tts_messages: boolean;
  embed_links: boolean;
  attach_files: boolean;
  use_external_emojis: boolean;
  use_external_stickers: boolean;
  send_voice_messages: boolean;
}

export interface Panel {
  panel_id: number;
  message_id: Snowflake;
  channel_id: Snowflake;
  guild_id: Snowflake;
  title: string;
  content: string;
  colour: number;
  category_id: string;
  emoji_name?: string;
  emoji_id?: string;
  emoji_animated?: boolean;
  image_url?: string;
  thumbnail_url?: string;
  welcome_message_embed: number;
  default_team: boolean;
  custom_id: string;
  button_style: string;
  button_label: string;
  form_id?: number | null;
  naming_scheme?: string;
  force_disabled: boolean;
  disabled: boolean;
  has_support_hours?: boolean;
  is_currently_active?: boolean;
  exit_survey_form_id?: number | null;
  pending_category?: string | null;
  mention_behaviour: string;
  transcript_channel_id?: string;
  use_threads: boolean;
  ticket_notification_channel?: string;
  cooldown_seconds: number;
  ticket_limit: number;
  hide_close_button: boolean;
  hide_close_with_reason_button: boolean;
  hide_claim_button: boolean;
  show_in_open_command: boolean;
  ticket_permissions: TicketPermissions;
  store_transcripts: boolean;
  overflow_enabled: boolean;
  overflow_category_id?: string;
  users_can_close: boolean;
  close_confirmation: boolean;
  feedback_enabled: boolean;
  support_can_view: boolean;
  support_can_type: boolean;
  auto_close: {
    enabled: boolean;
    since_open_with_no_response: number;
    since_last_message: number;
    on_user_leave: boolean;
  };
  welcome_message: {
    title?: string;
    description: string;
    url?: string;
    colour: string;
    author: {
      name?: string;
      icon_url?: string;
      url?: string;
    };
    image_url?: string;
    thumbnail_url?: string;
    footer: {
      text?: string;
      icon_url?: string;
    };
    timestamp?: string;
    fields?: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;
  };
  use_custom_emoji: boolean;
  emote?: string | { name: string; id: string; animated?: boolean };
  mentions: Array<string>;
  teams: Array<number>;
  kb_category_ids: number[];
  access_control_list: Array<ACL>;
}

export interface MultiPanelPanelEntry {
  panel_id: number;
  custom_emoji_name?: string;
  custom_emoji_id?: string;
  custom_label?: string;
  description?: string;
}

export interface MultiPanel {
  id: number;
  message_id: Snowflake;
  channel_id: Snowflake;
  guild_id: Snowflake;
  select_menu: boolean;
  select_menu_placeholder?: string;
  panels: Array<MultiPanelPanelEntry>;
  embed: MultiPanelEmbed;
}

export interface MultiPanelRequest {
  channel_id: Snowflake;
  embed: MultiPanelEmbed;
  panels: Array<MultiPanelPanelEntry>;
  select_menu: boolean;
  select_menu_placeholder?: string;
}

export interface MultiPanelEmbed {
  author: {
    name?: string;
    icon_url?: string;
    url?: string;
  };
  colour: number;
  description?: string;
  footer: {
    text?: string;
    icon_url?: string;
  };
  image_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
  title?: string;
  url?: string;
}

export interface GuildEmoji {
  id: string;
  name: string;
  animated?: boolean;
}

export interface ACL {
  action: string; // "allow" or "deny"
  role_id: Snowflake;
}

export interface GuildRole {
  id: Snowflake;
  name: string;
  color: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type DiscordMessage = import("discord-api-types/v10").APIMessage;
export interface Message {
  id: Snowflake;
  author: Snowflake;
  content: string;
  timestamp: string;
  attachments: APIAttachment[];
  embeds: APIEmbed[];
  components?: APIMessageTopLevelComponent[];
}

export interface Transcript {
  version: number;
  entities: {
    users: Record<Snowflake, User>;
    channels: Record<Snowflake, GuildChannel>;
    roles: Record<Snowflake, GuildRole>;
  };
  messages: Array<Message>;
}

export interface TranscriptPayload {
  channel_name: string;
  entities: {
    users: Record<string, { avatar: string; username: string; badge?: "bot" }>;
    channels: Record<string, { name: string }>;
    roles: Record<string, { name: string; color: number }>;
  };
  messages: Array<{
    id: string;
    type: number;
    author: string;
    time: number; // Unix milliseconds
    content: string;
    embeds?: APIEmbed[];
    components?: APIMessageTopLevelComponent[];
    attachments?: APIAttachment[];
  }>;
  content_restricted?: boolean;
}

export interface Form {
  form_id: number;
  guild_id: Snowflake;
  title: string;
  custom_id: string;
  inputs: Array<FormInput>;
}

export interface FormInput {
  id: number;
  form_id: number;
  type: number;
  position: number;
  custom_id: string;
  style?: number;
  label: string;
  placeholder?: string;
  description?: string;
  options?: Array<FormInputOption>;
  required: boolean;
  min_length?: number;
  max_length?: number;
  api_config?: {
    id?: number;
    form_input_id?: number;
    endpoint_url: string;
    method: string;
    cache_duration_seconds: number;
    no_options_message?: string;
    body_template?: string;
    created_at?: string;
    updated_at?: string;
    headers: Array<{
      header_name: string;
      header_value: string;
      is_secret: boolean;
    }>;
  };
}

export interface FormInputOption {
  id: number;
  form_input_id: number;
  position: number;
  label: string;
  description: string;
  value: string;
}

export interface SupportHoursDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
  enabled: boolean;
}

export interface SupportHoursData {
  timezone: string;
  hours: SupportHoursDay[];
  out_of_hours_behaviour: "block_creation" | "allow_with_warning";
  out_of_hours_title: string;
  out_of_hours_message: string;
  out_of_hours_colour: number;
}

export interface BotStaffMember {
  id: string;
  username: string;
  avatar_url?: string;
  tier: "owner" | "admin" | "helper";
  global_view: boolean;
}

export interface AdminEntitlement {
  id: string;
  user_id?: string;
  source: string;
  expires_at?: string;
  sku_id: string;
  sku_label: string;
  tier: string;
  sku_priority: number;
}

export interface GlobalBlacklistEntry {
  id: string;
  username: string;
  avatar_url?: string;
}

export interface ServerBlacklistEntry {
  guild_id: string;
  reason?: string;
  owner_id?: string;
  real_owner_id?: string;
}

export interface PremiumKeyEntry {
  key: string;
  length?: number;
  sku_id?: string;
  generated_at?: string;
  sku_label?: string;
  tier?: string;
  guild_id?: string;
  activated_by?: string;
  is_used: boolean;
}

export interface SubscriptionSku {
  id: string;
  label: string;
  tier: string;
  priority: number;
  is_global: boolean;
}

export interface SkuWithDetails {
  id: string;
  label: string;
  sku_type: string;
  tier?: string;
  priority?: number;
  is_global?: boolean;
  servers_permitted?: number;
}

export interface TagEmbed {
  title?: string;
  description?: string;
  url?: string;
  colour: number;
  author: { name?: string; icon_url?: string; url?: string };
  image_url?: string;
  thumbnail_url?: string;
  footer: { text?: string; icon_url?: string };
  timestamp?: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface Tag {
  id: string;
  use_guild_command: boolean;
  content?: string;
  use_embed: boolean;
  embed?: TagEmbed;
  kb_article_id?: number | null;
}

export interface WhitelabelBot {
  id: string;
  username: string;
  status: string;
  status_type: string;
  guild_count?: number;
}

export interface WhitelabelError {
  message: string;
  time: string;
}

export interface WhitelabelRecreateStatus {
  status: "idle" | "running" | "completed";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  started_at?: string;
  finished_at?: string;
  errors: { bot_id: string; error: string }[];
}

export interface AuditLogEntry {
  id: number;
  guild_id?: string;
  user_id: string;
  username: string;
  action_type: number;
  resource_type: number;
  resource_id?: string;
  old_data?: string;
  new_data?: string;
  metadata?: string;
  created_at: string;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total_count: number;
  total_pages: number;
  current_page: number;
}

export interface StrippedMessageAuthor {
  id: Snowflake;
  username: string;
  global_name?: string;
  avatar?: string;
  bot?: boolean;
}

export interface StrippedMessage {
  author: StrippedMessageAuthor;
  content: string;
  timestamp: string;
  attachments: APIAttachment[];
  embeds: APIEmbed[];
  components?: APIMessageTopLevelComponent[];
  mentions?: StrippedMessageAuthor[];
}

export interface TicketViewResponse {
  success: boolean;
  ticket: TicketViewData;
  panel_title?: string;
  messages: StrippedMessage[];
  content_restricted?: boolean;
  channel_missing?: boolean;
}

export interface PolarSubscription {
  polar_subscription_id: string;
  polar_product_id: string;
  status: string;
  entitlement_id: string;
  sku_id: string;
  sku_label: string;
  tier: string;
  expires_at?: string;
  guild_id?: string;
  permitted_server_count?: number;
}

export interface PolarCheckoutResponse {
  checkout_url: string;
}

export interface PolarProduct {
  id: string;
  polar_product_id: string;
  sku_id: string;
  name: string;
  description: string;
  interval: string;
  price: number;
  currency: string;
  features: string[];
  highlighted: boolean;
  sort_order: number;
  tier: string;
  servers_permitted?: number;
}

export interface UserEntitlement {
  id: string;
  user_id?: string;
  source: string;
  expires_at?: string;
  sku_id: string;
  sku_label: string;
  /** `premium` or `whitelabel` from `subscription_skus`; distinct from `sku_label` (plan name). */
  tier: EntitlementTier;
  sku_priority: number;
}

export interface LegacyEntitlement {
  user_id: string;
  tier_id: number;
  sku_label: string;
  sku_id: string;
  is_legacy: boolean;
  expires_at: string;
}

export interface IntegrationPlaceholder {
  name: string;
  json_path: string;
}

export interface IntegrationSecret {
  name: string;
  description: string;
}

export interface IntegrationHeader {
  name: string;
  value: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  proxy_token: string | null;
  privacy_policy_url: string | null;
  webhook_url: string;
  http_method: string;
  validation_url: string | null;
  owner_id: string;
  guild_count: number;
  added: boolean;
  public: boolean;
  author?: {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
  };
  placeholders?: IntegrationPlaceholder[];
  secrets?: IntegrationSecret[];
  headers?: IntegrationHeader[];
}

export interface TripleWindowSeconds {
  all_time: number | null;
  monthly: number | null;
  weekly: number | null;
  /** Present when the backend honours the exact `days` range. */
  selected?: number | null;
}

// Panel analytics (comparison table and filter presets)

export interface PanelPerformancePrevious {
  ticket_count: number;
  avg_first_response_seconds: number | null;
  avg_resolution_seconds: number | null;
  avg_rating: number | null;
}

export interface PanelPerformanceTrend {
  ticket_count_pct: number | null;
  first_response_pct: number | null;
  resolution_pct: number | null;
  rating_delta: number | null;
}

export interface PanelPerformanceRow {
  panel_id: number | null;
  title: string;
  channel_id: string;
  disabled: boolean;
  force_disabled: boolean;
  ticket_count: number;
  closed_count: number;
  avg_first_response_seconds: number | null;
  avg_resolution_seconds: number | null;
  avg_rating: number | null;
  rating_count: number;
  previous: PanelPerformancePrevious | null;
  trend: PanelPerformanceTrend | null;
}

export interface PanelGroupEntry {
  id: number;
  name: string;
  panel_ids: number[];
}

export interface PanelGroups {
  teams?: PanelGroupEntry[];
  multi_panels?: PanelGroupEntry[];
  default_team_panel_ids?: number[];
}

export interface PanelAnalyticsResponse {
  days: number;
  has_trend: boolean;
  panels: PanelPerformanceRow[];
  groups: PanelGroups;
}

export interface TicketsPerDay {
  date: string;
  count: number;
}

export interface PanelTicketCount {
  panel_id: number | null;
  panel_title: string;
  count: number;
}

export interface LabelTicketCount {
  label_id: number;
  name: string;
  colour: number;
  count: number;
}

export interface FeedbackResponseRate {
  closed_tickets: number;
  rated_tickets: number;
  rate: number;
}

export interface AutoCloseStats {
  auto_closed: number;
  manual_closed: number;
}

export interface ThreadChannelSplit {
  thread_count: number;
  channel_count: number;
}

export interface AverageMessageCounts {
  avg_staff_messages: number | null;
  avg_user_messages: number | null;
  avg_total_messages: number | null;
}

export interface PeakHourEntry {
  day_of_week: number;
  hour_of_day: number;
  count: number;
}

export interface SourceBreakdown {
  source: number;
  count: number;
}

export interface ResponseTimeByHour {
  hour_of_day: number;
  avg_response_time: number | null;
}

export interface CloseReasonCount {
  reason: string;
  count: number;
}

export interface AnalyticsOverview {
  total_tickets: number;
  open_tickets: number;
  first_response_time: TripleWindowSeconds;
  resolution_time: TripleWindowSeconds;
  average_rating: number;
  feedback_count: number;
  tickets_per_day: TicketsPerDay[];
  top_close_reasons: CloseReasonCount[];
  tickets_by_panel: PanelTicketCount[];
  tickets_by_label: LabelTicketCount[];
  feedback_distribution: [number, number, number, number, number];
  feedback_response_rate: FeedbackResponseRate;
  auto_close_stats: AutoCloseStats;
  thread_channel_split: ThreadChannelSplit;
  backlog_trend: TicketsPerDay[];
  one_touch_resolution_rate: number | null;
  avg_message_counts: AverageMessageCounts;
  peak_hours: PeakHourEntry[];
  tickets_by_source: SourceBreakdown[];
  response_time_by_hour: ResponseTimeByHour[];
}

export interface BasicOverview {
  total_tickets: number;
  open_tickets: number;
  tickets_per_day: TicketsPerDay[];
}

export interface StaffMemberStats {
  user_id: string;
  username: string;
  avatar: string;
  tickets_answered: number;
  tickets_claimed: number;
  average_rating: number | null;
  rating_count: number;
}

export interface StaffAnalytics {
  staff: StaffMemberStats[];
}

export interface StaffDetailTripleWindow {
  all_time: number;
  monthly: number;
  weekly: number;
}

export interface StaffDetailAnalytics {
  user_id: string;
  username: string;
  avatar: string;
  first_response_time: TripleWindowSeconds;
  average_rating: number | null;
  rating_count: number;
  feedback_distribution: [number, number, number, number, number];
  tickets_claimed: StaffDetailTripleWindow;
  tickets_answered: StaffDetailTripleWindow;
  guild_total_tickets: StaffDetailTripleWindow;
  open_claimed_count: number;
}

export interface AdminUsageMetrics {
  tickets_created_today: number;
  active_guilds_daily: number;
  active_guilds_weekly: number;
  active_guilds_monthly: number;
  total_guilds: number;
}

export interface AdminUsageData {
  metrics: AdminUsageMetrics;
  tickets_per_day: TicketsPerDay[];
}

export interface AdminFeatureAdoptionEntry {
  feature: string;
  guild_count: number;
}

export interface AdminAdoptionData {
  features: AdminFeatureAdoptionEntry[];
  total_guilds: number;
}

export interface AdminChurnedGuild {
  guild_id: string;
  last_ticket_time: string;
}

export interface AdminRetentionData {
  active_guilds_30d: number;
  churned_guilds_30d: number;
  recently_churned: AdminChurnedGuild[];
}

export interface AdminConfigPattern {
  setting: string;
  value: string;
  count: number;
}

export interface AdminConfigData {
  patterns: AdminConfigPattern[];
}

export interface KBCategory {
  id: number;
  guild_id: string;
  name: string;
  emoji: string | null;
  position: number;
}

export interface KBCustomisation {
  primary_bg: number | null;
  card_bg: number | null;
  text_colour: number | null;
  accent_colour: number | null;
  logo_url: string | null;
  hide_branding: boolean;
}

export interface KBGuildInfo {
  guild_id: string;
  name: string;
  icon_url: string;
  customisation?: {
    primary_bg?: string;
    card_bg?: string;
    text_colour?: string;
    accent_colour?: string;
    logo_url?: string;
    hide_branding: boolean;
  };
}

export interface KBArticle {
  id: number;
  guild_id: string;
  title: string;
  slug: string;
  description: string | null;
  content: string | null;
  embed: TagEmbed | null;
  category_ids: number[];
  keywords: string[];
  position: number;
  published: boolean;
  show_helpful_count: boolean;
  helpful_count?: number;
  not_helpful_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ChannelPermCheckResult {
  channel_id: string;
  channel_name: string;
  /** "panel_channel" | "ticket_category" | "notification_channel" | "transcript_channel" */
  role: string;
  required: string[];
  missing: string[];
  deleted: boolean;
  ok: boolean;
}

export interface PanelPermResult {
  panel_id: number;
  panel_title: string;
  use_threads: boolean;
  channels: ChannelPermCheckResult[];
  ok: boolean;
}

export interface PermCheckResponse {
  panels: PanelPermResult[];
}

export interface GallerySubmittedUser {
  id: string;
  username: string;
  avatar_url?: string;
}

export type GalleryListingType = "panel" | "tag" | "form";

export interface GalleryTagSnapshot {
  content?: string;
  embed?: TagEmbed;
}

export interface GalleryFormInputOptionSnapshot {
  position: number;
  label: string;
  description?: string;
  value: string;
}

export interface GalleryFormInputSnapshot {
  type: number;
  position: number;
  style: number;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  min_length?: number;
  max_length?: number;
  options?: GalleryFormInputOptionSnapshot[];
}

export interface GalleryFormSnapshot {
  title: string;
  inputs: GalleryFormInputSnapshot[];
}

export interface GalleryListing {
  id: number;
  name: string;
  description: string;
  category: string;
  tags: string[];
  submitted_user: GallerySubmittedUser;
  import_count: number;
  featured: boolean;
  listing_type: GalleryListingType;
  snapshot_data?: GalleryTagSnapshot | GalleryFormSnapshot | Record<string, unknown>;
  // Panel visual design fields
  title: string;
  content: string;
  colour: number;
  image_url?: string;
  thumbnail_url?: string;
  button_style: number | null;
  button_label: string;
  emoji_name?: string;
  welcome_message?: Panel["welcome_message"];
  created_at: string;
}

export interface GallerySubmission extends GalleryListing {
  status: "pending" | "approved" | "rejected";
  review_note?: string;
  source_guild_id: string;
  reviewed_at?: string;
}

export interface OnboardingState {
  guild_id: Snowflake;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  current_step: number;
  skipped: boolean;
}

// ─── Affiliate system ──────────────────────────────────────────────────────────

export interface AffiliateStats {
  total_referrals: number;
  pending_referrals: number;
  redeemable_credits: number;
  redeemed_credits: number;
  cap_remaining: number;
}

export interface AffiliateCode {
  id: string;
  code: string;
  status: "pending" | "active" | "revoked";
  discount_basis_points: number;
  credit_percentage: number | null;
  created_at: string;
  approved_at?: string;
  stats?: AffiliateStats;
}

export interface AffiliateStatusResponse {
  code: AffiliateCode | null;
  total_referrals: number;
  pending_referrals: number;
  redeemable_credits: number;
  redeemed_credits: number;
  cap_remaining: number;
  has_entitlement: boolean;
  has_whitelabel: boolean;
  effective_credit_percent: number;
  email: string | null;
  email_verified: boolean;
}

export interface AffiliateReferral {
  id: string;
  referred_tier: string;
  purchased_days: number;
  credit_days: number;
  status: "pending" | "redeemable" | "redeemed" | "voided" | "flagged";
  created_at: string;
  redeemable_at: string;
}

export interface AffiliateRedeemResponse {
  redeemed_count: number;
  total_credits?: number;
  total_days?: number;
  tier?: string;
  method?: string;
  message?: string;
}

// ─── Admin affiliate types ─────────────────────────────────────────────────────

export interface AdminAffiliateCode extends AffiliateCode {
  user_id: string;
  username: string;
  avatar_url?: string;
  polar_discount_id?: string;
  approved_by?: string;
  revoked_at?: string;
  total_referrals: number;
  redeemed_credits: number;
}

export interface AdminFlaggedReferral extends AffiliateReferral {
  affiliate_code_id: string;
  affiliate_user_id: string;
  referred_user_id: string;
  entitlement_id?: string;
  voided_at?: string;
  voided_reason?: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: number;
  user_id: string;
  category: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  created_at: string;
}

export interface NotificationPreference {
  category: string;
  discord_dm: boolean;
  email: boolean;
  in_app: boolean;
}

export interface NotificationCategory {
  key: string;
  label: string;
  description: string;
  min_tier: AdminTier;
}

export interface UserSettings {
  email: string | null;
  email_verified: boolean;
  notification_preferences: NotificationPreference[];
  notification_categories: NotificationCategory[];
}

/**
 * Rule kinds mirror the backend vocabulary. "custom" is anything authored in
 * GrowthBook that the dashboard cannot fully model; it is shown but not editable.
 */
export type FeatureFlagRuleKind =
  | "percentage"
  | "guilds"
  | "users"
  | "dashboard_users"
  | "premium"
  | "staff"
  | "everyone"
  | "custom";

export type FeatureFlagUnit = "guild_id" | "user_id" | "dashboard_user_id";

export interface FeatureFlagRule {
  kind: FeatureFlagRuleKind;
  enabled: boolean;
  description?: string;
  /** What the flag evaluates to when this rule matches, as a string. */
  value: string;
  /** 0-100, for kind "percentage". */
  percentage?: number;
  /** Attribute a percentage rule buckets on. */
  unit?: FeatureFlagUnit;
  /** Discord IDs, for the explicit-list kinds. */
  ids?: string[];
  /** 0 for Premium, 1 for Whitelabel. */
  min_premium_tier?: number;
  summary?: string;
  raw_condition?: string;
}

export interface FeatureFlagEnvironment {
  enabled: boolean;
  rules: FeatureFlagRule[];
}

export interface FeatureFlag {
  key: string;
  description: string;
  value_type: string;
  default_value: string;
  /** Usually a Discord user ID; resolve via `owner_name` for display, this is a fallback. */
  owner: string;
  /** Resolved display name for `owner`, when it parses as a known Discord user ID. */
  owner_name?: string;
  tags: string[];
  /** Doubles as the optimistic concurrency token when saving rules. */
  updated_at: string;
  environments: Record<string, FeatureFlagEnvironment>;
}

export interface FeatureFlagList {
  flags: FeatureFlag[];
  environments: string[];
  configured: boolean;
  flags_default_on: boolean;
}

export interface FeatureFlagExperimentVariation {
  key: string;
  name: string;
}

export interface FeatureFlagExperiment {
  id: string;
  name: string;
  tracking_key: string;
  status: string;
  assigned_on: string;
  variations: FeatureFlagExperimentVariation[];
  /** Distinct units recorded per variation index, from our own exposure table. */
  exposed_units: Record<string, number>;
  updated_at: string;
}
