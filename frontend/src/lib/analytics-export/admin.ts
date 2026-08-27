import { appendCsvSection } from "@/lib/csv";
import type {
  AdminAdoptionData,
  AdminConfigData,
  AdminRetentionData,
  AdminUsageData,
} from "@/types";
import type { ExportMeta, ExportSection } from "./types";

export interface AdminExportData {
  usage: AdminUsageData | null;
  adoption: AdminAdoptionData | null;
  retention: AdminRetentionData | null;
  config: AdminConfigData | null;
}

export const ADMIN_EXPORT_SECTIONS: ExportSection[] = [
  { id: "usage_metrics", label: "Usage KPIs" },
  { id: "global_ticket_volume", label: "Global ticket volume (90d)" },
  { id: "feature_adoption", label: "Feature adoption" },
  { id: "retention_summary", label: "Retention summary" },
  { id: "recently_churned", label: "Recently churned guilds" },
  { id: "config_patterns", label: "Configuration patterns" },
];

export function buildAdminMeta(): ExportMeta {
  return {
    exported_at: new Date().toISOString(),
  };
}

function buildSectionPayload(id: string, data: AdminExportData): unknown {
  switch (id) {
    case "usage_metrics":
      return data.usage?.metrics ?? {};
    case "global_ticket_volume":
      return data.usage?.tickets_per_day ?? [];
    case "feature_adoption":
      return (data.adoption?.features ?? []).map((f) => ({
        feature: f.feature,
        guild_count: f.guild_count,
        pct: data.adoption?.total_guilds
          ? ((f.guild_count / data.adoption.total_guilds) * 100).toFixed(1)
          : "0",
      }));
    case "retention_summary":
      return {
        active_guilds_30d: data.retention?.active_guilds_30d ?? 0,
        churned_guilds_30d: data.retention?.churned_guilds_30d ?? 0,
      };
    case "recently_churned":
      return data.retention?.recently_churned ?? [];
    case "config_patterns":
      return data.config?.patterns ?? [];
    default:
      return null;
  }
}

export function buildAdminPayload(
  selectedIds: string[],
  data: AdminExportData,
): Record<string, unknown> {
  const meta = buildAdminMeta();
  const sections: Record<string, unknown> = {};

  for (const id of selectedIds) {
    sections[id] = buildSectionPayload(id, data);
  }

  return { ...meta, sections };
}

export function buildAdminCsv(selectedIds: string[], data: AdminExportData): string {
  const parts: string[] = [];

  for (const id of selectedIds) {
    switch (id) {
      case "usage_metrics":
        appendCsvSection(
          parts,
          "Usage KPIs",
          ["Metric", "Value"],
          [
            ["Tickets Today", data.usage?.metrics.tickets_created_today ?? 0],
            ["Active Guilds (24h)", data.usage?.metrics.active_guilds_daily ?? 0],
            ["Active Guilds (7d)", data.usage?.metrics.active_guilds_weekly ?? 0],
            ["Active Guilds (30d)", data.usage?.metrics.active_guilds_monthly ?? 0],
            ["Total Guilds", data.usage?.metrics.total_guilds ?? 0],
          ],
        );
        break;
      case "global_ticket_volume":
        appendCsvSection(
          parts,
          "Global Ticket Volume (90 days)",
          ["Date", "Count"],
          (data.usage?.tickets_per_day ?? []).map((d) => [d.date, d.count]),
        );
        break;
      case "feature_adoption":
        appendCsvSection(
          parts,
          "Feature Adoption",
          ["Feature", "Guild Count", "Percentage"],
          (data.adoption?.features ?? []).map((f) => [
            f.feature,
            f.guild_count,
            data.adoption?.total_guilds
              ? `${((f.guild_count / data.adoption.total_guilds) * 100).toFixed(0)}%`
              : "0%",
          ]),
        );
        break;
      case "retention_summary":
        appendCsvSection(
          parts,
          "Retention Summary",
          ["Metric", "Count"],
          [
            ["Active Guilds (30d)", data.retention?.active_guilds_30d ?? 0],
            ["Churned Guilds (30d)", data.retention?.churned_guilds_30d ?? 0],
          ],
        );
        break;
      case "recently_churned":
        appendCsvSection(
          parts,
          "Recently Churned Guilds",
          ["Guild ID", "Last Ticket Time"],
          (data.retention?.recently_churned ?? []).map((g) => [
            g.guild_id,
            new Date(g.last_ticket_time).toISOString(),
          ]),
        );
        break;
      case "config_patterns":
        appendCsvSection(
          parts,
          "Configuration Patterns",
          ["Setting", "Value", "Guilds"],
          (data.config?.patterns ?? []).map((p) => [p.setting, p.value, p.count]),
        );
        break;
    }
  }

  return parts.join("\r\n");
}
