import React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TableBody, TableCell, TableRow } from "@mui/material";
import { OPERATIONS_ROW_HEIGHT } from "./operationsTableLayout";

type OperationsVirtualizedTableBodyProps = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  rowCount: number;
  colSpan: number;
  renderRow: (index: number) => React.ReactNode;
};

export default function OperationsVirtualizedTableBody({
  scrollRef,
  rowCount,
  colSpan,
  renderRow,
}: OperationsVirtualizedTableBodyProps) {
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => OPERATIONS_ROW_HEIGHT,
    overscan: 6,
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
      {virtualItems.map((virtualRow) => (
        <React.Fragment key={virtualRow.index}>{renderRow(virtualRow.index)}</React.Fragment>
      ))}
      {paddingBottom > 0 && (
        <TableRow aria-hidden>
          <TableCell colSpan={colSpan} sx={{ height: paddingBottom, p: 0, border: 0, lineHeight: 0 }} />
        </TableRow>
      )}
    </TableBody>
  );
}
