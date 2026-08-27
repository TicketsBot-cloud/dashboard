/** Returns true if query is empty or any field contains the query (case-insensitive). */
export function matchesSearch(
  query: string,
  ...fields: Array<string | number | null | undefined>
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return fields.some((field) => field != null && String(field).toLowerCase().includes(trimmed));
}
