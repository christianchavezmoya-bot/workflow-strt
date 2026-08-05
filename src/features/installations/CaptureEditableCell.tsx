import React, { useCallback, useEffect, useState } from "react";
import { CircularProgress, TableCell, TextField, Typography } from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import type { ProjectCaptureColumn, ProjectCaptureGroup } from "../../utils/projectCaptureTable";
import {
  ASSET_JOB_PALETTE,
  CAPTURE_COL_W,
  CAPTURE_FIELD_HEADER_FONT,
  NA_CELL_BG,
  NA_CELL_TEXT,
  bodyCellHoverSx,
  captureCellKey,
  groupPalette,
} from "./captureSpreadsheetTableLayout";

export type CaptureEditableCellProps = {
  asset: ProjectAsset;
  column: ProjectCaptureColumn;
  group: ProjectCaptureGroup;
  rowBg: string;
  value: string;
  editable: boolean;
  /** False when this column's step is not part of the asset's workflow run. */
  applicable: boolean;
  onSave: (asset: ProjectAsset, column: ProjectCaptureColumn, value: string) => Promise<void>;
  onPatch: (assetId: string, columnId: string, value: string) => void;
};

function CaptureEditableCellInner({
  asset,
  column,
  group,
  rowBg,
  value,
  editable,
  applicable,
  onSave,
  onPatch,
}: CaptureEditableCellProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const displayValue = draft ?? value;
  const isBlank = displayValue.trim().length === 0;
  const isNotApplicable = !applicable;
  const palette = groupPalette(group);
  const columnIndex = group.columns.findIndex((item) => item.id === column.id);
  const cellBg = isNotApplicable ? NA_CELL_BG : rowBg;

  useEffect(() => {
    if (draft == null) return;
    if (draft.trim() === value.trim()) setDraft(null);
  }, [draft, value]);

  const handleBlur = useCallback(async () => {
    if (draft == null) return;
    const next = draft.trim();
    if (next === value.trim()) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      onPatch(asset.id, column.id, next);
      await onSave(asset, column, next);
      setDraft(null);
    } catch {
      setDraft(next);
    } finally {
      setSaving(false);
    }
  }, [asset, column, draft, onPatch, onSave, value]);

  return (
    <TableCell
      sx={{
        minWidth: CAPTURE_COL_W,
        borderLeft: columnIndex === 0 ? `2px solid ${palette.border}` : "1px solid #D8DEE7",
        borderRight: columnIndex === group.columns.length - 1 ? `2px solid ${palette.border}` : "1px solid #D8DEE7",
        borderBottom: "1px solid #D8DEE7",
        verticalAlign: "top",
        px: 0.75,
        py: 0.45,
        position: "relative",
        zIndex: 0,
        ...bodyCellHoverSx(cellBg),
      }}
    >
      {isNotApplicable ? (
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{ fontSize: 12, lineHeight: 1.25, color: NA_CELL_TEXT }}
        >
          N/A
        </Typography>
      ) : editable ? (
        <TextField
          size="small"
          value={displayValue}
          disabled={saving}
          placeholder="-"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { void handleBlur(); }}
          inputProps={{ sx: { fontSize: 12, py: 0.35, px: 0.5, color: ASSET_JOB_PALETTE.text } }}
          sx={{
            width: "100%",
            "& .MuiInputBase-input": { color: ASSET_JOB_PALETTE.text },
            "& .MuiInputBase-input::placeholder": { color: "rgba(22,52,71,0.45)", opacity: 1 },
          }}
          InputProps={{
            endAdornment: saving ? <CircularProgress size={12} sx={{ mr: 0.5 }} /> : undefined,
          }}
        />
      ) : (
        <Typography
          variant="caption"
          fontStyle={isBlank ? "italic" : "normal"}
          fontWeight={500}
          sx={{ fontSize: 12, lineHeight: 1.25, color: isBlank ? "rgba(22,52,71,0.62)" : ASSET_JOB_PALETTE.text }}
        >
          {isBlank ? "-" : value}
        </Typography>
      )}
    </TableCell>
  );
}

function cellPropsEqual(prev: CaptureEditableCellProps, next: CaptureEditableCellProps): boolean {
  return (
    prev.asset.id === next.asset.id
    && prev.column.id === next.column.id
    && prev.rowBg === next.rowBg
    && prev.value === next.value
    && prev.editable === next.editable
    && prev.applicable === next.applicable
    && prev.group === next.group
    && prev.onSave === next.onSave
    && prev.onPatch === next.onPatch
  );
}

const CaptureEditableCell = React.memo(CaptureEditableCellInner, cellPropsEqual);
CaptureEditableCell.displayName = "CaptureEditableCell";

export { captureCellKey };
export default CaptureEditableCell;
