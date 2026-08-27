import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { HoverTooltip } from "@/components/HoverTooltip";
import { usePreferencesStore } from "@/stores/preferences";
import ColumnSelectorButton from "@/components/ColumnSelectorButton";
import AnalyticsExportButton from "@/components/AnalyticsExportButton";
import AnalyticsExportModal from "@/components/modals/AnalyticsExportModal";
import { Link, useParams, useSearchParams } from "react-router";
import { MainLayout } from "@/pages/layout/Main";
import {
  useAnalyticsOverview,
  useAnalyticsStaff,
  useAnalyticsPanels,
} from "@/hooks/queries/useAnalytics";
import { useAuthStore } from "@/stores/auth";
import { useGuildStore } from "@/stores/guild";
import { useGuildPremium } from "@/hooks/queries/useGuild";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { ANALYTICS_PANEL_FILTER_FLAG } from "@/lib/feature-flags";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faUsers, faClock, faStar, faTimes } from "@fortawesome/free-solid-svg-icons";
import Table from "@/components/Table";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import { useTableSort } from "@/hooks/useTableSort";
import type { SortColumn } from "@/lib/table-sort";
import type { StaffMemberStats } from "@/types";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import Skeleton from "react-loading-skeleton";
import {
  exportDateStamp,
  formatDuration,
  formatDurationAxis,
  selectedWindow,
  windowLabel,
  DAY_LABELS,
  SOURCE_LABELS,
  SOURCE_COLOURS,
} from "@/lib/analytics-format";
import { parsePanelParam, selectionCount, splitCanonical } from "@/lib/analytics-panel-filter";
import { StatCard, StatCardSkeleton } from "@/components/analytics/StatCard";
import {
  formatDateLabel,
  TruncatedYAxisTick,
  ChartTooltip,
  DurationTooltip,
  BarTooltip,
} from "@/components/analytics/chart-primitives";
import DurationWindowBreakdown from "@/components/analytics/DurationWindowBreakdown";
import PanelFilterSelect from "@/components/analytics/PanelFilterSelect";
import PanelPerformanceTable from "@/components/analytics/PanelPerformanceTable";
import {
  buildGuildOverviewCsv,
  buildGuildOverviewPayload,
  getGuildOverviewExportSections,
} from "@/lib/analytics-export/guild-overview";
import { runAnalyticsExport } from "@/lib/analytics-export/run-export";
import type { ExportFormat } from "@/lib/analytics-export/types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const TIME_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: 0 },
] as const;

const ALL_ANALYTICS_COLUMNS = [
  { key: "staff_member", label: "Staff Member" },
  { key: "tickets_answered", label: "Tickets Answered" },
  { key: "tickets_claimed", label: "Tickets Claimed" },
  { key: "avg_rating", label: "Avg Rating" },
];

type StaffSortKey =
  | "staff_member"
  | "tickets_answered"
  | "tickets_claimed"
  | "avg_rating"
  | "rating_count";

const STAFF_SORT_COLUMNS: Record<StaffSortKey, SortColumn<StaffMemberStats>> = {
  staff_member: { value: (m) => m.username || m.user_id, defaultDir: "asc" },
  tickets_answered: { value: (m) => m.tickets_answered },
  tickets_claimed: { value: (m) => m.tickets_claimed },
  avg_rating: { value: (m) => m.average_rating },
  rating_count: { value: (m) => m.rating_count },
};

const NO_STAFF: StaffMemberStats[] = [];

const DEFAULT_ANALYTICS_COLUMNS = [
  "staff_member",
  "tickets_answered",
  "tickets_claimed",
  "avg_rating",
];

/** Debounce a value by the given delay. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function AnalyticsPage() {
  const { guildId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [days, setDays] = useState(() => {
    const d = parseInt(searchParams.get("days") ?? "30");
    return [0, 7, 30, 90, 365].includes(d) ? d : 30;
  });
  const [closeReasonsCaseInsensitive, setCloseReasonsCaseInsensitive] = useState(
    () => searchParams.get("close_reasons_ci") === "1",
  );

  // Panel filter state: raw value from user interaction, debounced for queries
  const [panelFilter, setPanelFilter] = useState(() => parsePanelParam(searchParams.get("panels")));
  const debouncedPanels = useDebouncedValue(panelFilter, 400);
  const isFiltered = selectionCount(debouncedPanels) > 0;

  // Sync days and panels to URL
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (days !== 30) next.set("days", String(days));
        else next.delete("days");
        if (debouncedPanels) next.set("panels", debouncedPanels);
        else next.delete("panels");
        if (closeReasonsCaseInsensitive) next.set("close_reasons_ci", "1");
        else next.delete("close_reasons_ci");
        return next;
      },
      { replace: true },
    );
  }, [days, debouncedPanels, closeReasonsCaseInsensitive, setSearchParams]);

  // Canonicalise the URL param on mount if it is not already canonical
  useEffect(() => {
    const raw = searchParams.get("panels");
    if (raw) {
      const canonical = parsePanelParam(raw);
      if (canonical !== raw) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (canonical) next.set("panels", canonical);
            else next.delete("panels");
            return next;
          },
          { replace: true },
        );
      }
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: premiumState, isLoading: premiumLoading } = useGuildPremium(guildId);
  const isPremium = premiumState?.premium ?? false;

  // Feature flag
  const { enabled: panelFilterEnabled, isLoading: flagLoading } = useFeatureFlag(
    ANALYTICS_PANEL_FILTER_FLAG,
    guildId,
  );

  // When the flag is loading and the URL has panels, hold queries until we know
  // whether to use them. An unfiltered request would cost a rate limit slot.
  const shouldHoldQueries =
    flagLoading && splitCanonical(parsePanelParam(searchParams.get("panels"))).length > 0;

  // Determine what panels value to pass to queries
  const effectivePanels = panelFilterEnabled ? debouncedPanels : "";

  const { data, isLoading, isFetching, isError } = useAnalyticsOverview(
    isPremium && !shouldHoldQueries ? guildId : undefined,
    days,
    effectivePanels,
    closeReasonsCaseInsensitive,
  );

  const user = useAuthStore((s) => s.user);
  const selectedGuild = useGuildStore((s) => s.selectedGuild);
  const isAdmin = !!user?.admin_tier || selectedGuild?.permission_level === 2;

  // Gate staff query on isAdmin to fix pre-existing 403 for Support-level users
  const {
    data: staffData,
    isLoading: staffLoading,
    isError: staffError,
  } = useAnalyticsStaff(
    isPremium && isAdmin && !shouldHoldQueries ? guildId : undefined,
    days,
    effectivePanels,
  );

  // Panel analytics (comparison table and presets), panel-scoped like overview/staff
  const {
    data: panelsData,
    isLoading: panelsLoading,
    isError: panelsError,
  } = useAnalyticsPanels(
    isPremium && panelFilterEnabled ? guildId : undefined,
    days,
    effectivePanels,
  );

  const { analytics: analyticsPrefs, setAnalyticsPrefs } = usePreferencesStore();
  const selectedStaffColumns =
    analyticsPrefs.columns.length > 0 ? analyticsPrefs.columns : DEFAULT_ANALYTICS_COLUMNS;
  const [showStaffColumnSelector, setShowStaffColumnSelector] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const staffSort = useTableSort(staffData?.staff ?? NO_STAFF, STAFF_SORT_COLUMNS, {
    initialSort: { key: "tickets_answered", dir: "desc" },
    persistKey: "analytics-staff",
  });
  const peakHoursRef = useRef<HTMLElement>(null);

  // Export sections, memoised so AnalyticsExportModal's useEffect does not
  // reset the user's tick boxes on every render.
  const exportSections = useMemo(() => {
    const sections = getGuildOverviewExportSections(isAdmin);
    if (panelFilterEnabled && panelsData) {
      return [
        ...sections,
        {
          id: "panel_performance",
          label: "Panel performance",
          description: "Reflects the selected panels filter.",
        },
      ];
    }
    return sections;
  }, [isAdmin, panelFilterEnabled, panelsData]);

  // Memoised default selected IDs to prevent AnalyticsExportModal from
  // silently resetting the user's tick boxes on every render.
  const defaultSelectedIds = useMemo(() => {
    // Degenerate sections default to unticked when a filter is active
    const ids = exportSections.map((s) => s.id);
    if (isFiltered) {
      return ids.filter((id) => {
        // Tickets by panel is a tautology for a single selection
        if (id === "tickets_by_panel" && selectionCount(debouncedPanels) === 1) return false;
        return true;
      });
    }
    return ids;
  }, [exportSections, isFiltered, debouncedPanels]);

  const handleExport = (selectedIds: string[], format: ExportFormat) => {
    if (!data || !guildId) return;

    const exportData = { overview: data, staff: staffData, days, guildId };
    const daysLabel = days === 0 ? "all" : `${days}d`;
    const panelSuffix = isFiltered
      ? selectionCount(debouncedPanels) === 1
        ? `-panel-${splitCanonical(debouncedPanels)[0]}`
        : `-${selectionCount(debouncedPanels)}panels`
      : "";
    const filename = `analytics-${guildId}-${daysLabel}${panelSuffix}-${exportDateStamp()}.${format}`;

    runAnalyticsExport(filename, format, {
      buildCsv: () => buildGuildOverviewCsv(selectedIds, exportData),
      buildPayload: () => buildGuildOverviewPayload(selectedIds, exportData),
      successMessage: "Analytics exported.",
      onComplete: () => setShowExportModal(false),
    });
  };

  const toggleStaffColumn = (key: string) => {
    if (selectedStaffColumns.includes(key)) {
      if (selectedStaffColumns.length <= 1) return;
      setAnalyticsPrefs({ columns: selectedStaffColumns.filter((k) => k !== key) });
    } else {
      setAnalyticsPrefs({ columns: [...selectedStaffColumns, key] });
    }
  };

  const closeReasonsData = (data?.top_close_reasons ?? []).map((r) => ({
    name: r.reason || "No reason",
    count: r.count,
  }));

  const peakTickets = Math.max(...(data?.tickets_per_day?.map((d) => d.count) ?? [0]));
  const responseTime = selectedWindow(data?.first_response_time, days);

  const handleClearFilter = useCallback(() => setPanelFilter(""), []);

  // Live region text for the filter
  const filterAnnouncement = useMemo(() => {
    const count = selectionCount(debouncedPanels);
    if (count === 0) return "Showing all panels.";
    if (count === 1) {
      const key = splitCanonical(debouncedPanels)[0];
      if (key === "none") return "Showing 1 panel: No panel.";
      const panel = panelsData?.panels.find((p) => p.panel_id === parseInt(key, 10));
      return `Showing 1 panel: ${panel?.title ?? key}.`;
    }
    return `Showing ${count} panels.`;
  }, [debouncedPanels, panelsData]);

  // Detect if isFetching (revalidating) vs initial load to dim rather than skeleton
  const isDimmed = isFetching && !isLoading;

  return (
    <MainLayout
      title="Analytics"
      subtitle="An overview of your server's ticket activity and performance."
    >
      {!isPremium && !premiumLoading && (
        <div className="bg-gray-800 rounded-xl p-8 mb-6">
          <div className="max-w-lg mx-auto text-center mb-8">
            <h2 className="text-xl font-semibold text-white mb-2">
              Analytics is a Premium feature
            </h2>
            <p className="text-gray-400 text-sm mb-5">
              Track ticket volume, measure response times, and monitor staff performance over time.
            </p>
            <Link
              to="/premium/pricing"
              className="inline-flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
            >
              View Premium Plans
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: faChartLine,
                label: "Ticket volume trends",
                detail: "Daily, weekly, monthly",
              },
              { icon: faClock, label: "Response times", detail: "First response and resolution" },
              {
                icon: faUsers,
                label: "Staff performance",
                detail: "Per-agent metrics and ratings",
              },
              {
                icon: faStar,
                label: "Feedback analytics",
                detail: "Satisfaction scores and trends",
              },
            ].map((item) => (
              <div key={item.label} className="bg-gray-700/50 rounded-lg p-4 text-center">
                <FontAwesomeIcon
                  icon={item.icon}
                  className="text-gray-500 text-lg mb-2"
                  aria-hidden="true"
                />
                <p className="text-gray-300 text-sm font-medium">{item.label}</p>
                <p className="text-gray-500 text-xs mt-1">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isPremium && (
        <div aria-busy={isLoading || isFetching}>
          {isLoading && (
            <div role="status" className="sr-only">
              Loading analytics data, please wait.
            </div>
          )}

          {isError && (
            <div role="alert" className="bg-red-900/50 border border-red-700 rounded-xl p-5 mb-8">
              <p className="text-white font-semibold">Failed to load analytics</p>
              <p className="text-gray-300 text-sm mt-1">
                There was a problem fetching your analytics data. Please try again later.
              </p>
            </div>
          )}

          {/* Filter bar: time range + panel filter + export */}
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <div className="flex items-center gap-1" role="group" aria-label="Time range">
                {TIME_RANGES.map((range) => (
                  <Button
                    key={range.days}
                    type="button"
                    onClick={() => setDays(range.days)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      days === range.days
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                    aria-pressed={days === range.days}
                  >
                    {range.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {/* Panel filter: show when flag is on, skeleton while loading */}
                {panelFilterEnabled === true && (
                  <PanelFilterSelect
                    value={panelFilter}
                    onChange={setPanelFilter}
                    panelsData={panelsData}
                    isLoading={panelsLoading}
                    isError={panelsError}
                    className="w-full sm:w-56"
                  />
                )}
                {panelFilterEnabled === undefined && (
                  <div className="w-full sm:w-56" aria-hidden="true">
                    <div className="h-8 w-full animate-pulse rounded-lg bg-gray-700 sm:w-56" />
                  </div>
                )}
                <div
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 rounded-full border-b-2 border-blue-500 transition-opacity ${
                    isDimmed ? "animate-spin opacity-100" : "opacity-0"
                  }`}
                />
              </div>
            </div>
            <AnalyticsExportButton
              onClick={() => setShowExportModal(true)}
              disabled={isLoading || isError || !data}
              className="w-full sm:w-auto sm:self-end lg:self-auto"
            />
          </div>

          {/* Live region for filter changes */}
          {panelFilterEnabled && (
            <div role="status" className="sr-only">
              {filterAnnouncement}
            </div>
          )}

          {/* Active filter indicator */}
          {isFiltered && panelFilterEnabled && (
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
              <span>
                Filtered to {selectionCount(debouncedPanels)} panel
                {selectionCount(debouncedPanels) === 1 ? "" : "s"}
              </span>
              <Button variant="ghost" size="sm" onClick={handleClearFilter}>
                <FontAwesomeIcon icon={faTimes} className="mr-1" aria-hidden="true" />
                Clear filter
              </Button>
            </div>
          )}

          {/* Empty state: all sections would be empty under filter */}
          {isFiltered && data && data.total_tickets === 0 && !isLoading && (
            <div className="bg-gray-800 rounded-xl p-8 mb-8 text-center">
              <p className="text-gray-300 text-sm mb-3">
                No tickets match the selected panels for this period.
              </p>
              <Button variant="ghost" size="sm" onClick={handleClearFilter}>
                Clear filter
              </Button>
            </div>
          )}

          {isDimmed && (
            <div role="status" className="sr-only">
              Updating analytics data.
            </div>
          )}

          {/* All-time stats */}
          <div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {isLoading ? (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </>
              ) : (
                <>
                  <StatCard
                    label="Total Tickets"
                    value={data?.total_tickets?.toLocaleString("en-GB") ?? 0}
                    subtitle="All time"
                  />
                  <StatCard
                    label="Open Tickets"
                    value={data?.open_tickets?.toLocaleString("en-GB") ?? 0}
                    subtitle="Current"
                  />
                </>
              )}
            </dl>

            {/* Time-filtered stats */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
              {isLoading ? (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </>
              ) : (
                <>
                  <StatCard
                    label="Avg First Response"
                    value={formatDuration(responseTime)}
                    subtitle={windowLabel(days)}
                  />
                  <StatCard
                    label="Avg Rating"
                    value={
                      data?.average_rating != null && data.average_rating > 0
                        ? `${data.average_rating.toFixed(1)}/5`
                        : "No data"
                    }
                    subtitle={
                      data?.feedback_count != null && data.feedback_count > 0
                        ? `${data.feedback_count} response${data.feedback_count === 1 ? "" : "s"}`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Feedback Rate"
                    value={`${((data?.feedback_response_rate?.rate ?? 0) * 100).toFixed(0)}%`}
                    subtitle={`${data?.feedback_response_rate?.rated_tickets ?? 0}/${data?.feedback_response_rate?.closed_tickets ?? 0} tickets rated`}
                  />
                  <StatCard
                    label="Auto-closed"
                    value={data?.auto_close_stats?.auto_closed ?? 0}
                    subtitle={(() => {
                      const auto = data?.auto_close_stats?.auto_closed ?? 0;
                      const manual = data?.auto_close_stats?.manual_closed ?? 0;
                      const total = auto + manual;
                      const pct = total > 0 ? ((auto / total) * 100).toFixed(0) : "0";
                      return `${pct}% of closures`;
                    })()}
                  />
                  <StatCard
                    label="One-Touch Resolution"
                    value={
                      data?.one_touch_resolution_rate != null
                        ? `${(data.one_touch_resolution_rate * 100).toFixed(0)}%`
                        : "No data"
                    }
                    subtitle="Tickets resolved in 1 staff reply"
                  />
                  <StatCard
                    label="Avg Messages/Ticket"
                    value={
                      data?.avg_message_counts?.avg_total_messages != null
                        ? data.avg_message_counts.avg_total_messages.toFixed(1)
                        : "No data"
                    }
                    subtitle={
                      data?.avg_message_counts?.avg_staff_messages != null
                        ? `Staff: ${data.avg_message_counts.avg_staff_messages.toFixed(1)}, User: ${(data.avg_message_counts.avg_user_messages ?? 0).toFixed(1)}`
                        : undefined
                    }
                  />
                </>
              )}
            </dl>

            {/* Ticket volume chart */}
            <section
              aria-labelledby="ticket-volume-heading"
              className="bg-gray-800 rounded-xl p-5 mb-8"
            >
              <h2 id="ticket-volume-heading" className="text-white font-semibold text-lg mb-4">
                Ticket Volume
              </h2>
              {isLoading ? (
                <div aria-hidden="true">
                  <Skeleton
                    height={280}
                    borderRadius={8}
                    baseColor="#374151"
                    highlightColor="#4B5563"
                  />
                </div>
              ) : (
                <>
                  <div
                    role="img"
                    aria-label={`Ticket volume over the past ${data?.tickets_per_day?.length ?? 0} days. Peak: ${peakTickets} tickets.`}
                  >
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart
                        data={data?.tickets_per_day ?? []}
                        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" stroke="#374151" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDateLabel}
                          tick={{ fill: "#D1D5DB", fontSize: 12 }}
                          axisLine={{ stroke: "#374151" }}
                          tickLine={false}
                          minTickGap={40}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#D1D5DB", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          width={40}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#6B7280" }} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#3B82F6"
                          strokeWidth={2}
                          fill="url(#areaFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="sr-only">
                    <caption>Ticket volume per day</caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Tickets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.tickets_per_day ?? []).map((d) => (
                        <tr key={d.date}>
                          <td>{formatDateLabel(d.date)}</td>
                          <td>{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>

            {/* Backlog trend chart */}
            <section
              aria-labelledby="backlog-trend-heading"
              className="bg-gray-800 rounded-xl p-5 mb-8"
            >
              <h2 id="backlog-trend-heading" className="text-white font-semibold text-lg mb-4">
                Backlog Trend
              </h2>
              {isLoading ? (
                <div aria-hidden="true">
                  <Skeleton
                    height={280}
                    borderRadius={8}
                    baseColor="#374151"
                    highlightColor="#4B5563"
                  />
                </div>
              ) : (data?.backlog_trend ?? []).length === 0 ? (
                <p className="text-gray-300 text-sm">No backlog data available.</p>
              ) : (
                <>
                  <div
                    role="img"
                    aria-label={`Backlog trend over the past ${data?.backlog_trend?.length ?? 0} days.`}
                  >
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart
                        data={data?.backlog_trend ?? []}
                        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient id="backlogFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" stroke="#374151" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDateLabel}
                          tick={{ fill: "#D1D5DB", fontSize: 12 }}
                          axisLine={{ stroke: "#374151" }}
                          tickLine={false}
                          minTickGap={40}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#D1D5DB", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          width={40}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#6B7280" }} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#10B981"
                          strokeWidth={2}
                          fill="url(#backlogFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="sr-only">
                    <caption>Backlog trend per day</caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Open tickets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.backlog_trend ?? []).map((d) => (
                        <tr key={d.date}>
                          <td>{formatDateLabel(d.date)}</td>
                          <td>{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>

            {/* Peak hours heatmap */}
            <section
              ref={peakHoursRef}
              aria-labelledby="peak-hours-heading"
              className="bg-gray-800 rounded-xl p-5 mb-8"
            >
              <h2 id="peak-hours-heading" className="text-white font-semibold text-lg mb-4">
                Peak Hours <span className="text-sm font-normal text-gray-400">(UTC)</span>
              </h2>
              {isLoading ? (
                <div aria-hidden="true">
                  <Skeleton
                    height={220}
                    borderRadius={8}
                    baseColor="#374151"
                    highlightColor="#4B5563"
                  />
                </div>
              ) : (data?.peak_hours ?? []).length === 0 ? (
                <p className="text-gray-300 text-sm">No data available yet.</p>
              ) : (
                (() => {
                  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
                  for (const entry of data?.peak_hours ?? []) {
                    grid[entry.day_of_week][entry.hour_of_day] = entry.count;
                  }
                  const maxCount = Math.max(...grid.flat(), 1);

                  return (
                    <>
                      <div
                        role="img"
                        aria-label="Peak ticket creation hours heatmap, showing ticket volume by day of week and hour of day. All times are in UTC."
                      >
                        <div className="overflow-x-auto">
                          <div className="min-w-160">
                            <div className="flex gap-0.5 mb-1 pl-10">
                              {Array.from({ length: 24 }, (_, h) => (
                                <div key={h} className="flex-1 text-center text-gray-400 text-xs">
                                  {h % 3 === 0 ? `${h.toString().padStart(2, "0")}` : ""}
                                </div>
                              ))}
                            </div>
                            {DAY_LABELS.map((day, dayIdx) => (
                              <div key={day} className="flex gap-0.5 mb-0.5">
                                <div className="w-10 text-gray-400 text-xs flex items-center">
                                  {day}
                                </div>
                                {grid[dayIdx].map((count, hour) => {
                                  const intensity = count / maxCount;
                                  const bg =
                                    count === 0
                                      ? "bg-gray-700/30"
                                      : intensity < 0.25
                                        ? "bg-blue-900/60"
                                        : intensity < 0.5
                                          ? "bg-blue-700/70"
                                          : intensity < 0.75
                                            ? "bg-blue-500/80"
                                            : "bg-blue-400";
                                  return (
                                    <HoverTooltip
                                      key={hour}
                                      placement="top"
                                      boundaryRef={peakHoursRef}
                                      className={`flex-1 h-7 rounded-sm ${bg} cursor-default`}
                                      label={
                                        <>
                                          <span className="font-medium">
                                            {day} {hour.toString().padStart(2, "0")}:00 UTC
                                          </span>
                                          <span className="mx-1.5 text-gray-500">|</span>
                                          <span>
                                            {count} ticket{count === 1 ? "" : "s"}
                                          </span>
                                        </>
                                      }
                                    >
                                      {null}
                                    </HoverTooltip>
                                  );
                                })}
                              </div>
                            ))}
                            <div className="flex items-center justify-end gap-2 mt-3 text-xs text-gray-400">
                              <span>Less</span>
                              <div className="flex gap-0.5">
                                <div className="w-4 h-4 rounded-sm bg-gray-700/30" />
                                <div className="w-4 h-4 rounded-sm bg-blue-900/60" />
                                <div className="w-4 h-4 rounded-sm bg-blue-700/70" />
                                <div className="w-4 h-4 rounded-sm bg-blue-500/80" />
                                <div className="w-4 h-4 rounded-sm bg-blue-400" />
                              </div>
                              <span>More</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <table className="sr-only">
                        <caption>Ticket creation by day and hour</caption>
                        <thead>
                          <tr>
                            <th scope="col">Day</th>
                            <th scope="col">Hour</th>
                            <th scope="col">Tickets</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data?.peak_hours ?? []).map((entry) => (
                            <tr key={`${entry.day_of_week}-${entry.hour_of_day}`}>
                              <td>{DAY_LABELS[entry.day_of_week]}</td>
                              <td>{entry.hour_of_day}:00</td>
                              <td>{entry.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  );
                })()
              )}
            </section>

            {/* Ticket source + Response time by hour row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              {/* Ticket source breakdown */}
              <section
                aria-labelledby="ticket-source-heading"
                className="bg-gray-800 rounded-xl p-5"
              >
                <h2 id="ticket-source-heading" className="text-white font-semibold text-lg mb-4">
                  Ticket Source
                </h2>
                {isLoading ? (
                  <div aria-hidden="true">
                    <Skeleton
                      height={200}
                      borderRadius={8}
                      baseColor="#374151"
                      highlightColor="#4B5563"
                    />
                  </div>
                ) : (data?.tickets_by_source ?? []).length === 0 ? (
                  <p className="text-gray-300 text-sm">No source data available.</p>
                ) : (
                  (() => {
                    const sourceData = (data?.tickets_by_source ?? []).map((s) => ({
                      name: SOURCE_LABELS[s.source] ?? `Source ${s.source}`,
                      count: s.count,
                      fill: SOURCE_COLOURS[s.source] ?? "#6B7280",
                    }));

                    return (
                      <>
                        <div
                          role="img"
                          aria-label={`Ticket sources: ${sourceData.map((s) => `${s.name}: ${s.count}`).join(", ")}.`}
                        >
                          <ResponsiveContainer
                            width="100%"
                            height={Math.max(120, sourceData.length * 36)}
                          >
                            <BarChart
                              data={sourceData}
                              layout="vertical"
                              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="4 4"
                                stroke="#374151"
                                horizontal={false}
                              />
                              <XAxis type="number" hide />
                              <YAxis
                                dataKey="name"
                                type="category"
                                tick={{ fill: "#D1D5DB", fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                                width={80}
                                interval={0}
                              />
                              <Tooltip
                                content={<BarTooltip />}
                                cursor={{ fill: "rgba(107,114,128,0.2)" }}
                              />
                              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                                {sourceData.map((entry, idx) => (
                                  <Cell key={idx} fill={entry.fill} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <table className="sr-only">
                          <caption>Tickets by source</caption>
                          <thead>
                            <tr>
                              <th scope="col">Source</th>
                              <th scope="col">Tickets</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sourceData.map((s) => (
                              <tr key={s.name}>
                                <td>{s.name}</td>
                                <td>{s.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    );
                  })()
                )}
              </section>

              {/* Response time by hour */}
              <section
                aria-labelledby="response-by-hour-heading"
                className="bg-gray-800 rounded-xl p-5"
              >
                <h2 id="response-by-hour-heading" className="text-white font-semibold text-lg mb-4">
                  Response Time by Hour
                </h2>
                {isLoading ? (
                  <div aria-hidden="true">
                    <Skeleton
                      height={280}
                      borderRadius={8}
                      baseColor="#374151"
                      highlightColor="#4B5563"
                    />
                  </div>
                ) : (data?.response_time_by_hour ?? []).length === 0 ? (
                  <p className="text-gray-300 text-sm">No response time data available.</p>
                ) : (
                  (() => {
                    const hourData = (data?.response_time_by_hour ?? []).map((h) => ({
                      hour: `${h.hour_of_day.toString().padStart(2, "0")}:00`,
                      seconds: h.avg_response_time != null ? h.avg_response_time / 1e9 : 0,
                    }));

                    return (
                      <>
                        <div role="img" aria-label="Average first response time by hour of day.">
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart
                              data={hourData}
                              margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="4 4"
                                stroke="#374151"
                                horizontal={false}
                              />
                              <XAxis
                                dataKey="hour"
                                tick={{ fill: "#D1D5DB", fontSize: 11 }}
                                axisLine={{ stroke: "#374151" }}
                                tickLine={false}
                                interval={2}
                              />
                              <YAxis
                                tick={{ fill: "#D1D5DB", fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                                width={50}
                                tickFormatter={formatDurationAxis}
                              />
                              <Tooltip
                                content={<DurationTooltip />}
                                cursor={{ fill: "rgba(107,114,128,0.2)" }}
                              />
                              <Bar
                                dataKey="seconds"
                                fill="#8B5CF6"
                                radius={[4, 4, 0, 0]}
                                barSize={16}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <table className="sr-only">
                          <caption>Average response time by hour of day</caption>
                          <thead>
                            <tr>
                              <th scope="col">Hour</th>
                              <th scope="col">Avg Response Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hourData.map((h) => (
                              <tr key={h.hour}>
                                <td>{h.hour}</td>
                                <td>{formatDuration(h.seconds)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    );
                  })()
                )}
              </section>
            </div>

            {/* First Response Time + Resolution Time row */}
            <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DurationWindowBreakdown
                id="frt-heading"
                heading="First Response Time"
                data={data?.first_response_time}
                isLoading={isLoading}
              />
              <DurationWindowBreakdown
                id="resolution-time-heading"
                heading="Resolution Time"
                data={data?.resolution_time}
                isLoading={isLoading}
              />
            </div>

            {/* Top Close Reasons (full width, freed from the row) */}
            <section
              aria-labelledby="close-reasons-heading"
              className="bg-gray-800 rounded-xl p-5 mb-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-4">
                <h2 id="close-reasons-heading" className="text-white font-semibold text-lg">
                  Top Close Reasons
                </h2>
                <Checkbox
                  checked={closeReasonsCaseInsensitive}
                  onChange={setCloseReasonsCaseInsensitive}
                  label="Ignore casing"
                  ariaLabel="Ignore casing when grouping close reasons"
                />
              </div>
              {isLoading ? (
                <div aria-hidden="true">
                  <Skeleton
                    height={200}
                    borderRadius={8}
                    baseColor="#374151"
                    highlightColor="#4B5563"
                  />
                </div>
              ) : closeReasonsData.length === 0 ? (
                <p className="text-gray-300 text-sm">No close reasons recorded yet.</p>
              ) : (
                <>
                  <div
                    role="img"
                    aria-label={`Top close reasons: ${(data?.top_close_reasons ?? []).map((r) => `${r.reason}: ${r.count}`).join(", ") || "none"}.`}
                  >
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(120, closeReasonsData.length * 36)}
                    >
                      <BarChart
                        data={closeReasonsData}
                        layout="vertical"
                        margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="4 4" stroke="#374151" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          tick={<TruncatedYAxisTick />}
                          axisLine={false}
                          tickLine={false}
                          width={120}
                          interval={0}
                        />
                        <Tooltip
                          content={<BarTooltip />}
                          cursor={{ fill: "rgba(107,114,128,0.2)" }}
                        />
                        <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="sr-only">
                    <caption>Top close reasons</caption>
                    <thead>
                      <tr>
                        <th scope="col">Reason</th>
                        <th scope="col">Frequency rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closeReasonsData.map((d) => (
                        <tr key={d.name}>
                          <td>{d.name}</td>
                          <td>{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>

            {/* Tickets by panel + Tickets by label row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              {/* Tickets by panel */}
              <section
                aria-labelledby="tickets-by-panel-heading"
                className="bg-gray-800 rounded-xl p-5"
              >
                <h2 id="tickets-by-panel-heading" className="text-white font-semibold text-lg mb-4">
                  Tickets by Panel
                </h2>
                {isLoading ? (
                  <div aria-hidden="true">
                    <Skeleton
                      height={200}
                      borderRadius={8}
                      baseColor="#374151"
                      highlightColor="#4B5563"
                    />
                  </div>
                ) : isFiltered && selectionCount(debouncedPanels) === 1 ? (
                  <p className="text-gray-300 text-sm">
                    Select more than one panel to compare volumes.
                  </p>
                ) : (data?.tickets_by_panel ?? []).length === 0 ? (
                  <p className="text-gray-300 text-sm">No panel data available.</p>
                ) : (
                  <>
                    <div
                      role="img"
                      aria-label={`Tickets by panel: ${(data?.tickets_by_panel ?? []).map((p) => `${p.panel_title}: ${p.count}`).join(", ")}.`}
                    >
                      <ResponsiveContainer
                        width="100%"
                        height={Math.max(120, (data?.tickets_by_panel ?? []).length * 36)}
                      >
                        <BarChart
                          data={(data?.tickets_by_panel ?? []).map((p) => ({
                            name: p.panel_title,
                            count: p.count,
                          }))}
                          layout="vertical"
                          margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="4 4"
                            stroke="#374151"
                            horizontal={false}
                          />
                          <XAxis type="number" hide />
                          <YAxis
                            dataKey="name"
                            type="category"
                            tick={<TruncatedYAxisTick />}
                            axisLine={false}
                            tickLine={false}
                            width={120}
                            interval={0}
                          />
                          <Tooltip
                            content={<BarTooltip />}
                            cursor={{ fill: "rgba(107,114,128,0.2)" }}
                          />
                          <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <table className="sr-only">
                      <caption>Tickets by panel</caption>
                      <thead>
                        <tr>
                          <th scope="col">Panel</th>
                          <th scope="col">Tickets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.tickets_by_panel ?? []).map((p) => (
                          <tr key={p.panel_id ?? "none"}>
                            <td>{p.panel_title}</td>
                            <td>{p.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </section>

              {/* Tickets by label */}
              <section
                aria-labelledby="tickets-by-label-heading"
                className="bg-gray-800 rounded-xl p-5"
              >
                <h2 id="tickets-by-label-heading" className="text-white font-semibold text-lg mb-4">
                  Tickets by Label
                </h2>
                {isLoading ? (
                  <div aria-hidden="true">
                    <Skeleton
                      height={200}
                      borderRadius={8}
                      baseColor="#374151"
                      highlightColor="#4B5563"
                    />
                  </div>
                ) : (data?.tickets_by_label ?? []).length === 0 ? (
                  <p className="text-gray-300 text-sm">No label data available.</p>
                ) : (
                  (() => {
                    const labelData = (data?.tickets_by_label ?? []).map((l) => ({
                      name: l.name,
                      count: l.count,
                      fill: `#${l.colour.toString(16).padStart(6, "0")}`,
                    }));
                    return (
                      <>
                        <div
                          role="img"
                          aria-label={`Tickets by label: ${labelData.map((l) => `${l.name}: ${l.count}`).join(", ")}.`}
                        >
                          <ResponsiveContainer
                            width="100%"
                            height={Math.max(120, labelData.length * 36)}
                          >
                            <BarChart
                              data={labelData}
                              layout="vertical"
                              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="4 4"
                                stroke="#374151"
                                horizontal={false}
                              />
                              <XAxis type="number" hide />
                              <YAxis
                                dataKey="name"
                                type="category"
                                tick={<TruncatedYAxisTick />}
                                axisLine={false}
                                tickLine={false}
                                width={120}
                                interval={0}
                              />
                              <Tooltip
                                content={<BarTooltip />}
                                cursor={{ fill: "rgba(107,114,128,0.2)" }}
                              />
                              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                                {labelData.map((entry, idx) => (
                                  <Cell key={idx} fill={entry.fill} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <table className="sr-only">
                          <caption>Tickets by label</caption>
                          <thead>
                            <tr>
                              <th scope="col">Label</th>
                              <th scope="col">Tickets</th>
                            </tr>
                          </thead>
                          <tbody>
                            {labelData.map((l) => (
                              <tr key={l.name}>
                                <td>{l.name}</td>
                                <td>{l.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    );
                  })()
                )}
              </section>
            </div>

            {/* Feedback distribution + Ticket breakdown row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              {/* Feedback distribution */}
              <section
                aria-labelledby="feedback-distribution-heading"
                className="bg-gray-800 rounded-xl p-5"
              >
                <h2
                  id="feedback-distribution-heading"
                  className="text-white font-semibold text-lg mb-4"
                >
                  Feedback Distribution
                </h2>
                {isLoading ? (
                  <div aria-hidden="true">
                    <Skeleton
                      height={280}
                      borderRadius={8}
                      baseColor="#374151"
                      highlightColor="#4B5563"
                    />
                  </div>
                ) : (
                  (() => {
                    const feedbackData = (data?.feedback_distribution ?? [0, 0, 0, 0, 0]).map(
                      (count, idx) => ({
                        star: `${idx + 1} star${idx + 1 === 1 ? "" : "s"}`,
                        count,
                      }),
                    );
                    const hasData = feedbackData.some((d) => d.count > 0);
                    if (!hasData) {
                      return <p className="text-gray-300 text-sm">No feedback data yet.</p>;
                    }
                    return (
                      <>
                        <div
                          role="img"
                          aria-label={`Feedback distribution: ${feedbackData.map((d) => `${d.star}: ${d.count}`).join(", ")}.`}
                        >
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart
                              data={feedbackData}
                              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="4 4"
                                stroke="#374151"
                                horizontal={false}
                              />
                              <XAxis
                                dataKey="star"
                                tick={{ fill: "#D1D5DB", fontSize: 12 }}
                                axisLine={{ stroke: "#374151" }}
                                tickLine={false}
                              />
                              <YAxis
                                allowDecimals={false}
                                tick={{ fill: "#D1D5DB", fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                                width={40}
                              />
                              <Tooltip
                                content={<BarTooltip />}
                                cursor={{ fill: "rgba(107,114,128,0.2)" }}
                              />
                              <Bar
                                dataKey="count"
                                fill="#F59E0B"
                                radius={[4, 4, 0, 0]}
                                barSize={32}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <table className="sr-only">
                          <caption>Feedback distribution by star rating</caption>
                          <thead>
                            <tr>
                              <th scope="col">Rating</th>
                              <th scope="col">Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {feedbackData.map((d) => (
                              <tr key={d.star}>
                                <td>{d.star}</td>
                                <td>{d.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    );
                  })()
                )}
              </section>

              {/* Ticket breakdown */}
              <section
                aria-labelledby="ticket-breakdown-heading"
                className="bg-gray-800 rounded-xl p-5"
              >
                <h2 id="ticket-breakdown-heading" className="text-white font-semibold text-lg mb-4">
                  Ticket Breakdown
                </h2>
                {isLoading ? (
                  <div className="space-y-3" aria-hidden="true">
                    <Skeleton height={60} baseColor="#374151" highlightColor="#4B5563" />
                    <Skeleton height={60} baseColor="#374151" highlightColor="#4B5563" />
                  </div>
                ) : (
                  <dl className="space-y-3">
                    <div className="bg-gray-700/50 rounded-lg px-4 py-3">
                      <dt className="text-gray-300 text-sm mb-2">Thread vs Channel</dt>
                      <dd className="flex items-center gap-4 text-white text-sm font-semibold">
                        {(() => {
                          const thread = data?.thread_channel_split?.thread_count ?? 0;
                          const channel = data?.thread_channel_split?.channel_count ?? 0;
                          const total = thread + channel;
                          const threadPct = total > 0 ? ((thread / total) * 100).toFixed(0) : "0";
                          const channelPct = total > 0 ? ((channel / total) * 100).toFixed(0) : "0";
                          return (
                            <>
                              <span>
                                Thread: {thread} ({threadPct}%)
                              </span>
                              <span className="text-gray-500" aria-hidden="true">
                                |
                              </span>
                              <span>
                                Channel: {channel} ({channelPct}%)
                              </span>
                            </>
                          );
                        })()}
                      </dd>
                      {isFiltered && (
                        <p className="text-xs text-gray-400 mt-2">
                          Threads are configured per panel, so this reflects the settings of the
                          selected panels.
                        </p>
                      )}
                    </div>
                    <div className="bg-gray-700/50 rounded-lg px-4 py-3">
                      <dt className="text-gray-300 text-sm mb-2">Auto-close vs Manual</dt>
                      <dd className="flex items-center gap-4 text-white text-sm font-semibold">
                        {(() => {
                          const auto = data?.auto_close_stats?.auto_closed ?? 0;
                          const manual = data?.auto_close_stats?.manual_closed ?? 0;
                          const total = auto + manual;
                          const autoPct = total > 0 ? ((auto / total) * 100).toFixed(0) : "0";
                          const manualPct = total > 0 ? ((manual / total) * 100).toFixed(0) : "0";
                          return (
                            <>
                              <span>
                                Auto: {auto} ({autoPct}%)
                              </span>
                              <span className="text-gray-500" aria-hidden="true">
                                |
                              </span>
                              <span>
                                Manual: {manual} ({manualPct}%)
                              </span>
                            </>
                          );
                        })()}
                      </dd>
                    </div>
                  </dl>
                )}
              </section>
            </div>

            {/* Panel Performance table */}
            {panelFilterEnabled === true && (
              <PanelPerformanceTable
                panels={panelsData?.panels ?? []}
                hasTrend={panelsData?.has_trend ?? false}
                days={days}
                selectedPanels={panelFilter}
                onSelectionChange={setPanelFilter}
                isLoading={panelsLoading}
                isError={panelsError}
              />
            )}

            {/* Staff performance table - gated on isAdmin */}
            {isAdmin && (
              <section aria-labelledby="staff-heading" className="bg-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 id="staff-heading" className="text-white font-semibold text-lg">
                    Staff Performance
                    <span className="text-gray-400 text-sm font-normal ml-2">
                      ({windowLabel(days)})
                    </span>
                  </h2>
                  <ColumnSelectorButton
                    columns={ALL_ANALYTICS_COLUMNS}
                    selectedColumns={selectedStaffColumns}
                    onToggleColumn={toggleStaffColumn}
                    isOpen={showStaffColumnSelector}
                    onToggle={() => setShowStaffColumnSelector(!showStaffColumnSelector)}
                    onClose={() => setShowStaffColumnSelector(false)}
                  />
                </div>
                {staffLoading ? (
                  <div className="space-y-3" aria-hidden="true">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} height={48} baseColor="#374151" highlightColor="#4B5563" />
                    ))}
                  </div>
                ) : staffError ? (
                  <p className="text-gray-300 text-sm">Failed to load staff performance data.</p>
                ) : !staffData?.staff?.length ? (
                  <p className="text-gray-300 text-sm">No staff activity in this period.</p>
                ) : (
                  <Table variant="compact">
                    <Table.Head>
                      <Table.Row>
                        {selectedStaffColumns.includes("staff_member") && (
                          <SortableHeaderCell
                            sort={staffSort}
                            sortKey="staff_member"
                            label="Staff Member"
                            className="py-3 pr-4"
                          />
                        )}
                        {selectedStaffColumns.includes("tickets_answered") && (
                          <SortableHeaderCell
                            sort={staffSort}
                            sortKey="tickets_answered"
                            label="Tickets Answered"
                            align="right"
                            className="py-3 px-4"
                          />
                        )}
                        {selectedStaffColumns.includes("tickets_claimed") && (
                          <SortableHeaderCell
                            sort={staffSort}
                            sortKey="tickets_claimed"
                            label="Tickets Claimed"
                            align="right"
                            className="py-3 px-4"
                          />
                        )}
                        {selectedStaffColumns.includes("avg_rating") && (
                          <SortableHeaderCell
                            sort={staffSort}
                            sortKey="avg_rating"
                            label="Avg Rating"
                            align="right"
                            className="py-3 px-4"
                          />
                        )}
                        <SortableHeaderCell
                          sort={staffSort}
                          sortKey="rating_count"
                          label="Ratings"
                          align="right"
                          className="py-3 pl-4"
                        />
                      </Table.Row>
                    </Table.Head>
                    <Table.Body>
                      {staffSort.sortedRows.map((member) => (
                        <Table.Row
                          key={member.user_id}
                          className="border-b border-gray-700/50 hover:bg-gray-700/30"
                        >
                          {selectedStaffColumns.includes("staff_member") && (
                            <Table.Cell className="py-3 pr-4">
                              <div className="flex items-center gap-3">
                                {member.avatar ? (
                                  <img
                                    src={member.avatar}
                                    alt=""
                                    className="w-8 h-8 rounded-full"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gray-600" />
                                )}
                                <Link
                                  to={`/manage/${guildId}/analytics/staff/${member.user_id}`}
                                  className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
                                >
                                  {member.username || member.user_id}
                                </Link>
                              </div>
                            </Table.Cell>
                          )}
                          {selectedStaffColumns.includes("tickets_answered") && (
                            <Table.Cell className="py-3 px-4 text-right">
                              <span className="text-white font-semibold">
                                {member.tickets_answered}
                              </span>
                            </Table.Cell>
                          )}
                          {selectedStaffColumns.includes("tickets_claimed") && (
                            <Table.Cell className="py-3 px-4 text-right">
                              <span className="text-white font-semibold">
                                {member.tickets_claimed}
                              </span>
                            </Table.Cell>
                          )}
                          {selectedStaffColumns.includes("avg_rating") && (
                            <Table.Cell className="py-3 px-4 text-right">
                              <span className="text-white">
                                {member.average_rating != null
                                  ? `${member.average_rating.toFixed(1)}/5`
                                  : "No data"}
                              </span>
                            </Table.Cell>
                          )}
                          <Table.Cell className="py-3 pl-4 text-right">
                            <span className="text-gray-300 text-sm">{member.rating_count}</span>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      <AnalyticsExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Analytics"
        contextLabel={`Time range: ${windowLabel(days)}${isFiltered ? `, ${selectionCount(debouncedPanels)} panel${selectionCount(debouncedPanels) === 1 ? "" : "s"} selected` : ""}`}
        sections={exportSections}
        defaultSelectedIds={defaultSelectedIds}
        onExport={handleExport}
      />
    </MainLayout>
  );
}
