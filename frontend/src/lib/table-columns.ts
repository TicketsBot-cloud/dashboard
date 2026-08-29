export type ColumnBreakpoint = "sm" | "md" | "lg";

export interface ResponsiveColumn<K extends string = string, S extends string = string> {
  key: K;
  label: string;
  breakpoint?: ColumnBreakpoint;
  sortKey?: S;
}

// Ordered never-visible to always-visible; `widestFallbackClass` ranks by index.
const FALLBACK_ORDER = ["hidden", "sm:hidden", "md:hidden", "lg:hidden", ""] as const;

export type FallbackClass = (typeof FALLBACK_ORDER)[number];

// Written out in full: Tailwind scans raw source text, so an interpolated breakpoint emits nothing.
const CELL_CLASS: Record<ColumnBreakpoint, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

const FALLBACK_BY_BREAKPOINT: Record<ColumnBreakpoint, FallbackClass> = {
  sm: "sm:hidden",
  md: "md:hidden",
  lg: "lg:hidden",
};

export function cellClass(breakpoint?: ColumnBreakpoint): string {
  return breakpoint ? CELL_CLASS[breakpoint] : "";
}

/** Inverse of `cellClass`. `rendered: false` = column switched off, so its stand-in shows at every
 * width. "hidden" = header always reachable; callers skip those rather than mount a duplicate. */
export function fallbackClass(
  breakpoint: ColumnBreakpoint | undefined,
  rendered: boolean,
): FallbackClass {
  if (!rendered) return "";
  return breakpoint ? FALLBACK_BY_BREAKPOINT[breakpoint] : "hidden";
}

/** The class a wrapper needs so it is present whenever at least one of its children is. */
export function widestFallbackClass(classes: readonly FallbackClass[]): FallbackClass {
  let widest: FallbackClass = "hidden";
  for (const candidate of classes) {
    if (FALLBACK_ORDER.indexOf(candidate) > FALLBACK_ORDER.indexOf(widest)) widest = candidate;
  }
  return widest;
}
