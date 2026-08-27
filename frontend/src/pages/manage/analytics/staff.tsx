import { useState } from "react";
import { Link, useParams } from "react-router";
import { MainLayout } from "@/pages/layout/Main";
import { useAnalyticsStaffDetail } from "@/hooks/queries/useAnalytics";
import AnalyticsExportButton from "@/components/AnalyticsExportButton";
import AnalyticsExportModal from "@/components/modals/AnalyticsExportModal";
import Skeleton from "react-loading-skeleton";
import {
  exportDateStamp,
  formatDuration,
  pickPreferredResponseWindow,
} from "@/lib/analytics-format";
import {
  buildStaffDetailCsv,
  buildStaffDetailPayload,
  STAFF_DETAIL_EXPORT_SECTIONS,
} from "@/lib/analytics-export/staff-detail";
import { runAnalyticsExport } from "@/lib/analytics-export/run-export";
import type { ExportFormat } from "@/lib/analytics-export/types";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

function BarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      role="tooltip"
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg"
    >
      <p className="text-gray-300 text-xs mb-1">{label}</p>
      <p className="text-white text-sm font-semibold">
        {payload[0].value?.toLocaleString("en-GB")}
      </p>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

function StatCard({ label, value, subtitle }: StatCardProps) {
  const labelId = `stat-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="bg-gray-800 rounded-xl p-5" role="group" aria-labelledby={labelId}>
      <dt id={labelId} className="text-gray-300 text-sm mb-1">
        {label}
      </dt>
      <dd className="text-2xl font-bold text-white">
        {value}
        {subtitle && (
          <span className="text-gray-400 text-xs mt-1 block font-normal">{subtitle}</span>
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

export default function StaffDetailPage() {
  const { guildId, userId } = useParams();
  const { data, isLoading, isError } = useAnalyticsStaffDetail(guildId, userId);
  const [showExportModal, setShowExportModal] = useState(false);

  const pageTitle = data?.username ?? "Staff Member";

  const handleExport = (selectedIds: string[], format: ExportFormat) => {
    if (!data || !guildId) return;

    const exportData = { detail: data, guildId };
    const filename = `staff-analytics-${data.user_id}-${exportDateStamp()}.${format}`;

    runAnalyticsExport(filename, format, {
      buildCsv: () => buildStaffDetailCsv(selectedIds, exportData),
      buildPayload: () => buildStaffDetailPayload(selectedIds, exportData),
      successMessage: "Staff analytics exported.",
      onComplete: () => setShowExportModal(false),
    });
  };

  return (
    <MainLayout title={pageTitle}>
      {/* Back link */}
      <div className="mb-6">
        <Link
          to={`/manage/${guildId}/analytics`}
          className="text-blue-400 hover:text-blue-300 hover:underline text-sm inline-flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Analytics
        </Link>
      </div>

      <div aria-live="polite" aria-busy={isLoading}>
        {isLoading && <p className="sr-only">Loading staff analytics, please wait.</p>}

        {isError && (
          <div role="alert" className="bg-red-900/50 border border-red-700 rounded-xl p-5 mb-8">
            <p className="text-white font-semibold">Failed to load staff analytics</p>
            <p className="text-gray-300 text-sm mt-1">
              There was a problem fetching this staff member&apos;s data. Please try again later.
            </p>
          </div>
        )}

        {/* Header with avatar */}
        {isLoading ? (
          <div className="flex items-center gap-4 mb-8" aria-hidden="true">
            <Skeleton circle width={64} height={64} baseColor="#374151" highlightColor="#4B5563" />
            <Skeleton width={180} height={28} baseColor="#374151" highlightColor="#4B5563" />
          </div>
        ) : data ? (
          <div className="flex items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              {data.avatar ? (
                <img
                  src={data.avatar}
                  alt={`${data.username}'s avatar`}
                  className="w-16 h-16 rounded-full"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-600" />
              )}
              <h2 className="text-white text-2xl font-bold">{data.username || data.user_id}</h2>
            </div>
            <AnalyticsExportButton
              onClick={() => setShowExportModal(true)}
              disabled={isLoading || isError || !data}
            />
          </div>
        ) : null}

        {/* Stat cards */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : data ? (
            <>
              <StatCard
                label="Avg Rating"
                value={
                  data.average_rating != null ? `${data.average_rating.toFixed(1)}/5` : "No data"
                }
                subtitle={`${data.rating_count} response${data.rating_count === 1 ? "" : "s"}`}
              />
              <StatCard
                label="Avg First Response"
                value={formatDuration(pickPreferredResponseWindow(data.first_response_time))}
              />
              <StatCard
                label="Tickets Claimed"
                value={data.tickets_claimed.all_time}
                subtitle={`${data.tickets_claimed.monthly} this month`}
              />
              <StatCard label="Open Tickets" value={data.open_claimed_count} />
            </>
          ) : null}
        </dl>

        {/* First response time (triple window) */}
        <section
          aria-labelledby="response-time-heading"
          className="bg-gray-800 rounded-xl p-5 mb-8"
        >
          <h2 id="response-time-heading" className="text-white font-semibold text-lg mb-4">
            First Response Time
          </h2>
          {isLoading ? (
            <div className="space-y-3" aria-hidden="true">
              <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
              <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
              <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
            </div>
          ) : data ? (
            <dl className="space-y-3">
              {(
                [
                  ["Weekly", data.first_response_time?.weekly],
                  ["Monthly", data.first_response_time?.monthly],
                  ["All Time", data.first_response_time?.all_time],
                ] as const
              ).map(([label, val]) => (
                <div
                  key={label}
                  className="flex items-center justify-between bg-gray-700/50 rounded-lg px-4 py-3"
                >
                  <dt className="text-gray-300 text-sm">{label}</dt>
                  <dd className="text-white font-semibold">{formatDuration(val ?? null)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>

        {/* Tickets claimed vs answered */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {/* Tickets claimed */}
          <section aria-labelledby="tickets-claimed-heading" className="bg-gray-800 rounded-xl p-5">
            <h2 id="tickets-claimed-heading" className="text-white font-semibold text-lg mb-4">
              Tickets Claimed
            </h2>
            {isLoading ? (
              <div className="space-y-3" aria-hidden="true">
                <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
                <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
                <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
              </div>
            ) : data ? (
              <dl className="space-y-3">
                {(
                  [
                    ["Weekly", data.tickets_claimed.weekly],
                    ["Monthly", data.tickets_claimed.monthly],
                    ["All Time", data.tickets_claimed.all_time],
                  ] as const
                ).map(([label, val]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between bg-gray-700/50 rounded-lg px-4 py-3"
                  >
                    <dt className="text-gray-300 text-sm">{label}</dt>
                    <dd className="text-white font-semibold">{val}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          {/* Tickets answered */}
          <section
            aria-labelledby="tickets-answered-heading"
            className="bg-gray-800 rounded-xl p-5"
          >
            <h2 id="tickets-answered-heading" className="text-white font-semibold text-lg mb-4">
              Tickets Answered
            </h2>
            {isLoading ? (
              <div className="space-y-3" aria-hidden="true">
                <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
                <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
                <Skeleton height={40} baseColor="#374151" highlightColor="#4B5563" />
              </div>
            ) : data ? (
              <dl className="space-y-3">
                {(
                  [
                    ["Weekly", data.tickets_answered.weekly, data.guild_total_tickets.weekly],
                    ["Monthly", data.tickets_answered.monthly, data.guild_total_tickets.monthly],
                    ["All Time", data.tickets_answered.all_time, data.guild_total_tickets.all_time],
                  ] as const
                ).map(([label, answered, total]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between bg-gray-700/50 rounded-lg px-4 py-3"
                  >
                    <dt className="text-gray-300 text-sm">{label}</dt>
                    <dd className="text-white font-semibold">
                      {answered} / {total}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        </div>

        {/* Feedback distribution */}
        <section
          aria-labelledby="feedback-distribution-heading"
          className="bg-gray-800 rounded-xl p-5 mb-8"
        >
          <h2 id="feedback-distribution-heading" className="text-white font-semibold text-lg mb-4">
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
                  star: `${idx + 1} ★`,
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
                        <CartesianGrid strokeDasharray="4 4" stroke="#374151" horizontal={false} />
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
                        <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={32} />
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
      </div>

      <AnalyticsExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Staff Analytics"
        contextLabel={data ? `Staff member: ${data.username || data.user_id}` : undefined}
        sections={STAFF_DETAIL_EXPORT_SECTIONS}
        onExport={handleExport}
      />
    </MainLayout>
  );
}
