/**
 * Full-screen / dialog capture spreadsheet — used on phone (popup) and reusable on web.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  Menu,
  MenuItem,
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
  ThemeProvider,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import ViewColumnOutlined from "@mui/icons-material/ViewColumnOutlined";
import ArrowDropDown from "@mui/icons-material/ArrowDropDown";
import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { Feature } from "../../types/feature";
import type { FeatureDependency } from "../../types/featureDependency";
import type { FeatureSelection } from "../../services/productConfigService";
import type { UserRole } from "../../types/user";
import {
  buildProjectCaptureTable,
  buildSchemaCaptureTableSkeleton,
  findCaptureMatch,
  getCaptureTableStructureKey,
  type ProjectCaptureColumn,
  type ProjectCaptureGroup,
  type ProjectCaptureRow,
} from "../../utils/projectCaptureTable";
import { anyMatchesWordStart, matchesWordStart } from "../../utils/textMatch";
import { computeCaptureHeaderStickyTops } from "../../utils/captureSpreadsheet";
import { STATUS_LABELS } from "./assetStatusDisplay";
import { canEditRun } from "../../utils/runEditPermissions";
import { isCaptureColumnEditable } from "../../utils/captureTableEdit";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { pickCaptureRun } from "../../utils/captureSpreadsheet";
import { captureSpreadsheetTheme } from "../../theme/captureSpreadsheetTheme";
import CaptureSpreadsheetRow from "./CaptureSpreadsheetRow";
import CaptureVirtualizedTableBody from "./CaptureVirtualizedTableBody";
import { captureCellKey } from "./CaptureEditableCell";
import {
  type CaptureSpreadsheetAssetJobColumn,
  ACTIONS_W,
  ASSET_JOB_COL_W,
  ASSET_JOB_PALETTE,
  CAPTURE_COL_W,
  CAPTURE_VIRTUALIZE_MIN_ROWS,
  CHECKBOX_W,
  HEADER_Z,
  STATIC_HEADER_BG,
  STATIC_HEADER_BORDER,
  STATIC_HEADER_TEXT,
  STATUS_W,
  TAG_W,
  groupPalette,
  stickyCell,
} from "./captureSpreadsheetTableLayout";

export type { CaptureSpreadsheetAssetJobColumn };

export type CaptureSpreadsheetDialogProps = {
  open: boolean;
  onClose: () => void;
  fullScreen?: boolean;
  embedded?: boolean;
  hideSelectionColumn?: boolean;
  assets: ProjectAsset[];
  runsMap: Record<string, AssetWorkflowRun[]>;
  /** True while paginated web loads full run blobs for capture columns. */
  captureRunsLoading?: boolean;
  captureRunsError?: string | null;
  /** When true (web paginated path only), show schema headers while run blobs load. */
  schemaFallback?: boolean;
  maxUnitsByFeature?: Record<string, number>;
  features: Feature[];
  depsByFeature: Record<string, FeatureDependency[]>;
  featureSelectionsByConfig: FeatureSelection[][];
  activeCountForAsset: (asset: ProjectAsset) => Record<string, number>;
  readOnly?: boolean;
  canEditCapture?: boolean;
  canEditAsset?: (asset: ProjectAsset) => boolean;
  userRole?: UserRole | null;
  currentUserName?: string;
  onRunUpdated?: (run: AssetWorkflowRun) => void;
  renderStatus?: (asset: ProjectAsset) => React.ReactNode;
  renderActions?: (asset: ProjectAsset) => React.ReactNode;
  assetJobColumns?: CaptureSpreadsheetAssetJobColumn[];
  selectedAssetIds?: Set<string>;
  onToggleAssetSelection?: (assetId: string, checked: boolean) => void;
  onToggleVisibleAssetSelection?: (assetIds: string[], checked: boolean) => void;
};

/**
 * Stable identity for the optional maxUnitsByFeature prop. A `= {}` default parameter mints a
 * new object every render, and this value is a dependency of the table memo — so any caller
 * that omits the prop rebuilt the table on every render and drove an infinite update loop.
 */
const NO_MAX_UNITS: Record<string, number> = {};

const LS_HIDDEN_KEY = "capture_spreadsheet_hidden_groups_v1";
const DEFAULT_HEADER_STICKY_TOPS = { name: 0, pn: 36, fields: 72 };

function solidFieldHeaderBg(group: ProjectCaptureGroup): string {
  return groupPalette(group).subHeader;
}

function loadHiddenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_HIDDEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

function saveHiddenGroups(next: Set<string>) {
  try {
    localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify([...next]));
  } catch {
    // ignore
  }
}

function rowSearchMatch(row: ProjectCaptureRow, asset: ProjectAsset, query: string) {
  if (!query) return true;
  if (anyMatchesWordStart([asset.assetTag, asset.assetName, asset.serialNumber, asset.status], query)) {
    return true;
  }
  return Boolean(findCaptureMatch(row.searchHits, query, matchesWordStart));
}

function splitLabelIntoTwoLines(label: string) {
  if (!label) return label;
  const normalized = label.replace(/\s+/g, " ").trim();
  const dashIndex = normalized.indexOf(" - ");
  if (dashIndex > 0) return `${normalized.slice(0, dashIndex)}\n${normalized.slice(dashIndex + 3)}`;

  const words = normalized.split(" ");
  if (words.length < 3) return normalized;

  const target = Math.floor(normalized.length / 2);
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let current = words[0].length;
  for (let i = 1; i < words.length; i += 1) {
    const distance = Math.abs(target - current);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
    current += words[i].length + 1;
  }

  return `${words.slice(0, bestIndex).join(" ")}\n${words.slice(bestIndex).join(" ")}`;
}

export default function CaptureSpreadsheetDialog({
  open,
  onClose,
  fullScreen = false,
  embedded = false,
  hideSelectionColumn = false,
  assets,
  runsMap,
  captureRunsLoading = false,
  captureRunsError = null,
  schemaFallback = false,
  maxUnitsByFeature = NO_MAX_UNITS,
  features,
  depsByFeature,
  featureSelectionsByConfig,
  readOnly = false,
  canEditCapture = false,
  canEditAsset,
  userRole = null,
  currentUserName = "",
  onRunUpdated,
  renderStatus,
  renderActions,
  assetJobColumns = [],
  selectedAssetIds,
  onToggleAssetSelection,
  onToggleVisibleAssetSelection,
}: CaptureSpreadsheetDialogProps) {
  const [search, setSearch] = useState("");
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(loadHiddenGroups);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [filterMenu, setFilterMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({ anchorEl: null, key: "" });
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [cellPatches, setCellPatches] = useState<Record<string, string>>({});
  const [cellError, setCellError] = useState<string | null>(null);
  const headerRow1Ref = useRef<HTMLTableRowElement>(null);
  const headerRow2Ref = useRef<HTMLTableRowElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const runsMapRef = useRef(runsMap);
  runsMapRef.current = runsMap;
  const [headerStickyTops, setHeaderStickyTops] = useState(DEFAULT_HEADER_STICKY_TOPS);

  const measureHeaderStickyTops = useCallback(() => {
    const row1Height = headerRow1Ref.current?.getBoundingClientRect().height ?? DEFAULT_HEADER_STICKY_TOPS.pn;
    const row2Height = headerRow2Ref.current?.getBoundingClientRect().height ?? (DEFAULT_HEADER_STICKY_TOPS.fields - DEFAULT_HEADER_STICKY_TOPS.pn);
    setHeaderStickyTops(computeCaptureHeaderStickyTops(row1Height, row2Height));
  }, []);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setCellPatches({});
      setCellError(null);
    }
  }, [open]);

  const assetIds = useMemo(() => assets.map((asset) => asset.id), [assets]);
  const tableStructureKey = useMemo(
    () => getCaptureTableStructureKey(runsMap, assetIds),
    [assetIds, runsMap],
  );

  useEffect(() => {
    setCellPatches({});
  }, [tableStructureKey]);

  const table = useMemo(() => {
    const fromRuns = buildProjectCaptureTable(assets, runsMapRef.current, features);
    if (fromRuns.groups.length > 0 || !schemaFallback) return fromRuns;
    if (Object.keys(depsByFeature).length === 0) return fromRuns;
    const skeleton = buildSchemaCaptureTableSkeleton(assets, features, depsByFeature, maxUnitsByFeature);
    return skeleton.groups.length > 0 ? skeleton : fromRuns;
    // Rebuild when column structure changes — not on every stepResultsJson value edit.
  }, [assets, depsByFeature, features, maxUnitsByFeature, schemaFallback, tableStructureKey]);

  const visibleGroups = useMemo(() => {
    return table.groups
      .map((group) => ({
        ...group,
        columns: group.columns.filter((column) => !hiddenGroups.has(group.key) && !hiddenGroups.has(column.id)),
      }))
      .filter((group) => group.columns.length > 0);
  }, [table.groups, hiddenGroups]);

  const componentGroups = useMemo(() => visibleGroups.filter((group) => group.groupType !== "general"), [visibleGroups]);
  const signOffGroups = useMemo(() => visibleGroups.filter((group) => group.groupType === "general"), [visibleGroups]);
  const orderedGroups = useMemo(() => [...componentGroups, ...signOffGroups], [componentGroups, signOffGroups]);
  const visibleColumns = useMemo(() => orderedGroups.flatMap((group) => group.columns), [orderedGroups]);

  useLayoutEffect(() => {
    if (!open) return;
    measureHeaderStickyTops();
    const resizeObserver = new ResizeObserver(measureHeaderStickyTops);
    if (headerRow1Ref.current) resizeObserver.observe(headerRow1Ref.current);
    if (headerRow2Ref.current) resizeObserver.observe(headerRow2Ref.current);
    window.addEventListener("resize", measureHeaderStickyTops);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureHeaderStickyTops);
    };
  }, [measureHeaderStickyTops, open, orderedGroups, assetJobColumns, columnPickerOpen, columnFilters]);

  const runDiagnostics = useMemo(() => {
    const runs = Object.values(runsMap).flat();
    return {
      totalRuns: runs.length,
      runsWithSnapshot: runs.filter((run) => (run.workflowSnapshotJson || '').length > 20).length,
      runsWithResults: runs.filter((run) => (run.stepResultsJson || '').length > 20).length,
    };
  }, [runsMap]);

  useEffect(() => {
    if (table.groups.length === 0 || hiddenGroups.size === 0) return;

    const validKeys = new Set<string>();
    for (const group of table.groups) {
      validKeys.add(group.key);
      for (const column of group.columns) validKeys.add(column.id);
    }

    let changed = false;
    const pruned = new Set<string>();
    hiddenGroups.forEach((key) => {
      if (validKeys.has(key)) {
        pruned.add(key);
      } else {
        changed = true;
      }
    });

    if (changed) {
      saveHiddenGroups(pruned);
      setHiddenGroups(pruned);
      return;
    }

    if (visibleGroups.length === 0 && table.columns.length > 0) {
      const cleared = new Set<string>();
      saveHiddenGroups(cleared);
      setHiddenGroups(cleared);
    }
  }, [hiddenGroups, table.columns.length, table.groups, visibleGroups.length]);

  const applyCellPatches = useCallback((cells: Record<string, string>, assetId: string) => {
    const merged = { ...cells };
    for (const key of Object.keys(cellPatches)) {
      if (!key.startsWith(`${assetId}::`)) continue;
      const columnId = key.slice(assetId.length + 2);
      merged[columnId] = cellPatches[key];
    }
    return merged;
  }, [cellPatches]);

  const rows = useMemo(() => {
    const rowMap = new Map(table.rows.map((row) => [row.assetId, row]));
    return assets.map((asset) => {
      const capture = rowMap.get(asset.id) ?? {
        assetId: asset.id,
        cells: {},
        searchText: [asset.assetTag, asset.assetName ?? ""].join(" ").toLowerCase(),
        searchHits: [],
      };
      return {
        asset,
        capture,
        mergedCells: applyCellPatches(capture.cells, asset.id),
      };
    });
  }, [applyCellPatches, assets, table.rows]);

  const getColumnFilterValue = useCallback((
    key: string,
    asset: ProjectAsset,
    capture: ProjectCaptureRow,
    mergedCells: Record<string, string>,
  ) => {
    if (key == "assetTag") return asset.assetTag || "-";
    if (key == "status") return STATUS_LABELS[asset.status] ?? asset.status;
    if (key == "actions") return renderActions ? "Available" : "-";
    if (key.startsWith("asset-job:")) {
      const columnId = key.slice("asset-job:".length);
      const column = assetJobColumns.find((item) => item.id === columnId);
      return column?.valueFor(asset) || "-";
    }
    if (key.startsWith("capture:")) {
      const columnId = key.slice("capture:".length);
      const value = mergedCells[columnId] ?? "";
      return value.trim().length > 0 ? value : "-";
    }
    return "-";
  }, [assetJobColumns, renderActions]);

  const columnFilterOptions = useMemo(() => {
    const next: Record<string, string[]> = {};
    const ensure = (key: string, value: string) => {
      if (!next[key]) next[key] = [];
      if (!next[key].includes(value)) next[key].push(value);
    };
    for (const { asset, capture, mergedCells } of rows) {
      ensure("assetTag", getColumnFilterValue("assetTag", asset, capture, mergedCells));
      ensure("status", getColumnFilterValue("status", asset, capture, mergedCells));
      ensure("actions", getColumnFilterValue("actions", asset, capture, mergedCells));
      for (const column of assetJobColumns) {
        ensure(`asset-job:${column.id}`, getColumnFilterValue(`asset-job:${column.id}`, asset, capture, mergedCells));
      }
      for (const group of orderedGroups) {
        for (const column of group.columns) {
          ensure(`capture:${column.id}`, getColumnFilterValue(`capture:${column.id}`, asset, capture, mergedCells));
        }
      }
    }
    for (const key of Object.keys(next)) next[key].sort((a, b) => a.localeCompare(b));
    return next;
  }, [assetJobColumns, getColumnFilterValue, orderedGroups, rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(({ asset, capture, mergedCells }) => {
      if (!rowSearchMatch(capture, asset, query)) return false;
      for (const [key, selectedValues] of Object.entries(columnFilters)) {
        if (selectedValues.length === 0) continue;
        const value = getColumnFilterValue(key, asset, capture, mergedCells);
        if (!selectedValues.includes(value)) return false;
      }
      return true;
    });
  }, [columnFilters, getColumnFilterValue, rows, search]);

  const selectionEnabled = !hideSelectionColumn && Boolean(selectedAssetIds && onToggleAssetSelection && onToggleVisibleAssetSelection);
  const filteredAssetIds = useMemo(() => filteredRows.map(({ asset }) => asset.id), [filteredRows]);
  // Virtualization was originally scoped to web to limit the blast radius, which left the
  // constrained device rendering every row: a 150-asset job mounted 150 rows x every capture
  // column on a phone. Rows are a fixed CAPTURE_ROW_HEIGHT on both platforms and the native
  // full-screen dialog gives the virtualizer a bounded scroll container, so the same path is
  // safe here — and native's table is read-only, so no focused input can be unmounted by a
  // scroll.
  const shouldVirtualizeRows = filteredRows.length >= CAPTURE_VIRTUALIZE_MIN_ROWS;
  const tableBodyColSpan = visibleColumns.length + assetJobColumns.length + (selectionEnabled ? 4 : 3);
  const tableScrollMaxHeight = embedded
    ? (shouldVirtualizeRows ? "min(70vh, 720px)" : undefined)
    : (fullScreen ? "calc(100vh - 200px)" : "70vh");

  const selectedVisibleCount = useMemo(
    () => selectionEnabled ? filteredAssetIds.filter((id) => selectedAssetIds?.has(id) ?? false).length : 0,
    [filteredAssetIds, selectedAssetIds, selectionEnabled],
  );
  const allVisibleSelected = selectionEnabled && filteredAssetIds.length > 0 && selectedVisibleCount == filteredAssetIds.length;
  const partiallyVisibleSelected = selectionEnabled && selectedVisibleCount > 0 && selectedVisibleCount < filteredAssetIds.length;

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
      saveHiddenGroups(next);
      return next;
    });
  }, []);

  const toggleColumnFilterValue = useCallback((key: string, value: string) => {
    setColumnFilters((prev) => {
      const current = new Set(prev[key] ?? []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      return { ...prev, [key]: Array.from(current) };
    });
  }, []);

  const clearColumnFilter = useCallback((key: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: [] }));
  }, []);

  const renderHeaderLabel = useCallback((label: string, filterKey: string) => {
    const activeCount = columnFilters[filterKey]?.length ?? 0;
    return (
      <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.15} sx={{ width: "100%" }}>
        <Typography
          component="span"
          sx={{
            display: "block",
            whiteSpace: "pre-line",
            lineHeight: 1.25,
            minHeight: 24,
            flex: 1,
            color: "inherit",
          }}
        >
          {splitLabelIntoTwoLines(label)}
        </Typography>
        <IconButton
          size="small"
          sx={{ p: 0.2, color: activeCount > 0 ? "warning.light" : "inherit" }}
          onClick={(event) => setFilterMenu({ anchorEl: event.currentTarget, key: filterKey })}
        >
          <ArrowDropDown fontSize="small" />
        </IconButton>
      </Stack>
    );
  }, [columnFilters]);

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

  const canEditCaptureCell = useCallback((
    asset: ProjectAsset,
    column: ProjectCaptureColumn,
  ): boolean => {
    if (readOnly || !canEditCapture || !canEditAsset?.(asset)) return false;
    if (!column.stepId || !column.inputId || !isCaptureColumnEditable(column.inputType)) return false;
    const run = pickCaptureRun(runsMap[asset.id] ?? []);
    if (!run) return false;
    return canEditRun(run, userRole).data;
  }, [canEditAsset, canEditCapture, readOnly, runsMap, userRole]);

  const onPatchCell = useCallback((assetId: string, columnId: string, value: string) => {
    setCellPatches((prev) => ({ ...prev, [captureCellKey(assetId, columnId)]: value }));
  }, []);

  const saveCaptureCell = useCallback(async (
    asset: ProjectAsset,
    column: ProjectCaptureColumn,
    value: string,
  ) => {
    const run = pickCaptureRun(runsMap[asset.id] ?? []);
    if (!run || !column.stepId || !column.inputId) return;
    const patchKey = captureCellKey(asset.id, column.id);
    setCellError(null);
    try {
      const updated = await assetWorkflowRunService.patchCaptureCell(
        run.id,
        {
          stepId: column.stepId,
          inputId: column.inputId,
          iterationIndex: column.iterationIndex,
        },
        value,
        currentUserName || undefined,
        column.fieldLabel,
      );
      onRunUpdated?.(updated);
    } catch {
      setCellPatches((prev) => {
        const next = { ...prev };
        delete next[patchKey];
        return next;
      });
      setCellError(`Could not save ${asset.assetTag} · ${column.fieldLabel}. Try again.`);
      throw new Error("capture cell save failed");
    }
  }, [currentUserName, onRunUpdated, runsMap]);

  const virtualRowProps = useMemo(() => ({
    orderedGroups,
    assetJobColumns,
    selectionEnabled,
    onToggleAssetSelection,
    editableForColumn: canEditCaptureCell,
    onSaveCell: saveCaptureCell,
    onPatchCell: onPatchCell,
    renderStatus,
    renderActions,
  }), [
    assetJobColumns,
    canEditCaptureCell,
    onPatchCell,
    onToggleAssetSelection,
    orderedGroups,
    renderActions,
    renderStatus,
    saveCaptureCell,
    selectionEnabled,
  ]);

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

      {cellError && (
        <Alert severity="error" onClose={() => setCellError(null)} sx={{ py: 0.25 }}>
          {cellError}
        </Alert>
      )}

      {!readOnly && canEditCapture && (
        <Typography variant="caption" color="text.secondary">
          Editable cells: Admin / PM / Supervisor may correct captured text before customer sign-off. Installers and other roles are read-only after installer sign-off.
        </Typography>
      )}

      {captureRunsError && (
        <Alert severity="error" sx={{ py: 0.25 }}>
          {captureRunsError}
        </Alert>
      )}

      {captureRunsLoading && visibleGroups.length === 0 && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
          <CircularProgress size={18} />
          <Typography variant="caption" color="text.secondary">
            Loading capture columns…
          </Typography>
        </Stack>
      )}

      {visibleGroups.length === 0 && !captureRunsLoading && (
        <Alert severity={table.columns.length > 0 ? 'warning' : 'info'}>
          {table.columns.length > 0
            ? 'Capture columns are currently hidden by saved column preferences. The page has reset invalid saved keys automatically; if you still only see the four fixed columns, hard-refresh this tab.'
            : `No capture columns could be derived from the loaded runs. Loaded ${runDiagnostics.totalRuns} runs, ${runDiagnostics.runsWithSnapshot} with workflow snapshots, ${runDiagnostics.runsWithResults} with step results.`}
        </Alert>
      )}

      <Box
        ref={scrollContainerRef}
        sx={{
          overflow: "auto",
          maxHeight: tableScrollMaxHeight,
          WebkitOverflowScrolling: "touch",
          color: ASSET_JOB_PALETTE.text,
        }}
      >
        <Table size="small" stickyHeader sx={{ minWidth: 760, borderCollapse: "separate", borderSpacing: 0, color: ASSET_JOB_PALETTE.text }}>
          <TableHead sx={{ position: "relative", zIndex: HEADER_Z.row1 }}>
            <TableRow ref={headerRow1Ref}>
              {selectionEnabled && (
                <TableCell
                  rowSpan={3}
                  padding="checkbox"
                  sx={{
                    ...stickyCell(0, CHECKBOX_W, HEADER_Z.corner),
                    top: headerStickyTops.name,
                    fontWeight: 700,
                    bgcolor: STATIC_HEADER_BG,
                    color: STATIC_HEADER_TEXT,
                    borderRight: `1px solid ${STATIC_HEADER_BORDER}`,
                    borderBottom: `2px solid ${STATIC_HEADER_BORDER}`,
                    minWidth: CHECKBOX_W,
                    width: CHECKBOX_W,
                    maxWidth: CHECKBOX_W,
                  }}
                >
                  <Checkbox
                    size="small"
                    indeterminate={partiallyVisibleSelected}
                    checked={allVisibleSelected}
                    onChange={(event) => onToggleVisibleAssetSelection?.(filteredAssetIds, event.target.checked)}
                    disabled={filteredAssetIds.length === 0}
                    sx={{ color: STATIC_HEADER_TEXT, '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: STATIC_HEADER_TEXT } }}
                  />
                </TableCell>
              )}
              <TableCell
                rowSpan={3}
                sx={{
                  ...stickyCell(selectionEnabled ? CHECKBOX_W : 0, TAG_W, HEADER_Z.corner),
                  top: headerStickyTops.name,
                  fontWeight: 700,
                  bgcolor: STATIC_HEADER_BG,
                  color: STATIC_HEADER_TEXT,
                  borderRight: `2px solid ${STATIC_HEADER_BORDER}`,
                  borderBottom: `2px solid ${STATIC_HEADER_BORDER}`,
                  minWidth: TAG_W,
                  width: TAG_W,
                  maxWidth: TAG_W,
                }}
              >
                {renderHeaderLabel("Asset Tag", "assetTag")}
              </TableCell>
              {assetJobColumns.length > 0 && (
                <TableCell
                  key="asset-job:name"
                  align="center"
                  colSpan={assetJobColumns.length}
                  sx={{
                    top: headerStickyTops.name,
                    position: "sticky",
                    zIndex: HEADER_Z.row1,
                    bgcolor: ASSET_JOB_PALETTE.header,
                    color: "common.white",
                    fontWeight: 700,
                    border: `2px solid ${ASSET_JOB_PALETTE.border}`,
                    minWidth: assetJobColumns.length * ASSET_JOB_COL_W,
                  }}
                >
                  ASSET & JOB
                </TableCell>
              )}
              {orderedGroups.map((group) => {
                const palette = groupPalette(group);
                return (
                  <TableCell
                    key={`${group.key}:name`}
                    align="center"
                    colSpan={group.columns.length}
                    sx={{
                      top: headerStickyTops.name,
                      position: "sticky",
                      zIndex: HEADER_Z.row1,
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
              <TableCell
                rowSpan={3}
                sx={{
                  top: headerStickyTops.name,
                  position: "sticky",
                  zIndex: HEADER_Z.corner,
                  minWidth: STATUS_W,
                  width: STATUS_W,
                  maxWidth: STATUS_W,
                  fontWeight: 700,
                  bgcolor: STATIC_HEADER_BG,
                  color: STATIC_HEADER_TEXT,
                  borderLeft: `2px solid ${STATIC_HEADER_BORDER}`,
                  borderBottom: `2px solid ${STATIC_HEADER_BORDER}`,
                }}
              >
                {renderHeaderLabel("Status", "status")}
              </TableCell>
              <TableCell
                rowSpan={3}
                sx={{
                  top: headerStickyTops.name,
                  position: "sticky",
                  zIndex: HEADER_Z.corner,
                  minWidth: ACTIONS_W,
                  width: ACTIONS_W,
                  maxWidth: ACTIONS_W,
                  fontWeight: 700,
                  bgcolor: STATIC_HEADER_BG,
                  color: STATIC_HEADER_TEXT,
                  borderLeft: `1px solid ${STATIC_HEADER_BORDER}`,
                  borderBottom: `2px solid ${STATIC_HEADER_BORDER}`,
                }}
              >
                {renderHeaderLabel("Actions", "actions")}
              </TableCell>
            </TableRow>
            <TableRow ref={headerRow2Ref}>
              {assetJobColumns.length > 0 && (
                <TableCell
                  key="asset-job:pn"
                  align="center"
                  colSpan={assetJobColumns.length}
                  sx={{
                    top: headerStickyTops.pn,
                    position: "sticky",
                    zIndex: HEADER_Z.row2,
                    bgcolor: ASSET_JOB_PALETTE.subHeader,
                    color: ASSET_JOB_PALETTE.text,
                    fontWeight: 700,
                    borderLeft: `2px solid ${ASSET_JOB_PALETTE.border}`,
                    borderRight: `2px solid ${ASSET_JOB_PALETTE.border}`,
                    borderBottom: `1px solid ${ASSET_JOB_PALETTE.border}`,
                  }}
                >
                  Project and workflow context
                </TableCell>
              )}
              {orderedGroups.map((group) => {
                const palette = groupPalette(group);
                const pnText = group.groupType === "general"
                  ? "Shared fields"
                  : (group.businessPartNumber
                      ? `P/N: ${group.businessPartNumber}${group.manufacturerPartNumber && group.manufacturerPartNumber !== group.businessPartNumber ? ` | Mfr: ${group.manufacturerPartNumber}` : ""}`
                      : (group.manufacturerPartNumber ? `Mfr: ${group.manufacturerPartNumber}` : "P/N: -"));
                return (
                  <TableCell
                    key={`${group.key}:pn`}
                    align="center"
                    colSpan={group.columns.length}
                    sx={{
                      top: headerStickyTops.pn,
                      position: "sticky",
                      zIndex: HEADER_Z.row2,
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
              {assetJobColumns.map((column, index) => (
                <TableCell
                  key={column.id}
                  align="center"
                  sx={{
                    top: headerStickyTops.fields,
                    position: "sticky",
                    zIndex: HEADER_Z.row3,
                    bgcolor: ASSET_JOB_PALETTE.subHeader,
                    color: ASSET_JOB_PALETTE.text,
                    fontWeight: 700,
                    fontSize: 11.5,
                    minWidth: ASSET_JOB_COL_W,
                    borderLeft: index === 0 ? `2px solid ${ASSET_JOB_PALETTE.border}` : "1px solid #D8DEE7",
                    borderRight: index === assetJobColumns.length - 1 ? `2px solid ${ASSET_JOB_PALETTE.border}` : "1px solid #D8DEE7",
                    borderBottom: `2px solid ${ASSET_JOB_PALETTE.border}`,
                    px: 0.75,
                    py: 0.5,
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      display: "block",
                      whiteSpace: "pre-line",
                      lineHeight: 1.25,
                      minHeight: 26,
                    }}
                  >
                    {renderHeaderLabel(column.label, `asset-job:${column.id}`)}
                  </Typography>
                </TableCell>
              ))}
              {orderedGroups.map((group) => {
                const palette = groupPalette(group);
                return group.columns.map((column, index) => (
                  <TableCell
                    key={column.id}
                    align="center"
                    sx={{
                      top: headerStickyTops.fields,
                      position: "sticky",
                      zIndex: HEADER_Z.row3,
                      bgcolor: solidFieldHeaderBg(group),
                      color: palette.border,
                      fontWeight: 700,
                      fontSize: 11.5,
                      minWidth: CAPTURE_COL_W,
                      borderLeft: index === 0 ? `2px solid ${palette.border}` : "1px solid #D8DEE7",
                      borderRight: index === group.columns.length - 1 ? `2px solid ${palette.border}` : "1px solid #D8DEE7",
                      borderBottom: `2px solid ${palette.border}`,
                      boxShadow: "0 2px 4px rgba(15, 23, 42, 0.12)",
                    }}
                  >
                    <Typography
                      component="span"
                      sx={{
                        display: "block",
                        whiteSpace: "pre-line",
                        lineHeight: 1.2,
                        minHeight: 24,
                        color: palette.border,
                      }}
                    >
                      {renderHeaderLabel(column.displayLabel, `capture:${column.id}`)}
                    </Typography>
                  </TableCell>
                ));
              })}
            </TableRow>
          </TableHead>
          {filteredRows.length === 0 ? (
            <TableBody sx={{ position: "relative", zIndex: 0 }}>
              <TableRow>
                <TableCell colSpan={tableBodyColSpan}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    No assets match.
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          ) : shouldVirtualizeRows ? (
            <CaptureVirtualizedTableBody
              scrollRef={scrollContainerRef}
              rows={filteredRows}
              colSpan={tableBodyColSpan}
              selectedAssetIds={selectedAssetIds}
              rowProps={virtualRowProps}
            />
          ) : (
            <TableBody sx={{ position: "relative", zIndex: 0 }}>
              {filteredRows.map(({ asset, capture, mergedCells }, rowIndex) => (
                <CaptureSpreadsheetRow
                  key={asset.id}
                  asset={asset}
                  capture={capture}
                  rowIndex={rowIndex}
                  orderedGroups={orderedGroups}
                  assetJobColumns={assetJobColumns}
                  mergedCells={mergedCells}
                  selectionEnabled={selectionEnabled}
                  isSelected={selectedAssetIds?.has(asset.id) ?? false}
                  onToggleAssetSelection={onToggleAssetSelection}
                  editableForColumn={canEditCaptureCell}
                  onSaveCell={saveCaptureCell}
                  onPatchCell={onPatchCell}
                  renderStatus={renderStatus}
                  renderActions={renderActions}
                />
              ))}
            </TableBody>
          )}
        </Table>
      </Box>

      <Menu
        anchorEl={filterMenu.anchorEl}
        open={Boolean(filterMenu.anchorEl)}
        onClose={() => setFilterMenu({ anchorEl: null, key: "" })}
      >
        <MenuItem
          onClick={() => {
            if (filterMenu.key) clearColumnFilter(filterMenu.key);
            setFilterMenu({ anchorEl: null, key: "" });
          }}
        >
          Clear filter
        </MenuItem>
        {(columnFilterOptions[filterMenu.key] ?? []).length === 0 && (
          <MenuItem disabled>No values</MenuItem>
        )}
        {(columnFilterOptions[filterMenu.key] ?? []).map((option) => {
          const selected = (columnFilters[filterMenu.key] ?? []).includes(option);
          return (
            <MenuItem key={`${filterMenu.key}-${option}`} onClick={() => toggleColumnFilterValue(filterMenu.key, option)}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 180 }}>
                <Checkbox size="small" checked={selected} sx={{ p: 0 }} />
                <Typography variant="body2">{option}</Typography>
              </Stack>
            </MenuItem>
          );
        })}
      </Menu>
    </Stack>
  );

  const themedInner = (
    <ThemeProvider theme={captureSpreadsheetTheme}>
      {inner}
    </ThemeProvider>
  );

  if (embedded) {
    if (!open) return null;
    return <Paper className="glass-card" sx={{ overflow: "hidden", p: 1.5 }}>{themedInner}</Paper>;
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
        {themedInner}
      </DialogContent>
    </Dialog>
  );
}



