export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const SOURCE_LABELS: Record<number, string> = {
  0: "Unknown",
  1: "Panel",
  2: "Command",
};

export const SOURCE_COLOURS: Record<number, string> = {
  0: "#6B7280",
  1: "#3B82F6",
  2: "#10B981",
};

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "No data";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function formatDurationAxis(seconds: number): string {
  if (seconds <= 0) return "0";
  if (seconds < 60) return `${seconds < 10 ? Math.round(seconds * 10) / 10 : Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = seconds / 60;
    return `${mins < 10 ? Math.round(mins * 10) / 10 : Math.round(mins)}m`;
  }
  const hours = seconds / 3600;
  return `${hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)}h`;
}

export function pickWindow(
  tw: { all_time: number | null; monthly: number | null; weekly: number | null } | undefined,
  days: number,
): number | null {
  if (!tw) return null;
  if (days === 0) return tw.all_time;
  if (days <= 7) return tw.weekly;
  if (days <= 30) return tw.monthly;
  return tw.all_time;
}

/** Picks the first non-zero window for staff detail summary stats. */
export function pickPreferredResponseWindow(
  tw: { all_time: number | null; monthly: number | null; weekly: number | null } | undefined,
): number | null {
  if (!tw) return null;
  if (tw.weekly !== null && tw.weekly > 0) return tw.weekly;
  if (tw.monthly !== null && tw.monthly > 0) return tw.monthly;
  return tw.all_time;
}

export function windowLabel(days: number): string {
  if (days === 0) return "All time";
  if (days <= 7) return "Past 7 days";
  if (days <= 30) return "Past 30 days";
  if (days <= 90) return "Past 90 days";
  if (days <= 365) return "Past year";
  return "All time";
}

/**
 * Returns the `selected` field when present, falling back to `pickWindow` for
 * older API responses that lack it.
 *
 * Must check `!== undefined`, not use `??`. A genuine `null` means "no data in
 * this window" and must not be silently replaced with an all-time figure. That
 * is precisely the bug this function exists to fix.
 */
/**
 * The average for exactly the selected range.
 *
 * Do not rewrite the `!== undefined` test as `??`. A genuine null means "no
 * data in this window" and must stay null; `??` would replace it with the
 * all-time average via pickWindow, presenting a whole-history figure under a
 * "Past 7 days" label. That is the precise bug this field was added to fix.
 *
 * The pickWindow fallback exists only for the case where the field is absent
 * altogether, which happens against an API that predates it.
 */
export function selectedWindow(
  tw:
    | {
        all_time: number | null;
        monthly: number | null;
        weekly: number | null;
        selected?: number | null;
      }
    | undefined,
  days: number,
): number | null {
  if (!tw) return null;
  if (tw.selected !== undefined) return tw.selected;
  return pickWindow(tw, days);
}

/**
 * Like `formatDuration` but distinguishes "no measurement" (null) from
 * "instant" (0). A single low-volume panel makes 0-second averages far more
 * likely to surface.
 */
export function formatDurationOrDash(seconds: number | null): string {
  if (seconds === null) return "No data";
  if (seconds === 0) return "0s";
  return formatDuration(seconds);
}

export function exportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
