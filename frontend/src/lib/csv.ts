export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\r\n");
}

export function appendCsvSection(
  parts: string[],
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  if (parts.length > 0) parts.push("");
  parts.push(`# ${title}`);
  parts.push(rowsToCsv(headers, rows));
}
