import { toast } from "sonner";
import { downloadExportFile } from "@/lib/download";
import type { ExportFormat } from "./types";

interface RunAnalyticsExportOptions {
  buildCsv: () => string;
  buildPayload: () => Record<string, unknown>;
  successMessage?: string;
  onComplete?: () => void;
}

export function runAnalyticsExport(
  filename: string,
  format: ExportFormat,
  options: RunAnalyticsExportOptions,
): void {
  const { buildCsv, buildPayload, successMessage = "Analytics exported.", onComplete } = options;

  if (format === "json") {
    downloadExportFile(filename, JSON.stringify(buildPayload(), null, 2), format);
  } else {
    downloadExportFile(filename, buildCsv(), format);
  }

  toast.success(successMessage);
  onComplete?.();
}
