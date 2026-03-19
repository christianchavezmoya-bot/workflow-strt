import type { CellValue, WorkbookSheet } from "../types/sourceWorkbook";

/** Find the most likely header row in a 2D cell array */
export function detectHeaderRow(rows: CellValue[][]): number {
  // Heuristic: the header row is the first row where most cells are non-empty strings
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    const stringCells = row.filter(
      (c) => typeof c === "string" && c.trim().length > 0
    );
    if (stringCells.length >= Math.floor(row.length * 0.5)) {
      return i;
    }
  }
  return 0;
}

/** Convert a sheet 2D array + header index into a list of keyed row objects */
export function rowsFromSheet(
  data: CellValue[][],
  headerRowIndex: number
): Array<Record<string, CellValue>> {
  const headers = (data[headerRowIndex] ?? []).map((h) =>
    String(h ?? "").trim()
  );
  return data
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((c) => c !== null && c !== ""))
    .map((row) => {
      const obj: Record<string, CellValue> = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = row[i] ?? null;
      });
      return obj;
    });
}

/** Sample up to N rows from a sheet (for preview) */
export function sampleRows(
  rows: Array<Record<string, CellValue>>,
  n = 5
): Array<Record<string, CellValue>> {
  return rows.slice(0, n);
}

/** Build a WorkbookSheet descriptor from raw 2D data */
export function buildSheetDescriptor(
  name: string,
  data: CellValue[][]
): WorkbookSheet {
  const headerIdx = detectHeaderRow(data);
  const headers = (data[headerIdx] ?? [])
    .map((h) => String(h ?? "").trim())
    .filter(Boolean);
  const rows = rowsFromSheet(data, headerIdx);
  return {
    name,
    rowCount: rows.length,
    headers,
    sampleRows: sampleRows(rows),
  };
}
