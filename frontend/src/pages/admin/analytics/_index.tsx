import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import Table from "@/components/Table";
import AnalyticsExportButton from "@/components/AnalyticsExportButton";
import AnalyticsExportModal from "@/components/modals/AnalyticsExportModal";
import Skeleton from "react-loading-skeleton";
import { exportDateStamp } from "@/lib/analytics-format";
import {
  ADMIN_EXPORT_SECTIONS,
  buildAdminCsv,
  buildAdminPayload,
} from "@/lib/analytics-export/admin";
import { runAnalyticsExport } from "@/lib/analytics-export/run-export";
import type { ExportFormat } from "@/lib/analytics-export/types";
import type {
  AdminAdoptionData,
  AdminConfigData,
  AdminRetentionData,
  AdminUsageData,
} from "@/types";
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
} from "recharts";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month}`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-gray-300 text-xs mb-1">{label ? formatDateLabel(String(label)) : ""}</p>
      <p className="text-white text-sm font-semibold">
        {payload[0].value?.toLocaleString("en-GB")} tickets
      </p>
    </div>
  );
}

function AdoptionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { value?: number; payload?: { pct?: string } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-gray-300 text-xs mb-1">{label}</p>
      <p className="text-white text-sm font-semibold">
        {payload[0].value?.toLocaleString("en-GB")} guilds ({payload[0].payload?.pct}%)
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <dt className="text-gray-300 text-sm mb-1">{label}</dt>
      <dd className="text-2xl font-bold text-white">
        {value}
        {subtitle && (
          <span className="text-gray-400 text-xs mt-1 block font-normal">{subtitle}</span>
        )}
      </dd>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [usage, setUsage] = useState<AdminUsageData | null>(null);
  const [adoption, setAdoption] = useState<AdminAdoptionData | null>(null);
  const [retention, setRetention] = useState<AdminRetentionData | null>(null);
  const [config, setConfig] = useState<AdminConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [usageRes, adoptionRes, retentionRes, configRes] = await Promise.all([
          apiClient.admin.analytics.getUsage(),
          apiClient.admin.analytics.getAdoption(),
          apiClient.admin.analytics.getRetention(),
          apiClient.admin.analytics.getConfigPatterns(),
        ]);
        setUsage(usageRes.data);
        setAdoption(adoptionRes.data);
        setRetention(retentionRes.data);
        setConfig(configRes.data);
      } catch {
        setError("Failed to load analytics data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleExport = (selectedIds: string[], format: ExportFormat) => {
    const exportData = { usage, adoption, retention, config };
    const filename = `product-analytics-${exportDateStamp()}.${format}`;

    runAnalyticsExport(filename, format, {
      buildCsv: () => buildAdminCsv(selectedIds, exportData),
      buildPayload: () => buildAdminPayload(selectedIds, exportData),
      successMessage: "Product analytics exported.",
      onComplete: () => setShowExportModal(false),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">Product Analytics</h1>
        <AnalyticsExportButton
          onClick={() => setShowExportModal(true)}
          disabled={loading || !!error}
        />
      </div>

      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-700 rounded-xl p-5 mb-6">
          <p className="text-white">{error}</p>
        </div>
      )}

      {/* Usage KPIs */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-800 rounded-xl p-5" aria-hidden="true">
              <Skeleton width={100} height={14} baseColor="#374151" highlightColor="#4B5563" />
              <Skeleton
                width={80}
                height={28}
                className="mt-1"
                baseColor="#374151"
                highlightColor="#4B5563"
              />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Tickets Today" value={usage?.metrics.tickets_created_today ?? 0} />
            <StatCard label="Active Guilds (24h)" value={usage?.metrics.active_guilds_daily ?? 0} />
            <StatCard label="Active Guilds (7d)" value={usage?.metrics.active_guilds_weekly ?? 0} />
            <StatCard
              label="Active Guilds (30d)"
              value={usage?.metrics.active_guilds_monthly ?? 0}
            />
            <StatCard label="Total Guilds" value={usage?.metrics.total_guilds ?? 0} />
          </>
        )}
      </dl>

      {/* Global ticket volume chart */}
      <section className="bg-gray-800 rounded-xl p-5 mb-8">
        <h2 className="text-white font-semibold text-lg mb-4">Global Ticket Volume (90 days)</h2>
        {loading ? (
          <Skeleton height={280} borderRadius={8} baseColor="#374151" highlightColor="#4B5563" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={usage?.tickets_per_day ?? []}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="globalFill" x1="0" y1="0" x2="0" y2="1">
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
                width={50}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#6B7280" }} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#globalFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Feature adoption */}
        <section className="bg-gray-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-lg mb-4">Feature Adoption</h2>
          {loading ? (
            <Skeleton height={280} borderRadius={8} baseColor="#374151" highlightColor="#4B5563" />
          ) : (adoption?.features ?? []).length === 0 ? (
            <p className="text-gray-300 text-sm">No adoption data available.</p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, (adoption?.features ?? []).length * 40)}
            >
              <BarChart
                data={(adoption?.features ?? []).map((f) => ({
                  name: f.feature,
                  count: f.guild_count,
                  pct: adoption?.total_guilds
                    ? ((f.guild_count / adoption.total_guilds) * 100).toFixed(0)
                    : "0",
                }))}
                layout="vertical"
                margin={{ top: 0, right: 60, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="4 4" stroke="#374151" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: "#D1D5DB", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                  interval={0}
                />
                <Tooltip content={<AdoptionTooltip />} cursor={{ fill: "rgba(107,114,128,0.2)" }} />
                <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Retention */}
        <section className="bg-gray-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-lg mb-4">Retention / Churn</h2>
          {loading ? (
            <div className="space-y-3">
              <Skeleton height={60} baseColor="#374151" highlightColor="#4B5563" />
              <Skeleton height={60} baseColor="#374151" highlightColor="#4B5563" />
              <Skeleton height={200} baseColor="#374151" highlightColor="#4B5563" />
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-700/50 rounded-lg px-4 py-3">
                  <dt className="text-gray-300 text-sm">Active (30d)</dt>
                  <dd className="text-xl font-bold text-green-400">
                    {retention?.active_guilds_30d ?? 0}
                  </dd>
                </div>
                <div className="bg-gray-700/50 rounded-lg px-4 py-3">
                  <dt className="text-gray-300 text-sm">Churned (30d)</dt>
                  <dd className="text-xl font-bold text-red-400">
                    {retention?.churned_guilds_30d ?? 0}
                  </dd>
                </div>
              </dl>

              {(retention?.recently_churned ?? []).length > 0 && (
                <div>
                  <h3 className="text-gray-300 text-sm font-medium mb-2">
                    Recently Churned Guilds
                  </h3>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {(retention?.recently_churned ?? []).map((g) => (
                      <div
                        key={g.guild_id}
                        className="flex items-center justify-between bg-gray-700/30 rounded px-3 py-2 text-sm"
                      >
                        <span className="text-white font-mono">{g.guild_id}</span>
                        <span className="text-gray-400">
                          {new Date(g.last_ticket_time).toLocaleDateString("en-GB")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Config patterns */}
      <section className="bg-gray-800 rounded-xl p-5">
        <h2 className="text-white font-semibold text-lg mb-4">Configuration Patterns</h2>
        {loading ? (
          <Skeleton height={200} borderRadius={8} baseColor="#374151" highlightColor="#4B5563" />
        ) : (config?.patterns ?? []).length === 0 ? (
          <p className="text-gray-300 text-sm">No configuration data available.</p>
        ) : (
          <Table variant="compact">
            <Table.Head>
              <Table.Row>
                <Table.HeaderCell>Setting</Table.HeaderCell>
                <Table.HeaderCell>Value</Table.HeaderCell>
                <Table.HeaderCell className="px-4 py-3 text-right">Guilds</Table.HeaderCell>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {(config?.patterns ?? []).map((p, i) => (
                <Table.Row key={i}>
                  <Table.Cell className="px-4 py-3 text-white">{p.setting}</Table.Cell>
                  <Table.Cell className="px-4 py-3 text-gray-300">{p.value}</Table.Cell>
                  <Table.Cell className="px-4 py-3 text-right text-white font-semibold">
                    {p.count.toLocaleString("en-GB")}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </section>

      <AnalyticsExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Product Analytics"
        sections={ADMIN_EXPORT_SECTIONS}
        onExport={handleExport}
      />
    </div>
  );
}
