import { appendCsvSection } from "@/lib/csv";
import {
  DAY_LABELS,
  SOURCE_LABELS,
  formatDuration,
  pickWindow,
  windowLabel,
} from "@/lib/analytics-format";
import type { AnalyticsOverview, StaffAnalytics } from "@/types";
import type { ExportMeta, ExportSection } from "./types";

export interface GuildOverviewExportData {
  overview: AnalyticsOverview;
  staff?: StaffAnalytics;
  days: number;
  guildId: string;
}

const BASE_SECTIONS: ExportSection[] = [
  { id: "summary", label: "Summary statistics" },
  { id: "ticket_volume", label: "Ticket volume" },
  { id: "backlog_trend", label: "Backlog trend" },
  { id: "peak_hours", label: "Peak hours" },
  { id: "ticket_source", label: "Ticket source" },
  { id: "response_time_by_hour", label: "Response time by hour" },
  { id: "resolution_time", label: "Resolution time" },
  { id: "close_reasons", label: "Top close reasons" },
  { id: "tickets_by_panel", label: "Tickets by panel" },
  { id: "tickets_by_label", label: "Tickets by label" },
  { id: "feedback_distribution", label: "Feedback distribution" },
  { id: "ticket_breakdown", label: "Ticket breakdown" },
];

const STAFF_SECTION: ExportSection = {
  id: "staff_performance",
  label: "Staff performance",
};

export function getGuildOverviewExportSections(isAdmin: boolean): ExportSection[] {
  if (isAdmin) return [...BASE_SECTIONS, STAFF_SECTION];
  return BASE_SECTIONS;
}

export function buildGuildOverviewMeta(data: GuildOverviewExportData): ExportMeta {
  return {
    exported_at: new Date().toISOString(),
    guild_id: data.guildId,
    time_range_days: data.days,
    time_range_label: windowLabel(data.days),
  };
}

function buildSummarySection(data: GuildOverviewExportData): Record<string, unknown> {
  const { overview, days } = data;
  const responseTime = pickWindow(overview.first_response_time, days);
  const auto = overview.auto_close_stats?.auto_closed ?? 0;
  const manual = overview.auto_close_stats?.manual_closed ?? 0;
  const totalClosures = auto + manual;

  return {
    total_tickets: overview.total_tickets,
    open_tickets: overview.open_tickets,
    avg_first_response_seconds: responseTime,
    avg_first_response_formatted: formatDuration(responseTime),
    avg_rating: overview.average_rating,
    feedback_count: overview.feedback_count,
    feedback_response_rate: overview.feedback_response_rate?.rate ?? 0,
    rated_tickets: overview.feedback_response_rate?.rated_tickets ?? 0,
    closed_tickets: overview.feedback_response_rate?.closed_tickets ?? 0,
    auto_closed: auto,
    manual_closed: manual,
    auto_close_pct: totalClosures > 0 ? auto / totalClosures : 0,
    one_touch_resolution_rate: overview.one_touch_resolution_rate,
    avg_total_messages: overview.avg_message_counts?.avg_total_messages,
    avg_staff_messages: overview.avg_message_counts?.avg_staff_messages,
    avg_user_messages: overview.avg_message_counts?.avg_user_messages,
    time_range_label: windowLabel(days),
  };
}

function buildSectionPayload(id: string, data: GuildOverviewExportData): unknown {
  const { overview, staff } = data;

  switch (id) {
    case "summary":
      return buildSummarySection(data);
    case "ticket_volume":
      return overview.tickets_per_day ?? [];
    case "backlog_trend":
      return overview.backlog_trend ?? [];
    case "peak_hours":
      return (overview.peak_hours ?? []).map((entry) => ({
        day: DAY_LABELS[entry.day_of_week] ?? String(entry.day_of_week),
        day_of_week: entry.day_of_week,
        hour_utc: entry.hour_of_day,
        count: entry.count,
      }));
    case "ticket_source":
      return (overview.tickets_by_source ?? []).map((s) => ({
        source: SOURCE_LABELS[s.source] ?? `Source ${s.source}`,
        source_id: s.source,
        count: s.count,
      }));
    case "response_time_by_hour":
      return (overview.response_time_by_hour ?? []).map((h) => ({
        hour_utc: h.hour_of_day,
        avg_response_seconds: h.avg_response_time,
        avg_response_formatted: formatDuration(h.avg_response_time),
      }));
    case "resolution_time":
      return {
        weekly_seconds: overview.resolution_time?.weekly,
        weekly_formatted: formatDuration(overview.resolution_time?.weekly ?? null),
        monthly_seconds: overview.resolution_time?.monthly,
        monthly_formatted: formatDuration(overview.resolution_time?.monthly ?? null),
        all_time_seconds: overview.resolution_time?.all_time,
        all_time_formatted: formatDuration(overview.resolution_time?.all_time ?? null),
      };
    case "close_reasons":
      return overview.top_close_reasons ?? [];
    case "tickets_by_panel":
      // Key by panel_id rather than panel_title because titles have no
      // uniqueness constraint. Two panels sharing a title would silently
      // collide and lose a row if keyed by title.
      return (overview.tickets_by_panel ?? []).map((p) => ({
        panel_id: p.panel_id,
        panel_title: p.panel_title,
        count: p.count,
      }));
    case "tickets_by_label":
      return (overview.tickets_by_label ?? []).map((l) => ({
        label_id: l.label_id,
        name: l.name,
        colour: `#${l.colour.toString(16).padStart(6, "0")}`,
        count: l.count,
      }));
    case "feedback_distribution":
      return (overview.feedback_distribution ?? [0, 0, 0, 0, 0]).map((count, idx) => ({
        stars: idx + 1,
        count,
      }));
    case "ticket_breakdown":
      return {
        thread_count: overview.thread_channel_split?.thread_count ?? 0,
        channel_count: overview.thread_channel_split?.channel_count ?? 0,
        auto_closed: overview.auto_close_stats?.auto_closed ?? 0,
        manual_closed: overview.auto_close_stats?.manual_closed ?? 0,
      };
    case "staff_performance":
      return (staff?.staff ?? []).map((member) => ({
        user_id: member.user_id,
        username: member.username,
        tickets_answered: member.tickets_answered,
        tickets_claimed: member.tickets_claimed,
        average_rating: member.average_rating,
        rating_count: member.rating_count,
      }));
    default:
      return null;
  }
}

export function buildGuildOverviewPayload(
  selectedIds: string[],
  data: GuildOverviewExportData,
): Record<string, unknown> {
  const meta = buildGuildOverviewMeta(data);
  const sections: Record<string, unknown> = {};

  for (const id of selectedIds) {
    sections[id] = buildSectionPayload(id, data);
  }

  return { ...meta, sections };
}

function appendSummaryCsv(parts: string[], data: GuildOverviewExportData): void {
  const summary = buildSummarySection(data);
  appendCsvSection(
    parts,
    "Summary Statistics",
    ["Metric", "Value", "Notes"],
    [
      ["Total Tickets", summary.total_tickets as number, "All time"],
      ["Open Tickets", summary.open_tickets as number, "Current"],
      [
        "Avg First Response",
        summary.avg_first_response_formatted as string,
        summary.time_range_label as string,
      ],
      ["Avg First Response (seconds)", summary.avg_first_response_seconds as number | null, ""],
      [
        "Avg Rating",
        (summary.avg_rating as number) > 0
          ? `${(summary.avg_rating as number).toFixed(1)}/5`
          : "No data",
        `${summary.feedback_count} responses`,
      ],
      [
        "Feedback Rate",
        `${((summary.feedback_response_rate as number) * 100).toFixed(0)}%`,
        `${summary.rated_tickets}/${summary.closed_tickets} tickets rated`,
      ],
      [
        "Auto-closed",
        summary.auto_closed as number,
        `${(((summary.auto_close_pct as number) || 0) * 100).toFixed(0)}% of closures`,
      ],
      [
        "One-Touch Resolution",
        summary.one_touch_resolution_rate != null
          ? `${((summary.one_touch_resolution_rate as number) * 100).toFixed(0)}%`
          : "No data",
        "Tickets resolved in 1 staff reply",
      ],
      [
        "Avg Messages/Ticket",
        summary.avg_total_messages != null
          ? (summary.avg_total_messages as number).toFixed(1)
          : "No data",
        summary.avg_staff_messages != null
          ? `Staff: ${(summary.avg_staff_messages as number).toFixed(1)}, User: ${((summary.avg_user_messages as number) ?? 0).toFixed(1)}`
          : "",
      ],
    ],
  );
}

export function buildGuildOverviewCsv(
  selectedIds: string[],
  data: GuildOverviewExportData,
): string {
  const { overview, staff } = data;
  const parts: string[] = [];

  for (const id of selectedIds) {
    switch (id) {
      case "summary":
        appendSummaryCsv(parts, data);
        break;
      case "ticket_volume":
        appendCsvSection(
          parts,
          "Ticket Volume",
          ["Date", "Count"],
          (overview.tickets_per_day ?? []).map((d) => [d.date, d.count]),
        );
        break;
      case "backlog_trend":
        appendCsvSection(
          parts,
          "Backlog Trend",
          ["Date", "Open Tickets"],
          (overview.backlog_trend ?? []).map((d) => [d.date, d.count]),
        );
        break;
      case "peak_hours":
        appendCsvSection(
          parts,
          "Peak Hours",
          ["Day", "Hour (UTC)", "Tickets"],
          (overview.peak_hours ?? []).map((entry) => [
            DAY_LABELS[entry.day_of_week] ?? entry.day_of_week,
            `${entry.hour_of_day.toString().padStart(2, "0")}:00`,
            entry.count,
          ]),
        );
        break;
      case "ticket_source":
        appendCsvSection(
          parts,
          "Ticket Source",
          ["Source", "Count"],
          (overview.tickets_by_source ?? []).map((s) => [
            SOURCE_LABELS[s.source] ?? `Source ${s.source}`,
            s.count,
          ]),
        );
        break;
      case "response_time_by_hour":
        appendCsvSection(
          parts,
          "Response Time by Hour",
          ["Hour (UTC)", "Avg Response", "Seconds"],
          (overview.response_time_by_hour ?? []).map((h) => [
            `${h.hour_of_day.toString().padStart(2, "0")}:00`,
            formatDuration(h.avg_response_time),
            h.avg_response_time,
          ]),
        );
        break;
      case "resolution_time":
        appendCsvSection(
          parts,
          "Resolution Time",
          ["Period", "Duration", "Seconds"],
          [
            [
              "Weekly",
              formatDuration(overview.resolution_time?.weekly ?? null),
              overview.resolution_time?.weekly,
            ],
            [
              "Monthly",
              formatDuration(overview.resolution_time?.monthly ?? null),
              overview.resolution_time?.monthly,
            ],
            [
              "All Time",
              formatDuration(overview.resolution_time?.all_time ?? null),
              overview.resolution_time?.all_time,
            ],
          ],
        );
        break;
      case "close_reasons":
        appendCsvSection(
          parts,
          "Top Close Reasons",
          ["Reason", "Count"],
          (overview.top_close_reasons ?? []).map((r) => [r.reason || "No reason", r.count]),
        );
        break;
      case "tickets_by_panel":
        appendCsvSection(
          parts,
          "Tickets by Panel",
          ["Panel ID", "Panel", "Count"],
          (overview.tickets_by_panel ?? []).map((p) => [
            p.panel_id ?? "none",
            p.panel_title,
            p.count,
          ]),
        );
        break;
      case "tickets_by_label":
        appendCsvSection(
          parts,
          "Tickets by Label",
          ["Label", "Colour", "Count"],
          (overview.tickets_by_label ?? []).map((l) => [
            l.name,
            `#${l.colour.toString(16).padStart(6, "0")}`,
            l.count,
          ]),
        );
        break;
      case "feedback_distribution":
        appendCsvSection(
          parts,
          "Feedback Distribution",
          ["Rating", "Count"],
          (overview.feedback_distribution ?? [0, 0, 0, 0, 0]).map((count, idx) => [
            `${idx + 1} star`,
            count,
          ]),
        );
        break;
      case "ticket_breakdown": {
        const thread = overview.thread_channel_split?.thread_count ?? 0;
        const channel = overview.thread_channel_split?.channel_count ?? 0;
        const threadTotal = thread + channel;
        const autoClosed = overview.auto_close_stats?.auto_closed ?? 0;
        const manualClosed = overview.auto_close_stats?.manual_closed ?? 0;
        const closeTotal = autoClosed + manualClosed;
        appendCsvSection(
          parts,
          "Ticket Breakdown",
          ["Category", "Type", "Count", "Percentage"],
          [
            [
              "Thread vs Channel",
              "Thread",
              thread,
              threadTotal > 0 ? `${((thread / threadTotal) * 100).toFixed(0)}%` : "0%",
            ],
            [
              "Thread vs Channel",
              "Channel",
              channel,
              threadTotal > 0 ? `${((channel / threadTotal) * 100).toFixed(0)}%` : "0%",
            ],
            [
              "Auto-close vs Manual",
              "Auto",
              autoClosed,
              closeTotal > 0 ? `${((autoClosed / closeTotal) * 100).toFixed(0)}%` : "0%",
            ],
            [
              "Auto-close vs Manual",
              "Manual",
              manualClosed,
              closeTotal > 0 ? `${((manualClosed / closeTotal) * 100).toFixed(0)}%` : "0%",
            ],
          ],
        );
        break;
      }
      case "staff_performance":
        appendCsvSection(
          parts,
          "Staff Performance",
          [
            "Staff Member",
            "User ID",
            "Tickets Answered",
            "Tickets Claimed",
            "Avg Rating",
            "Ratings",
          ],
          (staff?.staff ?? []).map((member) => [
            member.username || member.user_id,
            member.user_id,
            member.tickets_answered,
            member.tickets_claimed,
            member.average_rating != null ? `${member.average_rating.toFixed(1)}/5` : "No data",
            member.rating_count,
          ]),
        );
        break;
    }
  }

  return parts.join("\r\n");
}
