import { useParams, Link } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTicket, faRectangleList, faChartLine, faCog } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import Skeleton from "react-loading-skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { MainLayout } from "@/pages/layout/Main";
import { useAnalyticsOverview, useBasicOverview } from "@/hooks/queries/useAnalytics";
import { useGuildPanels, useGuildPremium } from "@/hooks/queries/useGuild";
import { useGuildStore } from "@/stores/guild";

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "N/A";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month}`;
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <dt className="text-gray-300 text-sm mb-1">{label}</dt>
      <dd className="text-2xl font-bold text-white">
        {value}
        {subtitle && (
          <span className="text-gray-300 text-xs mt-1 block font-normal">{subtitle}</span>
        )}
      </dd>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-gray-800 rounded-xl p-5" aria-hidden="true">
      <Skeleton width={100} height={14} baseColor="#374151" highlightColor="#4B5563" />
      <Skeleton
        width={80}
        height={28}
        className="mt-1"
        baseColor="#374151"
        highlightColor="#4B5563"
      />
    </div>
  );
}

interface TooltipPayloadItem {
  value?: number;
  payload?: { date?: string };
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      role="tooltip"
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg"
    >
      <p className="text-gray-300 text-xs mb-1">{label ? formatDateLabel(String(label)) : ""}</p>
      <p className="text-white text-sm font-semibold">
        {payload[0].value} ticket{payload[0].value === 1 ? "" : "s"}
      </p>
    </div>
  );
}

interface QuickActionProps {
  to: string;
  icon: IconDefinition;
  title: string;
  description: string;
}

function QuickActionCard({ to, icon, title, description }: QuickActionProps) {
  return (
    <Link to={to} className="bg-gray-800 rounded-xl p-5 hover:bg-gray-700 transition-colors block">
      <FontAwesomeIcon icon={icon} className="text-blue-400 text-xl mb-3" aria-hidden="true" />
      <h3 className="text-white font-semibold text-sm mb-1">{title}</h3>
      <p className="text-gray-300 text-xs">{description}</p>
    </Link>
  );
}

function QuickActionSkeleton() {
  return (
    <div className="bg-gray-800 rounded-xl p-5" aria-hidden="true">
      <Skeleton
        width={24}
        height={24}
        className="mb-3"
        baseColor="#374151"
        highlightColor="#4B5563"
      />
      <Skeleton width={100} height={16} baseColor="#374151" highlightColor="#4B5563" />
      <Skeleton
        width={160}
        height={12}
        className="mt-1"
        baseColor="#374151"
        highlightColor="#4B5563"
      />
    </div>
  );
}

export default function Overview() {
  const { guildId } = useParams();
  const selectedGuild = useGuildStore((s) => s.selectedGuild);
  const permissionLevel = selectedGuild?.permission_level ?? 0;

  const { data: premiumState, isLoading: premiumLoading } = useGuildPremium(guildId);
  const isPremium = premiumState?.premium ?? false;

  const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsOverview(
    isPremium ? guildId : undefined,
    7,
  );
  const { data: basicData, isLoading: basicLoading } = useBasicOverview(
    !premiumLoading && !isPremium ? guildId : undefined,
  );

  const data = isPremium ? analyticsData : basicData;

  const { data: panels, isLoading: panelsLoading } = useGuildPanels(
    guildId,
    permissionLevel >= 2 && isPremium,
  );

  const isLoading = premiumLoading || (isPremium ? analyticsLoading : basicLoading);
  const peakTickets = Math.max(...(data?.tickets_per_day?.map((d) => d.count) ?? [0]));

  const quickActions: (QuickActionProps & { minLevel: number; requiresPremium?: boolean })[] = [
    {
      to: `/manage/${guildId}/tickets`,
      icon: faTicket,
      title: "View Tickets",
      description: "See and manage open tickets.",
      minLevel: 1,
    },
    {
      to: `/manage/${guildId}/panels`,
      icon: faRectangleList,
      title: "Manage Panels",
      description: "Create and configure ticket panels.",
      minLevel: 2,
    },
    {
      to: `/manage/${guildId}/analytics`,
      icon: faChartLine,
      title: "View Analytics",
      description: "Detailed performance metrics.",
      minLevel: 1,
      requiresPremium: true,
    },
    {
      to: `/manage/${guildId}/settings`,
      icon: faCog,
      title: "Settings",
      description: "Configure server preferences.",
      minLevel: 2,
    },
  ];

  const visibleActions = quickActions.filter(
    (a) => permissionLevel >= a.minLevel && (!a.requiresPremium || isPremium),
  );

  return (
    <MainLayout title="Overview" subtitle="A summary of your server's ticket activity.">
      <div aria-live="polite" aria-atomic="true">
        <p className="sr-only">
          {isLoading ? "Loading overview data, please wait." : "Overview data loaded."}
        </p>
      </div>

      <div>
        <dl
          className={`grid grid-cols-1 sm:grid-cols-2 ${isPremium ? "xl:grid-cols-4" : ""} gap-4 mb-8`}
        >
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              {isPremium && <StatCardSkeleton />}
              {isPremium && <StatCardSkeleton />}
            </>
          ) : (
            <>
              <StatCard
                label="Open Tickets"
                value={data?.open_tickets?.toLocaleString("en-GB") ?? 0}
                subtitle="Current"
              />
              <StatCard
                label="Total Tickets"
                value={data?.total_tickets?.toLocaleString("en-GB") ?? 0}
                subtitle="All time"
              />
              {isPremium && (
                <StatCard
                  label="Avg First Response"
                  value={formatDuration(analyticsData?.first_response_time?.weekly ?? null)}
                  subtitle="Past 7 days"
                />
              )}
              {isPremium &&
                (panelsLoading ? (
                  <StatCardSkeleton />
                ) : (
                  <StatCard
                    label="Active Panels"
                    value={panels?.length ?? 0}
                    subtitle="Configured"
                  />
                ))}
            </>
          )}
        </dl>

        <section aria-labelledby="weekly-chart-heading" className="bg-gray-800 rounded-xl p-5 mb-8">
          <h2 id="weekly-chart-heading" className="text-white font-semibold text-lg mb-4">
            Tickets This Week
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
          ) : (data?.tickets_per_day ?? []).length === 0 ? (
            <p className="text-gray-300 text-sm">No ticket data available for this period.</p>
          ) : (
            <>
              <div
                role="img"
                aria-label={`Tickets per day over the past ${data?.tickets_per_day?.length ?? 0} days. Peak: ${peakTickets} tickets.`}
              >
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={data?.tickets_per_day ?? []}
                    margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="overviewAreaFill" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#overviewAreaFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <table className="sr-only">
                <caption>Tickets per day this week</caption>
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

        <section aria-labelledby="quick-actions-heading">
          <h2 id="quick-actions-heading" className="text-white font-semibold text-lg mb-4">
            Quick Actions
          </h2>
          <ul
            className={`grid grid-cols-1 sm:grid-cols-2 ${isPremium ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4 list-none`}
          >
            {isLoading ? (
              <>
                <li>
                  <QuickActionSkeleton />
                </li>
                <li>
                  <QuickActionSkeleton />
                </li>
                <li>
                  <QuickActionSkeleton />
                </li>
                <li>
                  <QuickActionSkeleton />
                </li>
              </>
            ) : (
              visibleActions.map((action) => (
                <li key={action.to}>
                  <QuickActionCard
                    to={action.to}
                    icon={action.icon}
                    title={action.title}
                    description={action.description}
                  />
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </MainLayout>
  );
}
