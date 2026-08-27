import { appendCsvSection } from "@/lib/csv";
import { formatDuration } from "@/lib/analytics-format";
import type { StaffDetailAnalytics } from "@/types";
import type { ExportMeta, ExportSection } from "./types";

export const STAFF_DETAIL_EXPORT_SECTIONS: ExportSection[] = [
  { id: "summary", label: "Summary stats" },
  { id: "first_response_time", label: "First response time" },
  { id: "tickets_claimed", label: "Tickets claimed" },
  { id: "tickets_answered", label: "Tickets answered vs guild total" },
  { id: "feedback_distribution", label: "Feedback distribution" },
];

export interface StaffDetailExportData {
  detail: StaffDetailAnalytics;
  guildId: string;
}

export function buildStaffDetailMeta(data: StaffDetailExportData): ExportMeta {
  return {
    exported_at: new Date().toISOString(),
    guild_id: data.guildId,
    user_id: data.detail.user_id,
    username: data.detail.username,
  };
}

function buildSectionPayload(id: string, data: StaffDetailExportData): unknown {
  const { detail } = data;

  switch (id) {
    case "summary":
      return {
        average_rating: detail.average_rating,
        rating_count: detail.rating_count,
        avg_first_response_seconds: detail.first_response_time?.weekly,
        avg_first_response_formatted: formatDuration(detail.first_response_time?.weekly ?? null),
        tickets_claimed_all_time: detail.tickets_claimed.all_time,
        tickets_claimed_monthly: detail.tickets_claimed.monthly,
        open_claimed_count: detail.open_claimed_count,
      };
    case "first_response_time":
      return {
        weekly_seconds: detail.first_response_time?.weekly,
        weekly_formatted: formatDuration(detail.first_response_time?.weekly ?? null),
        monthly_seconds: detail.first_response_time?.monthly,
        monthly_formatted: formatDuration(detail.first_response_time?.monthly ?? null),
        all_time_seconds: detail.first_response_time?.all_time,
        all_time_formatted: formatDuration(detail.first_response_time?.all_time ?? null),
      };
    case "tickets_claimed":
      return {
        weekly: detail.tickets_claimed.weekly,
        monthly: detail.tickets_claimed.monthly,
        all_time: detail.tickets_claimed.all_time,
      };
    case "tickets_answered":
      return {
        weekly: {
          answered: detail.tickets_answered.weekly,
          guild_total: detail.guild_total_tickets.weekly,
        },
        monthly: {
          answered: detail.tickets_answered.monthly,
          guild_total: detail.guild_total_tickets.monthly,
        },
        all_time: {
          answered: detail.tickets_answered.all_time,
          guild_total: detail.guild_total_tickets.all_time,
        },
      };
    case "feedback_distribution":
      return (detail.feedback_distribution ?? [0, 0, 0, 0, 0]).map((count, idx) => ({
        stars: idx + 1,
        count,
      }));
    default:
      return null;
  }
}

export function buildStaffDetailPayload(
  selectedIds: string[],
  data: StaffDetailExportData,
): Record<string, unknown> {
  const meta = buildStaffDetailMeta(data);
  const sections: Record<string, unknown> = {};

  for (const id of selectedIds) {
    sections[id] = buildSectionPayload(id, data);
  }

  return { ...meta, sections };
}

export function buildStaffDetailCsv(selectedIds: string[], data: StaffDetailExportData): string {
  const { detail } = data;
  const parts: string[] = [];

  for (const id of selectedIds) {
    switch (id) {
      case "summary":
        appendCsvSection(
          parts,
          "Summary Stats",
          ["Metric", "Value", "Notes"],
          [
            [
              "Avg Rating",
              detail.average_rating != null ? `${detail.average_rating.toFixed(1)}/5` : "No data",
              `${detail.rating_count} responses`,
            ],
            [
              "Avg First Response",
              formatDuration(detail.first_response_time?.weekly ?? null),
              detail.first_response_time?.weekly,
            ],
            [
              "Tickets Claimed",
              detail.tickets_claimed.all_time,
              `${detail.tickets_claimed.monthly} this month`,
            ],
            ["Open Tickets", detail.open_claimed_count, ""],
          ],
        );
        break;
      case "first_response_time":
        appendCsvSection(
          parts,
          "First Response Time",
          ["Period", "Duration", "Seconds"],
          [
            [
              "Weekly",
              formatDuration(detail.first_response_time?.weekly ?? null),
              detail.first_response_time?.weekly,
            ],
            [
              "Monthly",
              formatDuration(detail.first_response_time?.monthly ?? null),
              detail.first_response_time?.monthly,
            ],
            [
              "All Time",
              formatDuration(detail.first_response_time?.all_time ?? null),
              detail.first_response_time?.all_time,
            ],
          ],
        );
        break;
      case "tickets_claimed":
        appendCsvSection(
          parts,
          "Tickets Claimed",
          ["Period", "Count"],
          [
            ["Weekly", detail.tickets_claimed.weekly],
            ["Monthly", detail.tickets_claimed.monthly],
            ["All Time", detail.tickets_claimed.all_time],
          ],
        );
        break;
      case "tickets_answered":
        appendCsvSection(
          parts,
          "Tickets Answered",
          ["Period", "Answered", "Guild Total"],
          [
            ["Weekly", detail.tickets_answered.weekly, detail.guild_total_tickets.weekly],
            ["Monthly", detail.tickets_answered.monthly, detail.guild_total_tickets.monthly],
            ["All Time", detail.tickets_answered.all_time, detail.guild_total_tickets.all_time],
          ],
        );
        break;
      case "feedback_distribution":
        appendCsvSection(
          parts,
          "Feedback Distribution",
          ["Rating", "Count"],
          (detail.feedback_distribution ?? [0, 0, 0, 0, 0]).map((count, idx) => [
            `${idx + 1} star`,
            count,
          ]),
        );
        break;
    }
  }

  return parts.join("\r\n");
}
