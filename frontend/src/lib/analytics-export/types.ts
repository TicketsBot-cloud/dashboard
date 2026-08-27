export interface ExportSection {
  id: string;
  label: string;
  description?: string;
}

export type ExportFormat = "csv" | "json";

export const EXPORT_FORMATS: ExportFormat[] = ["csv", "json"];

export interface ExportMeta {
  exported_at: string;
  [key: string]: string | number | null | undefined;
}
