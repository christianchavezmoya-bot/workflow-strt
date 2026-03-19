/**
 * workbookParser.ts
 * Reads an uploaded .xlsx / .csv file using the `xlsx` library (already in package.json)
 * and produces a ParsedWorkbook + flat RawWorkbookRows for a given import run.
 */
import * as XLSX from "xlsx";
import type { CellValue, ParsedWorkbook, RawWorkbookRow } from "../types/sourceWorkbook";
import { buildSheetDescriptor, rowsFromSheet, detectHeaderRow } from "../utils/sheetHelpers";
import { rowFingerprint } from "../utils/rowFingerprint";

/** Read a File object and return a full ParsedWorkbook descriptor */
export async function parseWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheets = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
      header: 1,
      defval: null,
      raw: false,
    }) as CellValue[][];
    return buildSheetDescriptor(name, data);
  });

  return { fileName: file.name, sheets };
}

/** Extract RawWorkbookRows from a File for the given sheet names */
export async function extractRawRows(
  file: File,
  importRunId: string,
  selectedSheets: string[]
): Promise<RawWorkbookRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });

  const result: RawWorkbookRow[] = [];

  for (const sheetName of selectedSheets) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const data = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
      header: 1,
      defval: null,
      raw: false,
    }) as CellValue[][];

    const headerIdx = detectHeaderRow(data);
    const rows = rowsFromSheet(data, headerIdx);

    rows.forEach((cells, relIdx) => {
      const rowIndex = headerIdx + 1 + relIdx + 1; // 1-based spreadsheet row
      result.push({
        id: `${importRunId}:${sheetName}:${rowIndex}`,
        importRunId,
        sheetName,
        rowIndex,
        cells,
        rowHash: rowFingerprint(cells),
      });
    });
  }

  return result;
}
