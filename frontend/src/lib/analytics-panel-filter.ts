/**
 * Canonical form for the panel filter URL parameter and React Query cache key.
 *
 * Sorted numerically, deduped, `none` last, empty meaning all panels.
 * `["5","1","1","none"]` and `["none","1","5"]` both serialise to `"1,5,none"`,
 * so the URL param, the query key and the request param all derive from one
 * string and cannot drift.
 */

const NONE_TOKEN = "none";

/** Parse a raw `panels` search param into a canonical string. */
export function parsePanelParam(raw: string | null): string {
  if (!raw || raw.trim() === "") return "";
  return canonicalise(raw.split(","));
}

/** Build a canonical string from an array of panel keys. */
export function canonicalise(keys: string[]): string {
  let hasNone = false;
  const ids: number[] = [];

  for (const k of keys) {
    const trimmed = k.trim();
    if (trimmed === "") continue;
    if (trimmed.toLowerCase() === NONE_TOKEN) {
      hasNone = true;
      continue;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n) && n > 0 && !ids.includes(n)) {
      ids.push(n);
    }
  }

  ids.sort((a, b) => a - b);
  const parts = ids.map(String);
  if (hasNone) parts.push(NONE_TOKEN);
  return parts.join(",");
}

/** Build a query-string value for the API request. Empty string means all. */
export function panelQueryParam(canonical: string): string {
  return canonical;
}

/** Split a canonical string back into individual keys. */
export function splitCanonical(canonical: string): string[] {
  if (canonical === "") return [];
  return canonical.split(",");
}

/** Count the number of selected panels (including "none" if present). */
export function selectionCount(canonical: string): number {
  if (canonical === "") return 0;
  return canonical.split(",").length;
}

/** Whether the "none" (no panel) option is selected. */
export function includesNone(canonical: string): boolean {
  return canonical.split(",").includes(NONE_TOKEN);
}

/** Build a canonical string from numeric IDs and a "none" flag. */
export function buildCanonical(panelIds: number[], includeNone: boolean): string {
  const sorted = [...new Set(panelIds)].sort((a, b) => a - b);
  const parts = sorted.map(String);
  if (includeNone) parts.push(NONE_TOKEN);
  return parts.join(",");
}

/** Toggle a single panel key in a canonical string. */
export function togglePanel(canonical: string, key: string): string {
  const keys = splitCanonical(canonical);
  const idx = keys.indexOf(key);
  if (idx >= 0) {
    keys.splice(idx, 1);
  } else {
    keys.push(key);
  }
  return canonicalise(keys);
}

/** Replace the selection with a single panel. */
export function selectOnly(key: string): string {
  return canonicalise([key]);
}

/** Replace the selection with a set of panel IDs. */
export function selectPanelIds(panelIds: number[]): string {
  return buildCanonical(panelIds, false);
}
