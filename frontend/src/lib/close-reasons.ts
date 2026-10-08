import type { PanelCloseReasons } from "@/types";

export const DEFAULT_CLOSE_REASONS: PanelCloseReasons = { reasons: [], allow_custom: true };

export const CLOSE_REASON_NOT_PREDEFINED =
  "Close reason must be one of the panel's predefined close reasons";

export function matchCloseReason(presets: readonly string[], reason: string): string | undefined {
  const needle = reason.trim().toLowerCase();
  return presets.find((preset) => preset.toLowerCase() === needle);
}

export function resolveCloseReason(
  closeReasons: PanelCloseReasons | undefined,
  reason: string,
): { reason: string; allowed: boolean } {
  if (!reason.trim() || !closeReasons?.reasons.length) return { reason, allowed: true };

  const preset = matchCloseReason(closeReasons.reasons, reason);
  if (preset !== undefined) return { reason: preset, allowed: true };

  return { reason, allowed: closeReasons.allow_custom };
}

export function findDuplicateCloseReasons(reasons: readonly string[]): Set<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  reasons.forEach((reason, i) => {
    const key = reason.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) duplicates.add(i);
    else seen.add(key);
  });
  return duplicates;
}
