import React from "react";
import { TableBody, TableCell, TableRow } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
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
    // Measure what the browser actually laid out instead of trusting the estimate.
    // The caller emits two rows per asset — a normal row plus a detail row that is a
    // collapsed <Collapse>, i.e. ~0px tall until expanded. Estimating every row at
    // OPERATIONS_ROW_HEIGHT therefore claimed roughly double the real height, so near the
    // bottom the computed range pointed past the real content and rows swapped in and out
    // on every scroll event — the flicker. Real measurements keep getTotalSize() honest.
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? Math.max(0, virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end)
    : 0;

  return (
    <TableBody sx={{ position: "relative", zIndex: 0 }}>
      {paddingTop > 0 && (
        <TableRow aria-hidden>
          <TableCell colSpan={colSpan} sx={{ height: paddingTop, p: 0, border: 0, lineHeight: 0 }} />
        </TableRow>
      )}
      {virtualItems.map((virtualRow) => {
        const node = renderRow(virtualRow.index);
        if (!React.isValidElement(node)) return null;
        // measureElement reads data-index off the node it observes, so both the ref and the
        // attribute have to land on the real row element rather than a wrapper.
        return React.cloneElement(node as React.ReactElement<Record<string, unknown>>, {
          key: virtualRow.index,
          "data-index": virtualRow.index,
          ref: virtualizer.measureElement,
        });
      })}
      {paddingBottom > 0 && (
        <TableRow aria-hidden>
          <TableCell colSpan={colSpan} sx={{ height: paddingBottom, p: 0, border: 0, lineHeight: 0 }} />
        </TableRow>
      )}
    </TableBody>
  );
}
