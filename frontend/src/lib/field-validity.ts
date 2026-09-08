// Keep each class a whole literal: Tailwind v4 scans this file as text.
export const MISSING_FIELD_CLASS = "border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.35)]";
export const FAULT_FIELD_CLASS = "border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.45)]";
export const IDLE_FIELD_CLASS = "border-neutral-600";
// Select-likes have no focus-within target.
export const IDLE_INPUT_CLASS = "border-neutral-600 focus-within:border-blue-500";

export function isBlank(value: string | string[] | null | undefined): boolean {
  if (value == null) return true;
  return typeof value === "string" ? value.trim().length === 0 : value.length === 0;
}
