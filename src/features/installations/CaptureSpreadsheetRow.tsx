import React from "react";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { Checkbox, Chip, IconButton, Stack, TableCell, TableRow, Tooltip, Typography } from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import type { ProjectCaptureGroup, ProjectCaptureRow } from "../../utils/projectCaptureTable";
import { STATUS_COLORS, STATUS_LABELS } from "./assetStatusDisplay";
import CaptureEditableCell from "./CaptureEditableCell";
import CaptureReadOnlyCell from "./CaptureReadOnlyCell";
import type { CaptureSpreadsheetAssetJobColumn } from "./captureSpreadsheetTableLayout";
import {
  ASSET_JOB_COL_W,
  ASSET_JOB_PALETTE,
  ACTIONS_W,
  CHECKBOX_W,
  HEADER_Z,
  STATIC_HEADER_BORDER,
  STATUS_W,
  TAG_W,
  bodyCellHoverSx,
  stickyCell,
} from "./captureSpreadsheetTableLayout";
import type { ProjectCaptureColumn } from "../../utils/projectCaptureTable";

export type CaptureSpreadsheetRowProps = {
  asset: ProjectAsset;
  capture: ProjectCaptureRow;
  rowIndex: number;
  orderedGroups: ProjectCaptureGroup[];
  assetJobColumns: CaptureSpreadsheetAssetJobColumn[];
  mergedCells: Record<string, string>;
  selectionEnabled: boolean;
  isSelected: boolean;
  onToggleAssetSelection?: (assetId: string, checked: boolean) => void;
  editableForColumn: (asset: ProjectAsset, column: ProjectCaptureColumn) => boolean;
  onSaveCell: (asset: ProjectAsset, column: ProjectCaptureColumn, value: string) => Promise<void>;
  onPatchCell: (assetId: string, columnId: string, value: string) => void;
  renderStatus?: (asset: ProjectAsset) => React.ReactNode;
  renderActions?: (asset: ProjectAsset) => React.ReactNode;
  /** Web: table cells are read-only; use onEditAsset to open the edit panel. */
  readOnlyTable?: boolean;
  canEditAssetRow?: (asset: ProjectAsset) => boolean;
  onEditAsset?: (asset: ProjectAsset) => void;
};

function defaultStatus(asset: ProjectAsset) {
  return (
    <Chip
      size="small"
      label={STATUS_LABELS[asset.status] ?? asset.status}
      color={STATUS_COLORS[asset.status] ?? "default"}
      sx={{ height: 20, fontSize: 10 }}
    />
  );
}

function CaptureSpreadsheetRowInner({
  asset,
  capture,
  rowIndex,
  orderedGroups,
  assetJobColumns,
  mergedCells,
  selectionEnabled,
  isSelected,
  onToggleAssetSelection,
  editableForColumn,
  onSaveCell,
  onPatchCell,
  renderStatus,
  renderActions,
  readOnlyTable = false,
  canEditAssetRow,
  onEditAsset,
}: CaptureSpreadsheetRowProps) {
  const rowBg = rowIndex % 2 === 0 ? ASSET_JOB_PALETTE.tint : ASSET_JOB_PALETTE.tintAlt;

  return (
    <TableRow
      hover
      sx={{ backgroundColor: rowBg }}
    >
      {selectionEnabled && (
        <TableCell
          padding="checkbox"
          sx={{
            ...stickyCell(0, CHECKBOX_W, HEADER_Z.bodyStickyLeft, rowBg),
            borderRight: "1px solid #D8DEE7",
            borderBottom: "1px solid #D8DEE7",
            px: 0.25,
            py: 0.35,
            ...bodyCellHoverSx(rowBg),
          }}
        >
          <Checkbox
            size="small"
            checked={isSelected}
            onChange={(event) => onToggleAssetSelection?.(asset.id, event.target.checked)}
            sx={{ color: "#224F88", "&.Mui-checked": { color: "#224F88" } }}
          />
        </TableCell>
      )}
      <TableCell
        sx={{
          ...stickyCell(selectionEnabled ? CHECKBOX_W : 0, TAG_W, HEADER_Z.bodyStickyLeft, rowBg),
          borderRight: `2px solid ${STATIC_HEADER_BORDER}`,
          borderBottom: "1px solid #D8DEE7",
          px: 0.75,
          py: 0.45,
          ...bodyCellHoverSx(rowBg),
        }}
      >
        <Typography variant="body2" fontWeight={700} sx={{ fontSize: 12, lineHeight: 1.2, color: ASSET_JOB_PALETTE.text }}>
          {asset.assetTag}
        </Typography>
      </TableCell>
      {assetJobColumns.map((column, index) => (
        <TableCell
          key={`asset-job:${column.id}`}
          sx={{
            minWidth: ASSET_JOB_COL_W,
            borderLeft: index === 0 ? `2px solid ${ASSET_JOB_PALETTE.border}` : "1px solid #D8DEE7",
            borderRight: index === assetJobColumns.length - 1 ? `2px solid ${ASSET_JOB_PALETTE.border}` : "1px solid #D8DEE7",
            borderBottom: "1px solid #D8DEE7",
            px: 0.75,
            py: 0.45,
            verticalAlign: "top",
            ...bodyCellHoverSx(rowBg),
          }}
        >
          <Typography sx={{ fontSize: 12, lineHeight: 1.25, color: ASSET_JOB_PALETTE.text, fontWeight: 500 }}>
            {column.valueFor(asset) || "-"}
          </Typography>
        </TableCell>
      ))}
      {orderedGroups.flatMap((group) => group.columns.map((column) => (
        readOnlyTable ? (
          <CaptureReadOnlyCell
            key={column.id}
            column={column}
            group={group}
            rowBg={rowBg}
            value={mergedCells[column.id] ?? ""}
          />
        ) : (
          <CaptureEditableCell
            key={column.id}
            asset={asset}
            column={column}
            group={group}
            rowBg={rowBg}
            value={mergedCells[column.id] ?? ""}
            editable={editableForColumn(asset, column)}
            onSave={onSaveCell}
            onPatch={onPatchCell}
          />
        )
      )))}
      <TableCell
        sx={{
          minWidth: STATUS_W,
          width: STATUS_W,
          maxWidth: STATUS_W,
          borderLeft: `2px solid ${STATIC_HEADER_BORDER}`,
          borderRight: "1px solid #D8DEE7",
          borderBottom: "1px solid #D8DEE7",
          px: 0.6,
          py: 0.45,
          ...bodyCellHoverSx(rowBg),
        }}
      >
        {renderStatus ? renderStatus(asset) : defaultStatus(asset)}
      </TableCell>
      <TableCell
        sx={{
          minWidth: ACTIONS_W,
          width: ACTIONS_W,
          maxWidth: ACTIONS_W,
          borderLeft: "1px solid #D8DEE7",
          borderBottom: "1px solid #D8DEE7",
          px: 0.6,
          py: 0.45,
          ...bodyCellHoverSx(rowBg),
        }}
      >
        <Stack direction="row" spacing={0.25} alignItems="center" justifyContent="flex-start" flexWrap="wrap" useFlexGap>
          {readOnlyTable && canEditAssetRow?.(asset) && onEditAsset && (
            <Tooltip title="Edit capture values">
              <IconButton size="small" onClick={() => onEditAsset(asset)} aria-label={`Edit capture for ${asset.assetTag}`}>
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {renderActions ? renderActions(asset) : (
            !readOnlyTable && <Typography variant="caption" sx={{ color: "rgba(22,52,71,0.62)" }}>-</Typography>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

function shallowCellsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function rowPropsEqual(prev: CaptureSpreadsheetRowProps, next: CaptureSpreadsheetRowProps): boolean {
  return (
    prev.asset.id === next.asset.id
    && prev.asset.status === next.asset.status
    && prev.asset.assetTag === next.asset.assetTag
    && prev.rowIndex === next.rowIndex
    && prev.isSelected === next.isSelected
    && prev.selectionEnabled === next.selectionEnabled
    && prev.orderedGroups === next.orderedGroups
    && prev.assetJobColumns === next.assetJobColumns
    && shallowCellsEqual(prev.mergedCells, next.mergedCells)
    && prev.editableForColumn === next.editableForColumn
    && prev.onSaveCell === next.onSaveCell
    && prev.onPatchCell === next.onPatchCell
    && prev.renderStatus === next.renderStatus
    && prev.renderActions === next.renderActions
    && prev.readOnlyTable === next.readOnlyTable
    && prev.canEditAssetRow === next.canEditAssetRow
    && prev.onEditAsset === next.onEditAsset
  );
}

const CaptureSpreadsheetRow = React.memo(CaptureSpreadsheetRowInner, rowPropsEqual);
CaptureSpreadsheetRow.displayName = "CaptureSpreadsheetRow";

export default CaptureSpreadsheetRow;
