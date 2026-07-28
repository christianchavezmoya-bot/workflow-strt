import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftOutlined,
  ChevronRightOutlined,
  EmailOutlined,
  FileDownloadOutlined,
  FolderZipOutlined,
  PrintOutlined,
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import {
  BULK_REPORT_EXPLORER_SORT_OPTIONS,
  sortBulkReportExplorerEntries,
  type BulkReportExplorerSortKey,
} from "../../utils/bulkReportExplorerSort";
import {
  buildWorkflowReportPdfBlob,
  downloadBlob,
  downloadWorkflowReportsAsSeparateFiles,
  downloadWorkflowReportsAsZip,
  workflowReportPdfFileName,
  type WorkflowReportDownloadItem,
} from "../../utils/bulkWorkflowReportDownload";
import { openObjectUrl } from "../../utils/printWindow";
import type { WorkflowReportExportContext } from "../../utils/workflowReportExport";
import {
  classifyWorkflowReportSignature,
  matchesWorkflowReportSignatureFilter,
  WORKFLOW_REPORT_SIGNATURE_FILTER_OPTIONS,
  workflowReportSignatureBucketLabel,
  type WorkflowReportSignatureFilter,
} from "../../utils/workflowReportSignatureFilter";
import { AssetReportShareDialog } from "./AssetReportShareDialog";

type LoadedReportEntry = {
  asset: ProjectAsset;
  context: WorkflowReportExportContext;
  previewUrl: string;
  blob: Blob;
  bucket: ReturnType<typeof classifyWorkflowReportSignature>;
};

type FailedReportEntry = {
  asset: ProjectAsset;
  error?: string;
  retrying?: boolean;
};

type ExplorerRow =
  | { kind: "loaded"; entry: LoadedReportEntry }
  | { kind: "failed"; failed: FailedReportEntry };

export type BulkWorkflowReportDialogProps = {
  open: boolean;
  onClose: () => void;
  assets: ProjectAsset[];
  buildReportContext: (asset: ProjectAsset) => Promise<WorkflowReportExportContext>;
  zipFileName?: string;
  projectId?: string;
  jobLabel?: string;
  users?: User[];
  canShareReports?: boolean;
};

function assetExplorerLabel(asset: ProjectAsset): string {
  return asset.assetTag || asset.assetName || asset.serialNumber || asset.id;
}

function assetExplorerSecondary(asset: ProjectAsset): string | undefined {
  const parts = [asset.assetName, asset.serialNumber].filter(Boolean);
  if (parts.length === 0) return undefined;
  if (asset.assetTag && parts[0] === asset.assetName) {
    return asset.serialNumber || undefined;
  }
  return parts.join(" · ");
}

function bucketChipColor(
  bucket: LoadedReportEntry["bucket"],
): "default" | "info" | "warning" | "success" | "error" {
  switch (bucket) {
    case "completed-all-signatures": return "success";
    case "completed-installer-signed": return "info";
    case "completed-no-signatures": return "warning";
    case "in-progress": return "info";
    case "not-started": return "default";
    case "no-workflow": return "default";
    default: return "default";
  }
}

export function BulkWorkflowReportDialog({
  open,
  onClose,
  assets,
  buildReportContext,
  zipFileName = "workflow-reports",
  projectId,
  jobLabel,
  users = [],
  canShareReports = false,
}: BulkWorkflowReportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LoadedReportEntry[]>([]);
  const [failedEntries, setFailedEntries] = useState<FailedReportEntry[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<BulkReportExplorerSortKey>("tag");
  const [signatureFilter, setSignatureFilter] = useState<WorkflowReportSignatureFilter>("all");
  const [downloading, setDownloading] = useState<"separate" | "zip" | "current" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const previewUrlsRef = useRef<string[]>([]);
  const buildReportContextRef = useRef(buildReportContext);
  buildReportContextRef.current = buildReportContext;

  const revokePreviewUrls = useCallback(() => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current = [];
  }, []);

  const loadSingleAsset = useCallback(async (asset: ProjectAsset): Promise<LoadedReportEntry> => {
    const context = await buildReportContextRef.current(asset);
    const blob = await buildWorkflowReportPdfBlob(context);
    const previewUrl = URL.createObjectURL(blob);
    previewUrlsRef.current.push(previewUrl);
    return {
      asset,
      context,
      previewUrl,
      blob,
      bucket: classifyWorkflowReportSignature(context.run, context.signatureEvents),
    };
  }, []);

  const loadReports = useCallback(async () => {
    if (assets.length === 0) return;
    revokePreviewUrls();
    setEntries([]);
    setFailedEntries([]);
    setActiveAssetId(null);
    setLoadError(null);
    setLoading(true);
    setLoadProgress({ done: 0, total: assets.length });

    const loaded: LoadedReportEntry[] = [];
    const failed: FailedReportEntry[] = [];

    await Promise.all(
      assets.map(async (asset) => {
        try {
          loaded.push(await loadSingleAsset(asset));
        } catch (err) {
          console.error("[BulkWorkflowReportDialog] Failed to load report", asset.id, err);
          failed.push({ asset, error: "Failed to generate report" });
        } finally {
          setLoadProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        }
      }),
    );

    setEntries(loaded);
    setFailedEntries(failed);
    const firstId = loaded[0]?.asset.id ?? failed[0]?.asset.id ?? null;
    setActiveAssetId(firstId);
    if (loaded.length === 0) {
      setLoadError(failed.length > 0 ? "No reports could be loaded. Use Retry on failed assets below." : "No reports could be loaded.");
    } else if (failed.length > 0) {
      setLoadError(`Loaded ${loaded.length} report(s). ${failed.length} failed — retry individually from the explorer.`);
    }
    setLoading(false);
  }, [assets, loadSingleAsset, revokePreviewUrls]);

  const retryFailedAsset = useCallback(async (asset: ProjectAsset) => {
    setFailedEntries((prev) => prev.map((item) => (
      item.asset.id === asset.id ? { ...item, retrying: true, error: undefined } : item
    )));
    try {
      const loaded = await loadSingleAsset(asset);
      setFailedEntries((prev) => prev.filter((item) => item.asset.id !== asset.id));
      setEntries((prev) => [...prev, loaded]);
      setActiveAssetId(asset.id);
      setLoadError((prev) => (prev?.includes("failed") ? `Loaded report for ${assetExplorerLabel(asset)}.` : prev));
    } catch (err) {
      console.error("[BulkWorkflowReportDialog] Retry failed", asset.id, err);
      setFailedEntries((prev) => prev.map((item) => (
        item.asset.id === asset.id ? { ...item, retrying: false, error: "Retry failed" } : item
      )));
    }
  }, [loadSingleAsset]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setSortKey("tag");
    setSignatureFilter("all");
    void loadReports();
  }, [open, assets, loadReports]);

  useEffect(() => () => revokePreviewUrls(), [revokePreviewUrls]);

  const explorerRows = useMemo((): ExplorerRow[] => {
    const combined: ExplorerRow[] = [
      ...entries.map((entry) => ({ kind: "loaded" as const, entry })),
      ...failedEntries.map((failed) => ({ kind: "failed" as const, failed })),
    ];
    const sortable = combined.map((row) => ({
      row,
      asset: row.kind === "loaded" ? row.entry.asset : row.failed.asset,
      bucket: row.kind === "loaded" ? row.entry.bucket : undefined,
      context: row.kind === "loaded" ? row.entry.context : undefined,
    }));
    return sortBulkReportExplorerEntries(sortable, sortKey).map((item) => item.row);
  }, [entries, failedEntries, sortKey]);

  const filteredExplorerRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return explorerRows;
    return explorerRows.filter((row) => {
      const asset = row.kind === "loaded" ? row.entry.asset : row.failed.asset;
      const haystack = [
        asset.assetTag,
        asset.assetName,
        asset.serialNumber,
        asset.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [explorerRows, searchQuery]);

  const activeIndex = useMemo(
    () => filteredExplorerRows.findIndex((row) => {
      const assetId = row.kind === "loaded" ? row.entry.asset.id : row.failed.asset.id;
      return assetId === activeAssetId;
    }),
    [filteredExplorerRows, activeAssetId],
  );

  const activeLoadedEntry = useMemo(() => {
    const row = filteredExplorerRows.find((item) => {
      if (item.kind !== "loaded") return false;
      return item.entry.asset.id === activeAssetId;
    });
    return row?.kind === "loaded" ? row.entry : null;
  }, [filteredExplorerRows, activeAssetId]);

  const downloadMatchCount = useMemo(
    () => entries.filter((entry) => matchesWorkflowReportSignatureFilter(entry.bucket, signatureFilter)).length,
    [entries, signatureFilter],
  );

  const filteredDownloadItems = useMemo((): WorkflowReportDownloadItem[] => {
    return entries
      .filter((entry) => matchesWorkflowReportSignatureFilter(entry.bucket, signatureFilter))
      .map((entry) => ({ context: entry.context, blob: entry.blob }));
  }, [entries, signatureFilter]);

  const goToRelative = useCallback((delta: number) => {
    if (filteredExplorerRows.length === 0) return;
    const current = filteredExplorerRows.findIndex((row) => {
      const assetId = row.kind === "loaded" ? row.entry.asset.id : row.failed.asset.id;
      return assetId === activeAssetId;
    });
    const base = current >= 0 ? current : 0;
    const next = (base + delta + filteredExplorerRows.length) % filteredExplorerRows.length;
    const target = filteredExplorerRows[next];
    if (!target) return;
    setActiveAssetId(target.kind === "loaded" ? target.entry.asset.id : target.failed.asset.id);
  }, [filteredExplorerRows, activeAssetId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goToRelative(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        goToRelative(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, goToRelative]);

  async function handleDownloadSeparate() {
    if (filteredDownloadItems.length === 0) return;
    setDownloading("separate");
    try {
      await downloadWorkflowReportsAsSeparateFiles(filteredDownloadItems);
    } catch (err) {
      console.error("[BulkWorkflowReportDialog] Separate download failed", err);
      alert("Failed to download reports.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadZip() {
    if (filteredDownloadItems.length === 0) return;
    setDownloading("zip");
    try {
      await downloadWorkflowReportsAsZip(filteredDownloadItems, zipFileName);
    } catch (err) {
      console.error("[BulkWorkflowReportDialog] ZIP download failed", err);
      alert("Failed to create ZIP archive.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadCurrent() {
    if (!activeLoadedEntry) return;
    setDownloading("current");
    try {
      downloadBlob(activeLoadedEntry.blob, workflowReportPdfFileName(activeLoadedEntry.context));
    } finally {
      setDownloading(null);
    }
  }

  function handlePrintCurrent() {
    if (!activeLoadedEntry?.previewUrl) return;
    openObjectUrl(activeLoadedEntry.previewUrl, { autoPrint: true });
  }

  function handleClose() {
    revokePreviewUrls();
    setEntries([]);
    setFailedEntries([]);
    setActiveAssetId(null);
    setShareOpen(false);
    onClose();
  }

  function handleSignatureFilterChange(event: SelectChangeEvent<WorkflowReportSignatureFilter>) {
    setSignatureFilter(event.target.value as WorkflowReportSignatureFilter);
  }

  function handleSortChange(event: SelectChangeEvent<BulkReportExplorerSortKey>) {
    setSortKey(event.target.value as BulkReportExplorerSortKey);
  }

  const progressPct = loadProgress.total > 0
    ? Math.round((loadProgress.done / loadProgress.total) * 100)
    : 0;

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { height: "92vh" } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ lg: "center" }} spacing={1}>
            <Box>
              <Typography variant="h6" component="span">View / Print Reports</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {assets.length} selected asset{assets.length !== 1 ? "s" : ""} — all run types included
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="bulk-report-sort-label">Sort explorer</InputLabel>
                <Select
                  labelId="bulk-report-sort-label"
                  label="Sort explorer"
                  value={sortKey}
                  onChange={handleSortChange}
                >
                  {BULK_REPORT_EXPLORER_SORT_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel id="bulk-report-signature-filter-label">Download filter</InputLabel>
                <Select
                  labelId="bulk-report-signature-filter-label"
                  label="Download filter"
                  value={signatureFilter}
                  onChange={handleSignatureFilterChange}
                >
                  {WORKFLOW_REPORT_SIGNATURE_FILTER_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ p: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {loading && (
            <Box sx={{ px: 2, pt: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">
                  Generating previews ({loadProgress.done}/{loadProgress.total})…
                </Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progressPct} />
            </Box>
          )}

          {loadError && (
            <Alert severity={entries.length > 0 ? "warning" : "error"} sx={{ mx: 2, mt: 1 }}>
              {loadError}
            </Alert>
          )}

          <Box sx={{ flex: 1, minHeight: 0, display: "flex", borderTop: "1px solid", borderColor: "divider" }}>
            <Box
              sx={{
                width: 320,
                flexShrink: 0,
                borderRight: "1px solid",
                borderColor: "divider",
                display: "flex",
                flexDirection: "column",
                bgcolor: "background.default",
              }}
            >
              <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search tag, name, serial…"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                  {filteredExplorerRows.length} shown · {entries.length} loaded · {failedEntries.length} failed
                </Typography>
              </Box>

              <List dense disablePadding sx={{ flex: 1, overflowY: "auto" }}>
                {filteredExplorerRows.map((row) => {
                  if (row.kind === "failed") {
                    const { failed } = row;
                    const selected = failed.asset.id === activeAssetId;
                    return (
                      <ListItem
                        key={`failed-${failed.asset.id}`}
                        disablePadding
                        secondaryAction={(
                          <Tooltip title="Retry generating this report">
                            <span>
                              <IconButton
                                edge="end"
                                size="small"
                                disabled={failed.retrying}
                                onClick={() => void retryFailedAsset(failed.asset)}
                              >
                                {failed.retrying ? <CircularProgress size={16} /> : <RefreshOutlined fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      >
                        <ListItemButton
                          selected={selected}
                          onClick={() => setActiveAssetId(failed.asset.id)}
                          sx={{ alignItems: "flex-start", py: 1, pr: 6 }}
                        >
                          <ListItemText
                            primary={(
                              <Typography variant="body2" fontWeight={600} noWrap color="error.main">
                                {assetExplorerLabel(failed.asset)}
                              </Typography>
                            )}
                            secondary={(
                              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                                <Typography variant="caption" color="error.main">
                                  {failed.error ?? "Failed to load"}
                                </Typography>
                                <Chip size="small" label="Retry needed" color="error" variant="outlined" sx={{ height: 20, fontSize: 10, alignSelf: "flex-start" }} />
                              </Stack>
                            )}
                            secondaryTypographyProps={{ component: "div" }}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  }

                  const { entry } = row;
                  const selected = entry.asset.id === activeAssetId;
                  const secondary = assetExplorerSecondary(entry.asset);
                  return (
                    <ListItemButton
                      key={entry.asset.id}
                      selected={selected}
                      onClick={() => setActiveAssetId(entry.asset.id)}
                      sx={{ alignItems: "flex-start", py: 1 }}
                    >
                      <ListItemText
                        primary={(
                          <Typography variant="body2" fontWeight={selected ? 700 : 600} noWrap>
                            {assetExplorerLabel(entry.asset)}
                          </Typography>
                        )}
                        secondary={(
                          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                            {secondary && (
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {secondary}
                              </Typography>
                            )}
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              <Chip size="small" label={entry.asset.status} variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                              <Chip
                                size="small"
                                label={workflowReportSignatureBucketLabel(entry.bucket)}
                                color={bucketChipColor(entry.bucket)}
                                variant="filled"
                                sx={{ height: 20, fontSize: 10 }}
                              />
                            </Stack>
                          </Stack>
                        )}
                        secondaryTypographyProps={{ component: "div" }}
                      />
                    </ListItemButton>
                  );
                })}
                {!loading && filteredExplorerRows.length === 0 && (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      {entries.length === 0 && failedEntries.length === 0 ? "No reports loaded." : "No assets match your search."}
                    </Typography>
                  </Box>
                )}
              </List>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", bgcolor: "#525659" }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 2, py: 1, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", gap: 1, flexWrap: "wrap" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {activeLoadedEntry
                      ? `${assetExplorerLabel(activeLoadedEntry.asset)}${activeLoadedEntry.asset.assetName ? ` — ${activeLoadedEntry.asset.assetName}` : ""}`
                      : activeAssetId && failedEntries.some((item) => item.asset.id === activeAssetId)
                        ? `${assetExplorerLabel(failedEntries.find((item) => item.asset.id === activeAssetId)!.asset)} — preview unavailable`
                        : "Select an asset"}
                  </Typography>
                  {activeLoadedEntry && (
                    <Typography variant="caption" color="text.secondary">
                      {workflowReportSignatureBucketLabel(activeLoadedEntry.bucket)}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    startIcon={<PrintOutlined fontSize="small" />}
                    disabled={!activeLoadedEntry}
                    onClick={handlePrintCurrent}
                  >
                    Print
                  </Button>
                  <Button
                    size="small"
                    startIcon={downloading === "current" ? <CircularProgress size={14} /> : <FileDownloadOutlined fontSize="small" />}
                    disabled={!activeLoadedEntry || downloading !== null}
                    onClick={() => void handleDownloadCurrent()}
                  >
                    Download current
                  </Button>
                  <Button
                    size="small"
                    startIcon={<ChevronLeftOutlined />}
                    disabled={filteredExplorerRows.length <= 1}
                    onClick={() => goToRelative(-1)}
                  >
                    Prev
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 48, textAlign: "center" }}>
                    {activeIndex >= 0 ? `${activeIndex + 1} / ${filteredExplorerRows.length}` : "—"}
                  </Typography>
                  <Button
                    size="small"
                    endIcon={<ChevronRightOutlined />}
                    disabled={filteredExplorerRows.length <= 1}
                    onClick={() => goToRelative(1)}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>

              <Box sx={{ flex: 1, minHeight: 0 }}>
                {loading ? (
                  <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: "100%", color: "common.white" }}>
                    <CircularProgress color="inherit" />
                    <Typography variant="body2">Building PDF previews…</Typography>
                  </Stack>
                ) : activeLoadedEntry?.previewUrl ? (
                  <Box
                    component="iframe"
                    title={`Report preview — ${assetExplorerLabel(activeLoadedEntry.asset)}`}
                    src={activeLoadedEntry.previewUrl}
                    sx={{ width: "100%", height: "100%", border: 0, bgcolor: "common.white" }}
                  />
                ) : activeAssetId && failedEntries.some((item) => item.asset.id === activeAssetId) ? (
                  <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: "100%", color: "common.white", px: 2 }}>
                    <Typography variant="body2" textAlign="center">
                      This report failed to generate. Use Retry in the explorer list.
                    </Typography>
                    <Button
                      variant="contained"
                      startIcon={<RefreshOutlined />}
                      onClick={() => {
                        const failed = failedEntries.find((item) => item.asset.id === activeAssetId);
                        if (failed) void retryFailedAsset(failed.asset);
                      }}
                    >
                      Retry now
                    </Button>
                  </Stack>
                ) : (
                  <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", color: "common.white" }}>
                    <Typography variant="body2">Select an asset from the explorer to preview its report.</Typography>
                  </Stack>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Download filter matches {downloadMatchCount} report{downloadMatchCount !== 1 ? "s" : ""}. Explorer shows all selected assets.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button onClick={handleClose}>Close</Button>
            {canShareReports && (
              <Button
                variant="outlined"
                startIcon={<EmailOutlined fontSize="small" />}
                disabled={loading || filteredDownloadItems.length === 0}
                onClick={() => setShareOpen(true)}
              >
                Email / Share
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={downloading === "separate" ? <CircularProgress size={14} /> : <FileDownloadOutlined fontSize="small" />}
              disabled={loading || downloading !== null || downloadMatchCount === 0}
              onClick={() => void handleDownloadSeparate()}
            >
              Download PDFs ({downloadMatchCount})
            </Button>
            <Button
              variant="contained"
              startIcon={downloading === "zip" ? <CircularProgress size={14} /> : <FolderZipOutlined fontSize="small" />}
              disabled={loading || downloading !== null || downloadMatchCount === 0}
              onClick={() => void handleDownloadZip()}
            >
              Download ZIP ({downloadMatchCount})
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <AssetReportShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        projectId={projectId}
        jobLabel={jobLabel}
        users={users}
        reportContexts={filteredDownloadItems.map((item) => item.context)}
        buildReportContext={buildReportContext}
      />
    </>
  );
}
