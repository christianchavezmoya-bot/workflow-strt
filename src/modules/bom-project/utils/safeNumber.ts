/** Parse a cell value to a finite number, or undefined if not parseable */
export function safeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[,$\s]/g, ""));
  return isFinite(n) ? n : undefined;
}

/** Round to a given number of decimal places */
export function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
