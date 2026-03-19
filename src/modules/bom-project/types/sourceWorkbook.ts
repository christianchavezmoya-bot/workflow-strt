/** Raw cell value from the workbook */
export type CellValue = string | number | boolean | null;

/** A single raw row as extracted from the spreadsheet */
export interface RawWorkbookRow {
  /** Stable ID = importRunId + sheetName + rowIndex */
  id: string;
  importRunId: string;
  sheetName: string;
  rowIndex: number;           // 1-based, matching spreadsheet row
  /** Raw key→value map using header names as keys */
  cells: Record<string, CellValue>;
  /** Fingerprint hash of the row content for deduplication */
  rowHash: string;
}

/** A workbook sheet descriptor */
export interface WorkbookSheet {
  name: string;
  rowCount: number;
  headers: string[];
  sampleRows: Array<Record<string, CellValue>>;
}

/** Parsed workbook descriptor */
export interface ParsedWorkbook {
  fileName: string;
  sheets: WorkbookSheet[];
}

/** Column mapping entry: source column → canonical field */
export interface ColumnMappingEntry {
  sourceColumn: string;
  canonicalField: string;   // key from CanonicalBomRow, or "" to ignore
  transform?: "string" | "number" | "trim" | "uppercase" | "lowercase";
}

/** A saved mapping profile the user can reuse across imports */
export interface MappingProfile {
  id: string;
  name: string;
  mappings: ColumnMappingEntry[];
  createdAt: string;
  updatedAt: string;
}
