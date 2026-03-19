import type { CellValue } from "../types/sourceWorkbook";

/** Stable hash of a row's cell values for deduplication */
export function rowFingerprint(cells: Record<string, CellValue>): string {
  const normalized = Object.keys(cells)
    .sort()
    .map((k) => `${k}=${String(cells[k] ?? "")}`)
    .join("|");
  return simpleHash(normalized);
}

function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  return h.toString(16).padStart(8, "0");
}

/** Create a stable idempotency key from multiple parts */
export function idempotencyKey(...parts: string[]): string {
  return simpleHash(parts.join(":"));
}
