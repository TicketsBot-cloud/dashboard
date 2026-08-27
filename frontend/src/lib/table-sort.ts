export type SortDir = "asc" | "desc";

export type SortValue = number | string | boolean | Date | null | undefined;

/** Owns its direction, so null-handling survives a direction flip. */
export type Comparator<T> = (a: T, b: T, dir: SortDir) => number;

export interface SortColumn<T> {
  /** Value to order by. Null/undefined always sorts last, in both directions. */
  value?: (row: T) => SortValue;
  /** Full comparator; overrides `value`. The hook does not negate its result. */
  compare?: Comparator<T>;
  /** Direction applied the first time this key is selected. Default "desc". */
  defaultDir?: SortDir;
}

// Reused instance: constructing a collator per comparison is orders of magnitude slower.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareValues(a: SortValue, b: SortValue, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const base =
    typeof a === "string" && typeof b === "string" ? collator.compare(a, b) : Number(a) - Number(b);

  // A NaN comparator result scrambles the array silently rather than throwing.
  if (Number.isNaN(base)) return 0;

  return dir === "asc" ? base : -base;
}

export function toTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

export function sortRows<T, K extends string>(
  rows: T[],
  columns: Record<K, SortColumn<T>>,
  key: K,
  dir: SortDir,
  pinLast?: (row: T) => boolean,
): T[] {
  const column = columns[key];
  if (!column) return rows;

  const compare: Comparator<T> =
    column.compare ?? ((a, b, d) => compareValues(column.value?.(a), column.value?.(b), d));

  if (!pinLast) return [...rows].sort((a, b) => compare(a, b, dir));

  const main: T[] = [];
  const pinned: T[] = [];
  for (const row of rows) (pinLast(row) ? pinned : main).push(row);

  return [...main.sort((a, b) => compare(a, b, dir)), ...pinned];
}
