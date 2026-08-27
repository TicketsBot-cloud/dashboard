/** API datetime-local format (matches Go `DateTimeLocal`). */
const API_DATETIME_FORMAT_LEN = 16;

export function parseEmbedTimestamp(value?: string | boolean | null): Date | null {
  if (!value || typeof value === "boolean") return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Serialize for API PATCH/POST bodies (`2006-01-02T15:04`). */
export function serializeEmbedTimestamp(date: Date | null): string | undefined {
  if (!date) return undefined;

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, API_DATETIME_FORMAT_LEN);
}

/** Normalize any stored timestamp (API string, ISO, legacy boolean) for the API. */
export function normalizeEmbedTimestampForApi(value?: string | boolean | null): string | undefined {
  return serializeEmbedTimestamp(parseEmbedTimestamp(value));
}

export function formatEmbedTimestampForDisplay(value?: string | boolean | null): string {
  const date = parseEmbedTimestamp(value);
  if (!date) return "";
  return date.toLocaleString();
}
