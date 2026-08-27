import type { GuildPermissionLevel } from "@/types";

/**
 * Short labels for `permission.PermissionLevel` (sidebar, server cards).
 * Levels 0 and 2 have fixed labels; level 1 depends on permission source.
 */
const GUILD_PERMISSION_LEVEL_LABELS: Record<GuildPermissionLevel, string> = {
  0: "No access",
  1: "Support Rep",
  2: "Bot Admin",
};

/** Longer descriptions for tooltips and screen readers. */
const GUILD_PERMISSION_LEVEL_DESCRIPTIONS: Record<GuildPermissionLevel, string> = {
  0: "No dashboard access for this server",
  1: "Overview, tickets, transcripts, analytics, and blacklist",
  2: "Settings, panels, forms, staff teams, and all ticket pages",
};

function isGuildPermissionLevel(level: number): level is GuildPermissionLevel {
  return level === 0 || level === 1 || level === 2;
}

/**
 * Returns a short permission label. For level 1, the label depends on the
 * permission source: staff_team / support_role / team_role resolve to
 * "Staff Team", everything else falls back to "Support Rep".
 */
export function getGuildPermissionLevelLabel(level: number, source?: string): string {
  if (!isGuildPermissionLevel(level)) {
    return "Unknown";
  }

  if (level === 1) {
    if (source === "staff_team" || source === "support_role" || source === "team_role") {
      return "Staff Team";
    }
    return "Support Rep";
  }

  return GUILD_PERMISSION_LEVEL_LABELS[level];
}

export function getGuildPermissionLevelDescription(level: number): string {
  if (!isGuildPermissionLevel(level)) {
    return "Unknown permission level";
  }

  return GUILD_PERMISSION_LEVEL_DESCRIPTIONS[level];
}
