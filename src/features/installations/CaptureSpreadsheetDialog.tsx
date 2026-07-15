/**
 * Full-screen / dialog capture spreadsheet — used on phone (popup) and reusable on web.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import ViewColumnOutlined from "@mui/icons-material/ViewColumnOutlined";
import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { Feature } from "../../types/feature";
import type { FeatureDependency } from "../../types/featureDependency";
import type { FeatureSelection } from "../../services/productConfigService";
import {
  buildProjectCaptureTable,
  type ProjectCaptureColumn,
  type ProjectCaptureGroup,
  type ProjectCaptureRow,
} from "../../utils/projectCaptureTable";
import { STATUS_LABELS, STATUS_COLORS } from "./assetStatusDisplay";

export type CaptureSpreadsheetDialogProps = {
  open: boolean;
  onClose: () => void;
  fullScreen?: boolean;
  embedded?: boolean;
  assets: ProjectAsset[];
  runsMap: Record<string, AssetWorkflowRun[]>;
  features: Feature[];
  depsByFeature: Record<string, FeatureDependency[]>;
  featureSelectionsByConfig: FeatureSelection[][];
  activeCountForAsset: (asset: ProjectAsset) => Record<string, number>;
  readOnly?: boolean;
  canEditCapture?: boolean;
  canEditAsset?: (asset: ProjectAsset) => boolean;
  onRunUpdated?: (run: AssetWorkflowRun) => void;
  renderStatus?: (asset: ProjectAsset) => React.ReactNode;
  renderActions?: (asset: ProjectAsset) => React.ReactNode;
};

const LS_HIDDEN_KEY = "capture_spreadsheet_hidden_groups_v1";
const STICKY_TOP_NAME = 0;
const STICKY_TOP_PN = 36;
const STICKY_TOP_FIELDS = 72;
const LEFT_TAG = 0;
const LEFT_NAME = 132;
const LEFT_STATUS = 304;
const LEFT_ACTIONS = 416;
const TAG_W = 132;
const NAME_W = 172;
const STATUS_W = 112;
const ACTIONS_W = 132;

function loadHiddenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_HIDDEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const n = Number.parseInt(value, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function groupPalette(group: ProjectCaptureGroup) {
  if (group.groupType === "general") {
    return {
      header: "#5F6B7A",
      subHeader: "#EEF1F4",
      border: "#5F6B7A",
      tint: hexToRgba("#5F6B7A", 0.05),
    };
  }

  const tint = group.tintIndex % 2 === 0 ? 0.05 : 0.095;
  return {
    header: "#1B4A86",
    subHeader: group.tintIndex % 2 === 0 ? "#EAF0F8" : "#DDE8F6",
    border: "#1B4A86",
    tint: hexToRgba("#1B4A86", tint),
  };
}

function stickyCell(left: number, width: number, zIndex: number) {
  return {
    position: "sticky" as const,
    left,
    zIndex,
    minWidth: width,
    width,
    maxWidth: width,
    bgcolor: "background.paper",
  };
}

function rowSearchMatch(row: ProjectCaptureRow, asset: ProjectAsset, query: string) {
  if (!query) return true;
  const base = [asset.assetTag, asset.assetName ?? "", asset.serialNumber ?? "", asset.status].join(" ").toLowerCase();
  return base.includes(query) || row.searchText.includes(query);
}

export default function CaptureSpreadsheetDialog({
  open,
  onClose,
  fullScreen = false,
  embedded = false,
  assets,
  runsMap,
  features,
  renderStatus,
  renderActions,
}: CaptureSpreadsheetDialogProps) {
  const [search, setSearch] = useState("");
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(loadHiddenGroups);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const table = useMemo(
    () => buildProjectCaptureTable(assets, runsMap, features),
    [assets, runsMap, features],
  );

  const visibleGroups = useMemo(() => {
    return table.groups
      .map((group) => ({
        ...group,
        columns: group.columns.filter((column) => !hiddenGroups.has(group.key) && !hiddenGroups.has(column.id)),
      }))
      .filter((group) => group.columns.length > 0);
  }, [table.groups, hiddenGroups]);

  const visibleColumns = useMemo(() => visibleGroups.flatMap((group) => group.columns), [visibleGroups]);

  const rows = useMemo(() => {
    const rowMap = new Map(table.rows.map((row) => [row.assetId, row]));
    return assets.map((asset) => ({
      asset,
      capture: rowMap.get(asset.id) ?? { assetId: asset.id, cells: {}, searchText: [asset.assetTag, asset.assetName ?? ""].join(" ").toLowerCase() },
    }));
  }, [assets, table.rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(({ asset, capture }) => rowSearchMatch(capture, asset, query));
  }, [rows, search]);

  const columnGroups = useMemo(() => {
    return table.groups.map((group) => ({
      ...group,
      columns: group.columns.slice().sort((a, b) => a.displayLabel.localeCompare(b.displayLabel)),
    }));
  }, [table.groups]);

  const toggleHiddenKey = useCallback((key: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const defaultStatus = (asset: ProjectAsset) => (
    <Chip
      size="small"
      label={STATUS_LABELS[asset.status] ?? asset.status}
      color={STATUS_COLORS[asset.status] ?? "default"}
      sx={{ height: 20, fontSize: 10 }}
    />
  );

  const renderGroupPicker = () => (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "rgba(255,255,255,0.04)", maxHeight: 260, overflowY: "auto" }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
        Toggle columns (alphabetical by feature group)
      </Typography>
      <Stack spacing={1.25}>
        {columnGroups.map((group) => (
          <Box key={group.key}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={!hiddenGroups.has(group.key)}
                  onChange={() => toggleHiddenKey(group.key)}
                />
              }
              label={<Typography variant="caption" fontWeight={700}>{group.displayName}</Typography>}
              sx={{ alignItems: "flex-start", m: 0 }}
            />
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ pl: 3.5, pt: 0.5 }}>
              {group.columns.map((column) => (
                <FormControlLabel
                  key={column.id}
                  control={
                    <Checkbox
                      size="small"
                      checked={!hiddenGroups.has(column.id)}
                      disabled={hiddenGroups.has(group.key)}
                      onChange={() => toggleHiddenKey(column.id)}
                    />
                  }
                  label={<Typography variant="caption">{column.displayLabel}</Typography>}
                  sx={{ alignItems: "flex-start", m: 0 }}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );

  const renderValueCell = (capture: ProjectCaptureRow, column: ProjectCaptureColumn, group: ProjectCaptureGroup) => {
    const value = capture.cells[column.id] ?? "";
    const palette = groupPalette(group);
    const isBlank = value.trim().length === 0;
    return (
      <TableCell
        key={column.id}
        sx={{
          minWidth: 124,
          borderLeft: column === group.columns[0] ? `2px solid ${palette.border}` : "1px solid #D8DEE7",
          borderRight: column === group.columns[group.columns.length - 1] ? `2px solid ${palette.border}` : "1px solid #D8DEE7",
          borderBottom: "1px solid #D8DEE7",
          bgcolor: palette.tint,
          verticalAlign: "top",
        }}
      >
        <Typography
          variant="caption"
          color={isBlank ? "text.disabled" : "text.primary"}
          fontStyle={isBlank ? "italic" : "normal"}
        >
          {isBlank ? "—" : value}
        </Typography>
      </TableCell>
    );
  };

  const inner = (
    <Stack spacing={1.5} sx={embedded ? { width: "100%" } : undefined}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Search asset, feature, P/N, serial, firmware, captured value…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, minWidth: 220, maxWidth: embedded ? 420 : undefined }}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<ViewColumnOutlined fontSize="small" />}
          onClick={() => setColumnPickerOpen((v) => !v)}
        >
          Columns
        </Button>
        {!embedded && (
          <Button size="small" variant="contained" onClick={onClose}>
            Close
          </Button>
        )}
      </Stack>

      {columnPickerOpen && renderGroupPicker()}

      <Box sx={{ overflow: "auto", maxHeight: embedded ? undefined : (fullScreen ? "calc(100vh - 200px)" : "70vh") }}>
        <Table size="small" stickyHeader sx={{ minWidth: 760, borderCollapse: "separate", borderSpacing: 0 }}>
          <TableHead>
            <TableRow>
              <TableCell rowSpan={3} sx={{ ...stickyCell(LEFT_TAG, TAG_W, 9), top: STICKY_TOP_NAME, fontWeight: 700, borderRight: "1px solid #D8DEE7" }}>Asset Tag</TableCell>
              <TableCell rowSpan={3} sx={{ ...stickyCell(LEFT_NAME, NAME_W, 9), top: STICKY_TOP_NAME, fontWeight: 700, borderRight: "1px solid #D8DEE7" }}>Asset Name</TableCell>
              <TableCell rowSpan={3} sx={{ ...stickyCell(LEFT_STATUS, STATUS_W, 9), top: STICKY_TOP_NAME, fontWeight: 700, borderRight: "1px solid #D8DEE7" }}>Status</TableCell>
              <TableCell rowSpan={3} sx={{ ...stickyCell(LEFT_ACTIONS, ACTIONS_W, 9), top: STICKY_TOP_NAME, fontWeight: 700, borderRight: "1px solid #D8DEE7" }}>Actions</TableCell>
              {visibleGroups.map((group) => {
                const palette = groupPalette(group);
                return (
                  <TableCell
                    key={`${group.key}:name`}
                    align="center"
                    colSpan={group.columns.length}
                    sx={{
                      top: STICKY_TOP_NAME,
                      position: "sticky",
                      zIndex: 8,
                      bgcolor: palette.header,
                      color: "common.white",
                      fontWeight: 700,
                      border: `2px solid ${palette.border}`,
                      minWidth: group.columns.length * 124,
                    }}
                  >
                    {group.displayName}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              {visibleGroups.map((group) => {
                const palette = groupPalette(group);
                const pnText = group.groupType === "general"
                  ? "Shared fields"
                  : (group.businessPartNumber
                      ? `P/N: ${group.businessPartNumber}${group.manufacturerPartNumber && group.manufacturerPartNumber !== group.businessPartNumber ? ` | Mfr: ${group.manufacturerPartNumber}` : ""}`
                      : (group.manufacturerPartNumber ? `Mfr: ${group.manufacturerPartNumber}` : "P/N: —"));
                return (
                  <TableCell
                    key={`${group.key}:pn`}
                    align="center"
                    colSpan={group.columns.length}
                    sx={{
                      top: STICKY_TOP_PN,
                      position: "sticky",
                      zIndex: 8,
                      bgcolor: palette.subHeader,
                      color: palette.border,
                      fontWeight: 700,
                      borderLeft: `2px solid ${palette.border}`,
                      borderRight: `2px solid ${palette.border}`,
                      borderBottom: `1px solid ${palette.border}`,
                    }}
                  >
                    {pnText}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              {visibleGroups.map((group) => {
                const palette = groupPalette(group);
                return group.columns.map((column, index) => (
                  <TableCell
                    key={column.id}
                    align="center"
                    sx={{
                      top: STICKY_TOP_FIELDS,
                      position: "sticky",
                      zIndex: 8,
                      bgcolor: hexToRgba(palette.border, group.groupType === "general" ? 0.08 : 0.1),
                      color: "text.primary",
                      fontWeight: 700,
                      fontSize: 11,
                      minWidth: 124,
                      borderLeft: index === 0 ? `2px solid ${palette.border}` : "1px solid #D8DEE7",
                      borderRight: index === group.columns.length - 1 ? `2px solid ${palette.border}` : "1px solid #D8DEE7",
                      borderBottom: `2px solid ${palette.border}`,
                    }}
                  >
                    {column.displayLabel}
                  </TableCell>
                ));
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    No assets match.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map(({ asset, capture }) => (
                <TableRow key={asset.id} hover>
                  <TableCell sx={{ ...stickyCell(LEFT_TAG, TAG_W, 3), borderRight: "1px solid #D8DEE7" }}>
                    <Typography variant="body2" fontWeight={600}>{asset.assetTag}</Typography>
                  </TableCell>
                  <TableCell sx={{ ...stickyCell(LEFT_NAME, NAME_W, 3), borderRight: "1px solid #D8DEE7" }}>
                    <Typography variant="body2" color="text.secondary">{asset.assetName || "—"}</Typography>
                  </TableCell>
                  <TableCell sx={{ ...stickyCell(LEFT_STATUS, STATUS_W, 3), borderRight: "1px solid #D8DEE7" }}>
                    {renderStatus ? renderStatus(asset) : defaultStatus(asset)}
                  </TableCell>
                  <TableCell sx={{ ...stickyCell(LEFT_ACTIONS, ACTIONS_W, 3), borderRight: "1px solid #D8DEE7" }}>
                    {renderActions ? renderActions(asset) : <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                  {visibleGroups.flatMap((group) => group.columns.map((column) => renderValueCell(capture, column, group)))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );

  if (embedded) {
    if (!open) return null;
    return <Paper className="glass-card" sx={{ overflow: "hidden", p: 1.5 }}>{inner}</Paper>;
  }

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth={false} fullWidth>
      <DialogTitle sx={{ py: 1, px: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
            Capture table
          </Typography>
          <Tooltip title="Show / hide feature groups and fields">
            <IconButton size="small" onClick={() => setColumnPickerOpen((v) => !v)}>
              <ViewColumnOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ px: 2, pb: 2, pt: 0 }}>
        {inner}
      </DialogContent>
    </Dialog>
  );
}
