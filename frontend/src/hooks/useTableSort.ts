import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { sortRows, type SortColumn, type SortDir } from "@/lib/table-sort";
import { usePreferencesStore } from "@/stores/preferences";

export type SortableColumns<K extends string> = Record<K, { defaultDir?: SortDir }>;

export interface UseSortStateOptions<K extends string> {
  /**
   * Sort used when the URL carries no valid sort. Defaults to the first declared column, descending.
   * `NoInfer` keeps `K` coming from `columns`, not from this one key.
   */
  initialSort?: { key: NoInfer<K>; dir: SortDir };
  /** Write `sort`/`dir` to the URL. Default false. */
  syncToUrl?: boolean;
  /** Namespaces the params for routes with more than one synced table, e.g. "ent_". */
  paramPrefix?: string;
  /** Remembers the chosen sort under this id in `ui-prefs`. */
  persistKey?: string;
}

export interface UseTableSortOptions<T, K extends string> extends UseSortStateOptions<K> {
  /** Rows matching this stay at the bottom, unsorted, regardless of key or direction. */
  pinLast?: (row: T) => boolean;
}

/** The subset a header cell needs. */
export interface SortState<K extends string> {
  sortKey: K;
  sortDir: SortDir;
  toggleSort: (key: K) => void;
  /** Direction a click on `key` would produce, for the screen-reader hint. */
  nextDir: (key: K) => SortDir;
}

export interface SortStateWithSetter<K extends string> extends SortState<K> {
  /** Direct set, for controls that are not column headers. Omit `dir` for the column default. */
  setSort: (key: K, dir?: SortDir) => void;
}

export interface TableSort<T, K extends string> extends SortStateWithSetter<K> {
  sortedRows: T[];
}

/**
 * Sort key and direction, with optional URL and `ui-prefs` persistence. Use this directly when the
 * rows are ordered elsewhere (a server-paginated table); `useTableSort` adds in-memory sorting.
 */
export function useSortState<K extends string>(
  columns: SortableColumns<K>,
  options: UseSortStateOptions<K> = {},
): SortStateWithSetter<K> {
  const { initialSort, syncToUrl = false, paramPrefix = "", persistKey } = options;

  const storedSort = usePreferencesStore((s) => (persistKey ? s.tableSort[persistKey] : undefined));
  const setTableSort = usePreferencesStore((s) => s.setTableSort);

  const defaultSort = useMemo(
    () => initialSort ?? { key: Object.keys(columns)[0] as K, dir: "desc" as SortDir },
    // Only the first render's default matters; later changes must not reset the user's sort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const sortParam = `${paramPrefix}sort`;
  const dirParam = `${paramPrefix}dir`;

  const [searchParams, setSearchParams] = useSearchParams();

  // URL beats the stored preference so shared links show what the sender saw. An unrecognised
  // name still counts as an opinion and falls to `initialSort`, where callers map legacy formats.
  const [sort, setSortState] = useState<{ key: K; dir: SortDir }>(() => {
    const urlKey = syncToUrl ? searchParams.get(sortParam) : null;
    if (urlKey) {
      if (!(urlKey in columns)) return defaultSort;
      const dir = searchParams.get(dirParam);
      return { key: urlKey as K, dir: dir === "asc" || dir === "desc" ? dir : defaultSort.dir };
    }
    if (storedSort && storedSort.key in columns) {
      return { key: storedSort.key as K, dir: storedSort.dir };
    }
    return defaultSort;
  });

  const urlValue = `${searchParams.get(sortParam) ?? ""}|${searchParams.get(dirParam) ?? ""}`;
  const lastWrittenSort = useRef(urlValue);

  useEffect(() => {
    if (!syncToUrl) return;
    if (urlValue === lastWrittenSort.current) return;
    lastWrittenSort.current = urlValue;

    const [key, dir] = urlValue.split("|");
    if (key && key in columns) {
      setSortState({ key: key as K, dir: dir === "asc" || dir === "desc" ? dir : defaultSort.dir });
    } else if (key) {
      setSortState(defaultSort);
    } else if (storedSort && storedSort.key in columns) {
      setSortState({ key: storedSort.key as K, dir: storedSort.dir });
    } else {
      setSortState(defaultSort);
    }
  }, [syncToUrl, urlValue, columns, defaultSort, storedSort]);

  useEffect(() => {
    if (!syncToUrl) return;
    const isDefault = sort.key === defaultSort.key && sort.dir === defaultSort.dir;
    lastWrittenSort.current = isDefault ? "|" : `${sort.key}|${sort.dir}`;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (isDefault) {
          next.delete(sortParam);
          next.delete(dirParam);
        } else {
          next.set(sortParam, sort.key);
          next.set(dirParam, sort.dir);
        }
        return next;
      },
      { replace: true },
    );
  }, [syncToUrl, sort, defaultSort, sortParam, dirParam, setSearchParams]);

  const nextDir = useCallback(
    (key: K): SortDir => {
      if (sort.key === key) return sort.dir === "asc" ? "desc" : "asc";
      return columns[key]?.defaultDir ?? "desc";
    },
    [sort, columns],
  );

  // Persisting here rather than in an effect keeps deep links from overwriting a saved choice.
  const applySort = useCallback(
    (next: { key: K; dir: SortDir }) => {
      setSortState(next);
      if (persistKey) setTableSort(persistKey, next);
    },
    [persistKey, setTableSort],
  );

  const toggleSort = useCallback(
    (key: K) => applySort({ key, dir: nextDir(key) }),
    [applySort, nextDir],
  );

  const setSort = useCallback(
    (key: K, dir?: SortDir) => applySort({ key, dir: dir ?? columns[key]?.defaultDir ?? "desc" }),
    [applySort, columns],
  );

  return { sortKey: sort.key, sortDir: sort.dir, toggleSort, nextDir, setSort };
}

export function useTableSort<T, K extends string>(
  rows: T[],
  columns: Record<K, SortColumn<T>>,
  options: UseTableSortOptions<T, K> = {},
): TableSort<T, K> {
  const { pinLast, ...stateOptions } = options;
  const sort = useSortState(columns, stateOptions);

  const sortedRows = useMemo(
    () => sortRows(rows, columns, sort.sortKey, sort.sortDir, pinLast),
    [rows, columns, sort.sortKey, sort.sortDir, pinLast],
  );

  return { ...sort, sortedRows };
}
