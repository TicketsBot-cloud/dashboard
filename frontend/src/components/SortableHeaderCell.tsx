import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSort, faSortUp, faSortDown } from "@fortawesome/free-solid-svg-icons";
import Table, { useHeaderCellClass } from "@/components/Table";
import type { SortState } from "@/hooks/useTableSort";

interface SortTriggerProps<K extends string> {
  sort: SortState<K>;
  sortKey: K;
  label: string;
  align?: "left" | "right";
  /** Inherit the surrounding header's typography instead of the table default. */
  inheritText?: boolean;
  className?: string;
}

/** The clickable part on its own, for header cells that also host a filter control. */
export function SortTrigger<K extends string>({
  sort,
  sortKey,
  label,
  align = "left",
  inheritText = false,
  className = "",
}: SortTriggerProps<K>) {
  const isActive = sort.sortKey === sortKey;
  const next = sort.nextDir(sortKey) === "asc" ? "ascending" : "descending";

  return (
    <button
      type="button"
      onClick={() => sort.toggleSort(sortKey)}
      className={`group inline-flex items-center gap-1.5 transition-colors
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500
                 ${inheritText ? "" : "w-full text-xs font-medium uppercase tracking-wide"}
                 ${align === "right" ? "justify-end" : "justify-start"}
                 ${isActive ? "text-white" : "text-gray-400 hover:text-white"} ${className}`}
    >
      <span>{label}</span>
      <FontAwesomeIcon
        icon={isActive ? (sort.sortDir === "asc" ? faSortUp : faSortDown) : faSort}
        className={`h-3 w-3 shrink-0 ${isActive ? "text-blue-400" : "text-gray-400 group-hover:text-gray-300"}`}
        aria-hidden="true"
      />
      <span className="sr-only">
        {isActive
          ? `, sorted ${sort.sortDir === "asc" ? "ascending" : "descending"}, activate to sort ${next}`
          : `, activate to sort ${next}`}
      </span>
    </button>
  );
}

export function ariaSortFor<K extends string>(sort: SortState<K>, sortKey: K) {
  if (sort.sortKey !== sortKey) return "none" as const;
  return sort.sortDir === "asc" ? ("ascending" as const) : ("descending" as const);
}

interface SortableHeaderCellProps<K extends string> {
  sort: SortState<K>;
  sortKey: K;
  label: string;
  align?: "left" | "right";
  /** Extra classes, merged with the table variant's default padding. */
  className?: string;
}

// Declared as a generic function rather than `FC<Props>`, which cannot carry a type parameter.
export default function SortableHeaderCell<K extends string>({
  sort,
  sortKey,
  label,
  align = "left",
  className = "",
}: SortableHeaderCellProps<K>) {
  const thClass = useHeaderCellClass();

  return (
    <Table.HeaderCell aria-sort={ariaSortFor(sort, sortKey)} className={`${thClass} ${className}`}>
      <SortTrigger sort={sort} sortKey={sortKey} label={label} align={align} />
    </Table.HeaderCell>
  );
}
