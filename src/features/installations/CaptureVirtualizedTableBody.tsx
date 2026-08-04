import React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TableBody, TableCell, TableRow } from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import type { ProjectCaptureRow } from "../../utils/projectCaptureTable";
import CaptureSpreadsheetRow, { type CaptureSpreadsheetRowProps } from "./CaptureSpreadsheetRow";
import { CAPTURE_ROW_HEIGHT } from "./captureSpreadsheetTableLayout";

export type CaptureVirtualRow = {
  asset: ProjectAsset;
  capture: ProjectCaptureRow;
  mergedCells: Record<string, string>;
};

type CaptureVirtualizedTableBodyProps = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  rows: CaptureVirtualRow[];
  colSpan: number;
  selectedAssetIds?: Set<string>;
  rowProps: Omit<
    CaptureSpreadsheetRowProps,
    "asset" | "capture" | "mergedCells" | "rowIndex" | "isSelected"
  >;
};

export default function CaptureVirtualizedTableBody({
  scrollRef,
  rows,
  colSpan,
  selectedAssetIds,
  rowProps,
}: CaptureVirtualizedTableBodyProps) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CAPTURE_ROW_HEIGHT,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <TableBody sx={{ position: "relative", zIndex: 0 }}>
      {paddingTop > 0 && (
        <TableRow aria-hidden>
          <TableCell colSpan={colSpan} sx={{ height: paddingTop, p: 0, border: 0, lineHeight: 0 }} />
        </TableRow>
      )}
      {virtualItems.map((virtualRow) => {
        const { asset, capture, mergedCells } = rows[virtualRow.index];
        return (
          <CaptureSpreadsheetRow
            key={asset.id}
            asset={asset}
            capture={capture}
            rowIndex={virtualRow.index}
            mergedCells={mergedCells}
            isSelected={selectedAssetIds?.has(asset.id) ?? false}
            {...rowProps}
          />
        );
      })}
      {paddingBottom > 0 && (
        <TableRow aria-hidden>
          <TableCell colSpan={colSpan} sx={{ height: paddingBottom, p: 0, border: 0, lineHeight: 0 }} />
        </TableRow>
      )}
    </TableBody>
  );
}
