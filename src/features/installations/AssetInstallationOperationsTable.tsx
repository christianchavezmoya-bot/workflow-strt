import { ArrowDropDown, InfoOutlined } from "@mui/icons-material";
import {
  Box,
  Checkbox,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import { operationsStickyPrefixSx, type ColumnDef } from "./assetInstallationPageLogic";
import OperationsVirtualizedTableBody from "./OperationsVirtualizedTableBody";
import {
  OPERATIONS_CHECKBOX_W,
  OPERATIONS_TAG_STICKY_LEFT,
} from "./operationsTableLayout";

type Props = {
  virtualize: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  displayAssets: ProjectAsset[];
  visibleColumns: ColumnDef[];
  selectedAssetIds: Set<string>;
  onToggleSelectAll: (selectAll: boolean) => void;
  onOpenColumnMenu: (anchorEl: HTMLElement, columnKey: string) => void;
  renderAssetRows: (asset: ProjectAsset) => [React.ReactNode, React.ReactNode];
  paginatedWebProject: boolean;
  projectAssetTotal: number;
  projectAssetPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export default function AssetInstallationOperationsTable({
  virtualize,
  scrollRef,
  displayAssets,
  visibleColumns,
  selectedAssetIds,
  onToggleSelectAll,
  onOpenColumnMenu,
  renderAssetRows,
  paginatedWebProject,
  projectAssetTotal,
  projectAssetPage,
  pageSize,
  onPageChange,
}: Props) {
  const colSpan = 3 + visibleColumns.length;

  return (
    <Paper className="glass-card" sx={{ overflow: "hidden" }}>
      <Box
        ref={virtualize ? scrollRef : undefined}
        sx={{
          overflowX: "auto",
          ...(virtualize ? { maxHeight: "min(70vh, calc(100vh - 280px))", overflowY: "auto" } : {}),
        }}
      >
        <Table size="small" stickyHeader={virtualize} sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 28, px: 0.5, ...operationsStickyPrefixSx(0, 4) }}>
                <Checkbox
                  size="small"
                  indeterminate={selectedAssetIds.size > 0 && selectedAssetIds.size < displayAssets.length}
                  checked={displayAssets.length > 0 && selectedAssetIds.size === displayAssets.length}
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                />
              </TableCell>
              <TableCell sx={{ width: 36, px: 1, ...operationsStickyPrefixSx(OPERATIONS_CHECKBOX_W, 4) }} />
              <TableCell sx={operationsStickyPrefixSx(OPERATIONS_TAG_STICKY_LEFT, 4)}>
                <Stack direction="row" alignItems="center" spacing={0.25}>
                  <Typography variant="caption" fontWeight={700}>
                    Asset Tag
                  </Typography>
                  <IconButton
                    size="small"
                    sx={{ p: 0.25 }}
                    onClick={(e) => onOpenColumnMenu(e.currentTarget, "assetTag")}
                  >
                    <ArrowDropDown fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              {visibleColumns.map((col) => (
                <TableCell key={col.id}>
                  <Stack direction="row" alignItems="center" spacing={0.25}>
                    <Typography variant="caption" fontWeight={700}>
                      {col.label}
                    </Typography>
                    {col.id === "features" ? (
                      <Tooltip
                        title={
                          <Stack spacing={0.5}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: "common.white" }}>
                              Feature Colors
                            </Typography>
                            <Typography variant="caption">Amber: Pending or Paused</Typography>
                            <Typography variant="caption">Blue: Running</Typography>
                            <Typography variant="caption">Green: Complete</Typography>
                            <Typography variant="caption">Red: Missing data</Typography>
                          </Stack>
                        }
                      >
                        <InfoOutlined sx={{ fontSize: 14, color: "text.disabled", cursor: "help" }} />
                      </Tooltip>
                    ) : (
                      <IconButton
                        size="small"
                        sx={{ p: 0.25 }}
                        onClick={(e) => onOpenColumnMenu(e.currentTarget, col.id)}
                      >
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </TableCell>
              ))}
              <TableCell align="right">
                <Typography variant="caption" fontWeight={700}>
                  Actions
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          {virtualize ? (
            <OperationsVirtualizedTableBody
              scrollRef={scrollRef}
              rowCount={displayAssets.length * 2}
              colSpan={colSpan}
              renderRow={(index) => {
                const asset = displayAssets[Math.floor(index / 2)];
                if (!asset) return null;
                const rows = renderAssetRows(asset);
                return rows[index % 2];
              }}
            />
          ) : (
            <TableBody>{displayAssets.flatMap((asset) => renderAssetRows(asset))}</TableBody>
          )}
        </Table>
      </Box>
      {paginatedWebProject && projectAssetTotal > 0 && (
        <TablePagination
          component="div"
          count={projectAssetTotal}
          page={Math.max(0, projectAssetPage - 1)}
          onPageChange={(_, nextPage) => onPageChange(nextPage + 1)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[pageSize]}
        />
      )}
    </Paper>
  );
}
