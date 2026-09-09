import type { ReactNode } from "react";
import Collapsible from "@/components/Collapsible";
import { SortTrigger } from "@/components/SortableHeaderCell";
import {
  fallbackClass,
  widestFallbackClass,
  type FallbackClass,
  type ResponsiveColumn,
} from "@/lib/table-columns";
import type { SortState } from "@/hooks/useTableSort";

interface HiddenColumnControlsProps<K extends string, S extends string> {
  columns: readonly ResponsiveColumn<K, S>[];
  selectedColumns: readonly string[];
  sort?: SortState<S>;
  renderFilter?: (column: ResponsiveColumn<K, S>) => ReactNode;
  activeFilterCount?: number;
  title?: string;
  defaultOpen?: boolean;
}

const CHIP_CLASS = "rounded-full border-2 px-2.5 py-1 text-xs font-medium whitespace-nowrap";

/**
 * Surfaces the filter and sort controls whose table header is out of reach. Each entry carries its
 * own visibility class, so a header copy and this copy are never both in the accessibility tree.
 */
export default function HiddenColumnControls<K extends string, S extends string>({
  columns,
  selectedColumns,
  sort,
  renderFilter,
  activeFilterCount = 0,
  title = "Filters & sorting",
  defaultOpen = false,
}: HiddenColumnControlsProps<K, S>) {
  const visibilityFor = (column: ResponsiveColumn<K, S>) =>
    fallbackClass(column.breakpoint, selectedColumns.includes(column.key));

  const filterEntries: { key: K; className: FallbackClass; body: ReactNode }[] = [];
  if (renderFilter) {
    for (const column of columns) {
      const className = visibilityFor(column);
      if (className === "hidden") continue;
      const body = renderFilter(column);
      if (body == null) continue;
      filterEntries.push({ key: column.key, className, body });
    }
  }

  const sortEntries: { key: S; label: string; className: FallbackClass }[] = [];
  if (sort) {
    for (const column of columns) {
      if (!column.sortKey) continue;
      const reachable = selectedColumns.includes(column.key) || column.sortKey !== sort.sortKey;
      const className = fallbackClass(column.breakpoint, reachable);
      if (className === "hidden") continue;
      sortEntries.push({ key: column.sortKey, label: column.label, className });
    }
  }

  const sortSectionClass = widestFallbackClass(sortEntries.map((entry) => entry.className));
  const panelClass = widestFallbackClass([
    ...filterEntries.map((entry) => entry.className),
    sortSectionClass,
  ]);

  if (panelClass === "hidden") return null;

  const activeSortColumn = sort
    ? columns.find((column) => column.sortKey === sort.sortKey)
    : undefined;

  const subtitle =
    [
      activeSortColumn && sort
        ? `sorted by ${activeSortColumn.label} ${sort.sortDir === "asc" ? "ascending" : "descending"}`
        : null,
      activeFilterCount > 0
        ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <div className={panelClass}>
      <Collapsible title={title} subtitle={subtitle} defaultOpen={defaultOpen}>
        <div className="flex flex-col gap-4">
          {sort && sortEntries.length > 0 && (
            <div className={sortSectionClass}>
              <span className="mb-2 block text-sm font-medium text-white">Sort by</span>
              <div className="flex flex-wrap gap-1.5">
                {sortEntries.map((entry) => (
                  <span key={entry.key} className={entry.className}>
                    <SortTrigger
                      sort={sort}
                      sortKey={entry.key}
                      label={entry.label}
                      inheritText
                      className={`${CHIP_CLASS} ${
                        sort.sortKey === entry.key
                          ? "border-blue-500 bg-blue-500/20"
                          : "border-transparent bg-gray-600/50 opacity-60 hover:opacity-100"
                      }`}
                    />
                  </span>
                ))}
              </div>
            </div>
          )}
          {filterEntries.map((entry) => (
            <div key={entry.key} className={entry.className}>
              {entry.body}
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}
