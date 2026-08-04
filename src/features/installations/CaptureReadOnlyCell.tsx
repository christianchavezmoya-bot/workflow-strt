import React from "react";
import { TableCell, Typography } from "@mui/material";
import type { ProjectCaptureColumn, ProjectCaptureGroup } from "../../utils/projectCaptureTable";
import {
  ASSET_JOB_PALETTE,
  CAPTURE_COL_W,
  bodyCellHoverSx,
  groupPalette,
} from "./captureSpreadsheetTableLayout";

export type CaptureReadOnlyCellProps = {
  column: ProjectCaptureColumn;
  group: ProjectCaptureGroup;
  rowBg: string;
  value: string;
};

function CaptureReadOnlyCellInner({ column, group, rowBg, value }: CaptureReadOnlyCellProps) {
  const isBlank = value.trim().length === 0;
  const palette = groupPalette(group);
  const columnIndex = group.columns.findIndex((item) => item.id === column.id);

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
        ...bodyCellHoverSx(rowBg),
      }}
    >
      <Typography
        variant="caption"
        fontStyle={isBlank ? "italic" : "normal"}
        fontWeight={500}
        sx={{ fontSize: 12, lineHeight: 1.25, color: isBlank ? "rgba(22,52,71,0.62)" : ASSET_JOB_PALETTE.text }}
      >
        {isBlank ? "-" : value}
      </Typography>
    </TableCell>
  );
}

const CaptureReadOnlyCell = React.memo(CaptureReadOnlyCellInner);
CaptureReadOnlyCell.displayName = "CaptureReadOnlyCell";

export default CaptureReadOnlyCell;
