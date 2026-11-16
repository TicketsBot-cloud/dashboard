export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  downloadBlob(filename, new Blob([content], { type: mimeType }));
}

export function downloadExportFile(
  filename: string,
  content: string,
  format: "csv" | "json",
): void {
  const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
  downloadTextFile(filename, content, mimeType);
}
