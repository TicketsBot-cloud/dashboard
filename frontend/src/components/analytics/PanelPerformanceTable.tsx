import { useMemo, useCallback, type FC } from "react";
import Skeleton from "react-loading-skeleton";
import Table from "@/components/Table";
import SortableHeaderCell from "@/components/SortableHeaderCell";
import TrendIndicator from "@/components/analytics/TrendIndicator";
import { useTableSort } from "@/hooks/useTableSort";
import { formatDuration, windowLabel } from "@/lib/analytics-format";
import { selectOnly } from "@/lib/analytics-panel-filter";
import type { SortColumn } from "@/lib/table-sort";
import type { PanelPerformanceRow } from "@/types";

// Minimum tickets in either period before we trust the delta
const MIN_SAMPLE = 10;

type SortKey = "tickets" | "first_response" | "resolution" | "rating";

const SORT_COLUMNS: Record<SortKey, SortColumn<PanelPerformanceRow>> = {
  tickets: { value: (p) => p.ticket_count },
  first_response: { value: (p) => p.avg_first_response_seconds },
  resolution: { value: (p) => p.avg_resolution_seconds },
  rating: { value: (p) => p.avg_rating },
};

const pinNoPanelLast = (p: PanelPerformanceRow) => p.panel_id === null;

interface PanelPerformanceTableProps {
  panels: PanelPerformanceRow[];
  hasTrend: boolean;
  days: number;
  selectedPanels: string;
  onSelectionChange: (canonical: string) => void;
  isLoading: boolean;
  isError: boolean;
}

function panelKey(row: PanelPerformanceRow): string {
  return row.panel_id !== null ? String(row.panel_id) : "none";
}

/** Find panels that share a title and need disambiguation. */
function findDuplicateTitles(panels: PanelPerformanceRow[]): Set<string> {
  const seen = new Map<string, number>();
  for (const p of panels) {
    seen.set(p.title, (seen.get(p.title) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [title, count] of seen) {
    if (count > 1) dupes.add(title);
  }
  return dupes;
}

/** Build the lead-in sentence about the slowest panel. */
function buildLeadIn(panels: PanelPerformanceRow[]): string | null {
  const withFrt = panels.filter(
    (p) =>
      p.panel_id !== null && p.avg_first_response_seconds !== null && p.ticket_count >= MIN_SAMPLE,
  );
  if (withFrt.length < 2) return null;

  const sorted = [...withFrt].sort(
    (a, b) => (b.avg_first_response_seconds ?? 0) - (a.avg_first_response_seconds ?? 0),
  );
  const slowest = sorted[0];
  const fastest = sorted[sorted.length - 1];

  if (!slowest.avg_first_response_seconds || !fastest.avg_first_response_seconds) return null;
  if (fastest.avg_first_response_seconds === 0) return null;

  const ratio = slowest.avg_first_response_seconds / fastest.avg_first_response_seconds;

  if (ratio < 1.1) return null;

  return `${slowest.title} has the slowest first response at ${formatDuration(slowest.avg_first_response_seconds)}, ${ratio.toFixed(1)} times the fastest panel.`;
}

/** Build the reconciling total line. */
function buildTotalLine(panels: PanelPerformanceRow[]): string {
  const realPanels = panels.filter((p) => p.panel_id !== null);
  const noPanel = panels.find((p) => p.panel_id === null);
  const totalTickets = panels.reduce((sum, p) => sum + p.ticket_count, 0);
  const panelCount = realPanels.length;

  let line = `${panelCount} panel${panelCount === 1 ? "" : "s"}, ${totalTickets.toLocaleString("en-GB")} ticket${totalTickets === 1 ? "" : "s"}.`;

  if (noPanel && noPanel.ticket_count > 0) {
    line += ` Plus ${noPanel.ticket_count.toLocaleString("en-GB")} with no panel.`;
  }

  return line;
}

const PanelPerformanceTable: FC<PanelPerformanceTableProps> = ({
  panels,
  hasTrend,
  days,
  onSelectionChange,
  isLoading,
  isError,
}) => {
  const sort = useTableSort(panels, SORT_COLUMNS, {
    initialSort: { key: "tickets", dir: "desc" },
    pinLast: pinNoPanelLast,
    persistKey: "analytics-panels",
  });

  const duplicateTitles = useMemo(() => findDuplicateTitles(panels), [panels]);

  const leadIn = useMemo(() => buildLeadIn(panels), [panels]);
  const totalLine = useMemo(() => buildTotalLine(panels), [panels]);

  const handleSelectOnly = useCallback(
    (key: string) => {
      onSelectionChange(selectOnly(key));
    },
    [onSelectionChange],
  );

  function isSuppressed(row: PanelPerformanceRow): boolean {
    if (!row.previous) return false;
    return row.ticket_count < MIN_SAMPLE || row.previous.ticket_count < MIN_SAMPLE;
  }

  return (
    <section aria-labelledby="panel-perf-heading" className="bg-gray-800 rounded-xl p-5 mb-6">
      <h2 id="panel-perf-heading" className="text-white font-semibold text-lg mb-1">
        Panel Performance
        <span className="text-gray-400 text-sm font-normal ml-2">({windowLabel(days)})</span>
      </h2>

      {!hasTrend && !isLoading && panels.length > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          Trends compare with the previous period of the same length. Not shown for the all-time
          range.
        </p>
      )}

      {isLoading ? (
        <>
          <div className="space-y-3" aria-hidden="true">
            <Skeleton width={280} height={18} baseColor="#374151" highlightColor="#4B5563" />
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} height={60} baseColor="#374151" highlightColor="#4B5563" />
            ))}
          </div>
          <span className="sr-only" role="status">
            Loading panel performance
          </span>
        </>
      ) : isError ? (
        <p className="text-gray-300 text-sm">Failed to load panel performance data.</p>
      ) : panels.length === 0 ? (
        <p className="text-gray-300 text-sm">No panels received tickets in this period.</p>
      ) : (
        <>
          {leadIn && (
            <p className="mb-3 text-sm text-gray-300">
              <span className="font-semibold text-white">{leadIn.split(",")[0]}</span>,
              {leadIn.split(",").slice(1).join(",")}
            </p>
          )}

          <Table variant="compact" aria-label="Panel performance">
            <Table.Head>
              <Table.Row>
                {/* Select-all checkbox */}
                <Table.HeaderCell className="min-w-[12rem] px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Panel
                </Table.HeaderCell>
                <SortableHeaderCell
                  sort={sort}
                  sortKey="tickets"
                  label="Tickets"
                  align="right"
                  className="w-24 sm:w-28"
                />
                <SortableHeaderCell
                  sort={sort}
                  sortKey="first_response"
                  label="Avg First Response"
                  align="right"
                  className="min-w-[8.5rem]"
                />
                <SortableHeaderCell
                  sort={sort}
                  sortKey="resolution"
                  label="Avg Resolution"
                  align="right"
                  className="min-w-[8.5rem]"
                />
                <SortableHeaderCell
                  sort={sort}
                  sortKey="rating"
                  label="Avg Rating"
                  align="right"
                  className="w-28 sm:w-32"
                />
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {sort.sortedRows.map((row) => {
                const key = panelKey(row);
                const isNoPanel = row.panel_id === null;
                const needsDisambiguation = duplicateTitles.has(row.title);
                const suppressed = isSuppressed(row);
                const hasCurrentButNoPrevious =
                  row.ticket_count > 0 && row.previous === null && hasTrend;
                const zeroTickets = row.ticket_count === 0;

                return (
                  <Table.Row
                    key={key}
                    className={`cursor-pointer transition-colors
                      ${isNoPanel ? "border-t border-gray-700" : ""}
                      hover:bg-gray-700/40 border-b border-gray-700/50`}
                  >
                    {/* Panel name (row header so cell-by-cell navigation names the panel) */}
                    <Table.RowHeaderCell className="px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          title={`Show only ${isNoPanel ? "tickets with no panel" : row.title}`}
                          aria-label={`Show only ${row.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectOnly(key);
                          }}
                          className={`min-w-0 truncate text-left text-sm transition-colors
                            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500
                            "text-gray-300 hover:text-white`}
                        >
                          {row.title}
                        </button>
                        {(row.disabled || row.force_disabled) && (
                          <span
                            className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium uppercase
                                           tracking-wide text-gray-300 ring-1 ring-inset ring-gray-600"
                          >
                            Disabled
                          </span>
                        )}
                      </div>
                      {(needsDisambiguation || isNoPanel) && (
                        <span className="mt-0.5 block truncate text-xs text-gray-400">
                          {isNoPanel ? "Tickets opened without a panel" : `#${row.channel_id}`}
                        </span>
                      )}
                    </Table.RowHeaderCell>

                    {/* Tickets */}
                    <Table.Cell className="px-4 py-2.5 text-right">
                      {zeroTickets ? (
                        <>
                          <span className="text-gray-400" aria-hidden="true">
                            0
                          </span>
                          <span className="sr-only">0 tickets</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-sm font-semibold tabular-nums text-white">
                            {row.ticket_count.toLocaleString("en-GB")}
                          </span>
                          {hasTrend &&
                            row.trend?.ticket_count_pct !== null &&
                            row.trend?.ticket_count_pct !== undefined && (
                              <span className="mt-0.5 block text-xs tabular-nums text-gray-400">
                                {row.trend.ticket_count_pct > 0 ? "+" : ""}
                                {Math.round(row.trend.ticket_count_pct)}% vs previous
                              </span>
                            )}
                          {hasCurrentButNoPrevious && (
                            <span className="mt-0.5 block text-xs text-gray-400">New</span>
                          )}
                        </>
                      )}
                    </Table.Cell>

                    {/* Avg First Response */}
                    <Table.Cell className="px-4 py-2.5 text-right">
                      {zeroTickets || row.avg_first_response_seconds === null ? (
                        <>
                          <span className="text-gray-400" aria-hidden="true">
                            -
                          </span>
                          <span className="sr-only">No data</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-sm font-semibold tabular-nums text-white">
                            {formatDuration(row.avg_first_response_seconds)}
                          </span>
                          {hasTrend && (
                            <span className="mt-0.5 flex justify-end">
                              <TrendIndicator
                                value={row.trend?.first_response_pct ?? null}
                                polarity="lower-is-better"
                                metricLabel="First response"
                                suppressed={suppressed}
                                isNew={hasCurrentButNoPrevious}
                              />
                            </span>
                          )}
                        </>
                      )}
                    </Table.Cell>

                    {/* Avg Resolution */}
                    <Table.Cell className="px-4 py-2.5 text-right">
                      {zeroTickets || row.avg_resolution_seconds === null ? (
                        <>
                          <span className="text-gray-400" aria-hidden="true">
                            -
                          </span>
                          <span className="sr-only">No data</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-sm font-semibold tabular-nums text-white">
                            {formatDuration(row.avg_resolution_seconds)}
                          </span>
                          {hasTrend && (
                            <span className="mt-0.5 flex justify-end">
                              <TrendIndicator
                                value={row.trend?.resolution_pct ?? null}
                                polarity="lower-is-better"
                                metricLabel="Resolution time"
                                suppressed={suppressed}
                                isNew={hasCurrentButNoPrevious}
                              />
                            </span>
                          )}
                        </>
                      )}
                    </Table.Cell>

                    {/* Avg Rating */}
                    <Table.Cell className="px-4 py-2.5 text-right">
                      {zeroTickets || row.avg_rating === null ? (
                        <>
                          <span className="text-gray-400" aria-hidden="true">
                            -
                          </span>
                          <span className="sr-only">No data</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-sm font-semibold tabular-nums text-white">
                            {row.avg_rating.toFixed(1)}/5
                          </span>
                          <span className="block text-xs text-gray-400 tabular-nums">
                            {row.rating_count} rating{row.rating_count === 1 ? "" : "s"}
                          </span>
                          {hasTrend && (
                            <span className="mt-0.5 flex justify-end">
                              <TrendIndicator
                                value={row.trend?.rating_delta ?? null}
                                polarity="higher-is-better"
                                metricLabel="Rating"
                                absolute
                                suppressed={suppressed}
                                isNew={hasCurrentButNoPrevious}
                              />
                            </span>
                          )}
                        </>
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>

          {/* Total line */}
          <p className="mt-3 border-t border-gray-700 pt-3 text-xs text-gray-400 tabular-nums">
            {totalLine}
          </p>
        </>
      )}
    </section>
  );
};

export default PanelPerformanceTable;
