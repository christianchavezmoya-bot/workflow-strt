import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftOutlined,
  ChevronRightOutlined,
  FileDownloadOutlined,
  FolderZipOutlined,
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
  InputAdornment,
  InputLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import {
  buildWorkflowReportPdfBlob,
  downloadWorkflowReportsAsSeparateFiles,
  downloadWorkflowReportsAsZip,
  type WorkflowReportDownloadItem,
} from "../../utils/bulkWorkflowReportDownload";
import type { WorkflowReportExportContext } from "../../utils/workflowReportExport";
import {
  classifyWorkflowReportSignature,
  matchesWorkflowReportSignatureFilter,
  WORKFLOW_REPORT_SIGNATURE_FILTER_OPTIONS,
  workflowReportSignatureBucketLabel,
  type WorkflowReportSignatureFilter,
} from "../../utils/workflowReportSignatureFilter";

type LoadedReportEntry = {
  asset: ProjectAsset;
  context: WorkflowReportExportContext;
  previewUrl: string;
  blob: Blob;
  bucket: ReturnType<typeof classifyWorkflowReportSignature>;
};

export type BulkWorkflowReportDialogProps = {
  open: boolean;
  onClose: () => void;
  assets: ProjectAsset[];
  buildReportContext: (asset: ProjectAsset) => Promise<WorkflowReportExportContext>;
  zipFileName?: string;
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
}: BulkWorkflowReportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LoadedReportEntry[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [signatureFilter, setSignatureFilter] = useState<WorkflowReportSignatureFilter>("all");
  const [downloading, setDownloading] = useState<"separate" | "zip" | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const buildReportContextRef = useRef(buildReportContext);
  buildReportContextRef.current = buildReportContext;

  const revokePreviewUrls = useCallback(() => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current = [];
  }, []);

  const loadReports = useCallback(async () => {
    if (assets.length === 0) return;
    revokePreviewUrls();
    setEntries([]);
    setActiveAssetId(null);
    setLoadError(null);
    setLoading(true);
    setLoadProgress({ done: 0, total: assets.length });

    const loaded: LoadedReportEntry[] = [];
    const failures: string[] = [];

    await Promise.all(
      assets.map(async (asset) => {
        try {
          const context = await buildReportContextRef.current(asset);
          const blob = await buildWorkflowReportPdfBlob(context);
          const previewUrl = URL.createObjectURL(blob);
          previewUrlsRef.current.push(previewUrl);
          loaded.push({
            asset,
            context,
            previewUrl,
            blob,
            bucket: classifyWorkflowReportSignature(context.run, context.signatureEvents),
          });
        } catch (err) {
          console.error("[BulkWorkflowReportDialog] Failed to load report", asset.id, err);
          failures.push(assetExplorerLabel(asset));
        } finally {
          setLoadProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        }
      }),
    );

    loaded.sort((a, b) => assetExplorerLabel(a.asset).localeCompare(assetExplorerLabel(b.asset), undefined, { numeric: true }));
    setEntries(loaded);
    setActiveAssetId(loaded[0]?.asset.id ?? null);
    if (loaded.length === 0) {
      setLoadError(failures.length > 0 ? `Failed to load reports for: ${failures.join(", ")}` : "No reports could be loaded.");
    } else if (failures.length > 0) {
      setLoadError(`Loaded ${loaded.length} report(s). Failed for: ${failures.join(", ")}`);
    }
    setLoading(false);
  }, [assets, revokePreviewUrls]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setSignatureFilter("all");
    void loadReports();
  }, [open, assets, loadReports]);

  useEffect(() => () => revokePreviewUrls(), [revokePreviewUrls]);

  const filteredExplorerEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.asset.assetTag,
        entry.asset.assetName,
        entry.asset.serialNumber,
        entry.asset.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, searchQuery]);

  const activeIndex = useMemo(
    () => filteredExplorerEntries.findIndex((entry) => entry.asset.id === activeAssetId),
    [filteredExplorerEntries, activeAssetId],
  );

  const activeEntry = activeIndex >= 0 ? filteredExplorerEntries[activeIndex] : null;

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
    if (filteredExplorerEntries.length === 0) return;
    const current = filteredExplorerEntries.findIndex((entry) => entry.asset.id === activeAssetId);
    const base = current >= 0 ? current : 0;
    const next = (base + delta + filteredExplorerEntries.length) % filteredExplorerEntries.length;
    setActiveAssetId(filteredExplorerEntries[next]?.asset.id ?? null);
  }, [filteredExplorerEntries, activeAssetId]);

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

  function handleClose() {
    revokePreviewUrls();
    setEntries([]);
    setActiveAssetId(null);
    onClose();
  }

  function handleSignatureFilterChange(event: SelectChangeEvent<WorkflowReportSignatureFilter>) {
    setSignatureFilter(event.target.value as WorkflowReportSignatureFilter);
  }

  const progressPct = loadProgress.total > 0
    ? Math.round((loadProgress.done / loadProgress.total) * 100)
    : 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { height: "92vh" } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={1}>
          <Box>
            <Typography variant="h6" component="span">View / Print Reports</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {assets.length} selected asset{assets.length !== 1 ? "s" : ""} — all run types included
            </Typography>
          </Box>
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
          {/* Left explorer */}
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
                {filteredExplorerEntries.length} of {entries.length} shown
              </Typography>
            </Box>

            <List dense disablePadding sx={{ flex: 1, overflowY: "auto" }}>
              {filteredExplorerEntries.map((entry) => {
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
                            <Chip
                              size="small"
                              label={entry.asset.status}
                              variant="outlined"
                              sx={{ height: 20, fontSize: 10 }}
                            />
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
                    />
                  </ListItemButton>
                );
              })}
              {!loading && filteredExplorerEntries.length === 0 && (
                <Box sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    {entries.length === 0 ? "No reports loaded." : "No assets match your search."}
                  </Typography>
                </Box>
              )}
            </List>
          </Box>

          {/* Right preview */}
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", bgcolor: "#525659" }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ px: 2, py: 1, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {activeEntry
                    ? `${assetExplorerLabel(activeEntry.asset)}${activeEntry.asset.assetName ? ` — ${activeEntry.asset.assetName}` : ""}`
                    : "Select an asset"}
                </Typography>
                {activeEntry && (
                  <Typography variant="caption" color="text.secondary">
                    {workflowReportSignatureBucketLabel(activeEntry.bucket)}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Button
                  size="small"
                  startIcon={<ChevronLeftOutlined />}
                  disabled={filteredExplorerEntries.length <= 1}
                  onClick={() => goToRelative(-1)}
                >
                  Prev
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 48, textAlign: "center" }}>
                  {activeIndex >= 0 ? `${activeIndex + 1} / ${filteredExplorerEntries.length}` : "—"}
                </Typography>
                <Button
                  size="small"
                  endIcon={<ChevronRightOutlined />}
                  disabled={filteredExplorerEntries.length <= 1}
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
              ) : activeEntry?.previewUrl ? (
                <Box
                  component="iframe"
                  title={`Report preview — ${assetExplorerLabel(activeEntry.asset)}`}
                  src={activeEntry.previewUrl}
                  sx={{ width: "100%", height: "100%", border: 0, bgcolor: "common.white" }}
                />
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
  );
}
