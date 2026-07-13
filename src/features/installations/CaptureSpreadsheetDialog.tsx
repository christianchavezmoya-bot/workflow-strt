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
import type { CaptureColumnDef, CaptureAssetRow } from "../../utils/captureSpreadsheet";
import {
  buildCaptureColumns,
  buildCaptureRow,
  computeMaxUnitsByFeature,
  listColumnGroups,
  patchStepResultValue,
} from "../../utils/captureSpreadsheet";
import type { FeatureSelection } from "../../services/productConfigService";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { STATUS_LABELS, STATUS_COLORS } from "./assetStatusDisplay";

export type CaptureSpreadsheetDialogProps = {
  open: boolean;
  onClose: () => void;
  fullScreen?: boolean;
  /** When true, renders inline (no Dialog) for web Capture view on Assets page */
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

function loadHiddenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_HIDDEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

export default function CaptureSpreadsheetDialog({
  open,
  onClose,
  fullScreen = false,
  embedded = false,
  assets,
  runsMap,
  features,
  depsByFeature,
  featureSelectionsByConfig,
  activeCountForAsset,
  readOnly = false,
  canEditCapture = false,
  canEditAsset,
  onRunUpdated,
  renderStatus,
  renderActions,
}: CaptureSpreadsheetDialogProps) {
  const [search, setSearch] = useState("");
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(loadHiddenGroups);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [highlightTerm, setHighlightTerm] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setHighlightTerm("");
      setSelectedAssetIds(new Set());
    }
  }, [open]);

  const maxUnits = useMemo(
    () => computeMaxUnitsByFeature(featureSelectionsByConfig),
    [featureSelectionsByConfig],
  );

  const allColumns = useMemo(
    () => buildCaptureColumns(features, depsByFeature, maxUnits, new Set()),
    [features, depsByFeature, maxUnits],
  );

  const visibleColumns = useMemo(
    () => buildCaptureColumns(features, depsByFeature, maxUnits, hiddenGroups),
    [features, depsByFeature, maxUnits, hiddenGroups],
  );

  const columnGroups = useMemo(() => listColumnGroups(allColumns), [allColumns]);

  const rows = useMemo((): { asset: ProjectAsset; capture: CaptureAssetRow }[] => {
    return assets.map((asset) => {
      const runs = runsMap[asset.id] ?? [];
      const run = runs.slice().sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      const capture = buildCaptureRow(
        asset.id,
        run,
        visibleColumns,
        features,
        activeCountForAsset(asset),
      );
      return { asset, capture };
    });
  }, [assets, runsMap, visibleColumns, features, activeCountForAsset]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (selectedAssetIds.size > 0) {
      list = list.filter((r) => selectedAssetIds.has(r.asset.id));
    }
    const q = search.trim().toLowerCase();
    if (q.length >= 2) {
      list = list.filter(({ asset, capture }) => {
        const base = [asset.assetTag, asset.assetName, asset.serialNumber ?? ""].join(" ").toLowerCase();
        return base.includes(q) || capture.searchText.includes(q);
      });
    }
    return list;
  }, [rows, search, selectedAssetIds]);

  const toggleHiddenGroup = useCallback((key: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleSearchHighlight = useCallback(() => {
    setHighlightTerm(search.trim().toLowerCase());
  }, [search]);

  const isHighlighted = (text: string) => {
    if (!highlightTerm || highlightTerm.length < 2) return false;
    return text.toLowerCase().includes(highlightTerm);
  };

  const handleCellBlur = async (
    asset: ProjectAsset,
    col: CaptureColumnDef,
    capture: CaptureAssetRow,
    newValue: string,
  ) => {
    if (readOnly || !canEditCapture) return;
    if (col.kind !== "dependency-capture") return;
    if (capture.customerFinalized) return;
    if (canEditAsset && !canEditAsset(asset)) return;
    const cell = capture.cells[col.id];
    if (!cell?.binding || !capture.runId) return;
    if (cell.value === newValue) return;

    const runs = runsMap[asset.id] ?? [];
    const run = runs.find((r) => r.id === capture.runId);
    if (!run) return;

    setSavingCell(col.id);
    try {
      const patched = patchStepResultValue(run.stepResultsJson, cell.binding, newValue);
      const updated = await assetWorkflowRunService.patchStepResults(
        run.id,
        patched,
        undefined,
        true,
      );
      onRunUpdated?.(updated);
    } catch {
      /* ignore */
    } finally {
      setSavingCell(null);
    }
  };

  const defaultStatus = (asset: ProjectAsset) => (
    <Chip
      size="small"
      label={STATUS_LABELS[asset.status] ?? asset.status}
      color={STATUS_COLORS[asset.status] ?? "default"}
      sx={{ height: 20, fontSize: 10 }}
    />
  );

  const inner = (
    <Stack spacing={1.5} sx={embedded ? { width: "100%" } : undefined}>
      {!embedded && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            placeholder="Search P/N, serial, firmware, feature…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearchHighlight(); }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Button size="small" variant="outlined" onClick={handleSearchHighlight}>
            Highlight
          </Button>
          <Button size="small" variant="contained" onClick={onClose}>
            Close
          </Button>
        </Stack>
      )}

      {embedded && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            placeholder="Search captures (P/N, serial, firmware…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearchHighlight(); }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1, minWidth: 180, maxWidth: 360 }}
          />
          <Button size="small" variant="outlined" onClick={handleSearchHighlight}>Highlight</Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ViewColumnOutlined fontSize="small" />}
            onClick={() => setColumnPickerOpen((v) => !v)}
          >
            Columns
          </Button>
        </Stack>
      )}

      {columnPickerOpen && (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "rgba(255,255,255,0.04)", maxHeight: 160, overflowY: "auto" }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                Toggle columns (alphabetical)
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {columnGroups.map((g) => (
                  <FormControlLabel
                    key={g.key}
                    control={
                      <Checkbox
                        size="small"
                        checked={!hiddenGroups.has(g.key)}
                        onChange={() => toggleHiddenGroup(g.key)}
                      />
                    }
                    label={<Typography variant="caption">{g.label}</Typography>}
                  />
                ))}
              </Stack>
            </Box>
          )}

          <Box sx={{ overflow: "auto", maxHeight: embedded ? undefined : (fullScreen ? "calc(100vh - 200px)" : "70vh") }}>
            <Table size="small" stickyHeader sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 36, bgcolor: "background.paper" }}>
                    <Checkbox
                      size="small"
                      indeterminate={selectedAssetIds.size > 0 && selectedAssetIds.size < rows.length}
                      checked={rows.length > 0 && selectedAssetIds.size === rows.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedAssetIds(new Set(rows.map((r) => r.asset.id)));
                        else setSelectedAssetIds(new Set());
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ bgcolor: "background.paper", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
                    Asset Tag
                  </TableCell>
                  <TableCell sx={{ bgcolor: "background.paper", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
                    Asset Name
                  </TableCell>
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.id}
                      sx={{ bgcolor: "background.paper", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap", minWidth: 90 }}
                    >
                      <Tooltip title={col.sortLabel}>
                        <span>{col.sortLabel}</span>
                      </Tooltip>
                    </TableCell>
                  ))}
                  <TableCell sx={{ bgcolor: "background.paper", fontWeight: 700, fontSize: 11 }}>Status</TableCell>
                  {renderActions && (
                    <TableCell sx={{ bgcolor: "background.paper", fontWeight: 700, fontSize: 11 }} align="right">
                      Actions
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 5}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                        No assets match.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map(({ asset, capture }) => (
                    <TableRow key={asset.id} hover>
                      <TableCell>
                        <Checkbox
                          size="small"
                          checked={selectedAssetIds.has(asset.id)}
                          onChange={(e) => {
                            setSelectedAssetIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(asset.id);
                              else next.delete(asset.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{asset.assetTag}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{asset.assetName || "—"}</Typography>
                      </TableCell>
                      {visibleColumns.map((col) => {
                        const cell = capture.cells[col.id];
                        const val = cell?.applicable === false ? "—" : (cell?.value || "");
                        const hl = isHighlighted(val) || isHighlighted(col.featureName) || isHighlighted(col.dependencyName ?? "");
                        const editable =
                          !readOnly &&
                          canEditCapture &&
                          col.kind === "dependency-capture" &&
                          !capture.customerFinalized &&
                          cell?.binding &&
                          (!canEditAsset || canEditAsset(asset));

                        return (
                          <TableCell
                            key={col.id}
                            sx={{
                              fontSize: 11,
                              bgcolor: hl ? "rgba(255, 235, 59, 0.22)" : undefined,
                              p: editable ? 0.25 : 1,
                            }}
                          >
                            {editable ? (
                              <TextField
                                size="small"
                                variant="standard"
                                defaultValue={val}
                                disabled={savingCell === col.id}
                                onBlur={(e) => void handleCellBlur(asset, col, capture, e.target.value.trim())}
                                InputProps={{ sx: { fontSize: 11 } }}
                                sx={{ minWidth: 80 }}
                              />
                            ) : (
                              <Typography
                                variant="caption"
                                color={val && val !== "—" ? "text.primary" : "text.disabled"}
                                fontStyle={val && val !== "—" ? "normal" : "italic"}
                              >
                                {val || (cell?.applicable === false ? "N/A" : "—")}
                              </Typography>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        {renderStatus ? renderStatus(asset) : defaultStatus(asset)}
                      </TableCell>
                      {renderActions && (
                        <TableCell align="right">{renderActions(asset)}</TableCell>
                      )}
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
          <Tooltip title="Show / hide feature & dependency columns">
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
