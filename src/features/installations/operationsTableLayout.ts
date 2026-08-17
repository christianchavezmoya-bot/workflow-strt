export const OPERATIONS_ROW_HEIGHT = 52;
/** Web operations table: virtualize at this row count (paginated pages are typically 50). */
export const OPERATIONS_VIRTUALIZE_MIN_ROWS = 20;

export const OPERATIONS_CHECKBOX_W = 28;
export const OPERATIONS_EXPAND_W = 36;
export const OPERATIONS_TAG_STICKY_LEFT = OPERATIONS_CHECKBOX_W + OPERATIONS_EXPAND_W;

export function shouldVirtualizeOperationsTable(
  paginatedWebProject: boolean,
  displayAssetCount: number,
): boolean {
  return paginatedWebProject && displayAssetCount >= OPERATIONS_VIRTUALIZE_MIN_ROWS;
}
