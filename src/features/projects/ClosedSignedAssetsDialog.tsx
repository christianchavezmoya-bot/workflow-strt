import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutlineOutlined,
  FileDownloadOutlined,
  OpenInNewOutlined,
  PictureAsPdfOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import { brandSettingsService } from "../../services/brandSettingsService";
import { customerService } from "../../services/customerService";
import { documentService, type DocumentRecord } from "../../services/documentService";
import { featureService } from "../../services/featureService";
import { signatureService } from "../../services/signatureService";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import { usePermissions } from "../../hooks/usePermissions";
import { generateWorkflowReport, resolveImageToDataUrl } from "../../utils/generateWorkflowReport";
import { resolveReportTimeZone } from "../../utils/datetime";
import type { WorkflowReportExportContext } from "../../utils/workflowReportExport";
import { workflowReportBaseFileName } from "../../utils/workflowReportExport";

type UserLite = {
  id: string;
  fullName?: string | null;
};

type SavedSignedAssetReportDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectJobNumber?: string;
  projectCustomer?: string;
  projectSite?: string;
  projectCustomerId?: string;
  projectTimeZoneId?: string;
  assets: ProjectAsset[];
  latestRuns: AssetWorkflowRun[];
  users: UserLite[];
};

type SignedAssetRow = {
  asset: ProjectAsset;
  run: AssetWorkflowRun;
  existingDoc: DocumentRecord | undefined;
};

const REPORT_TYPE = "Closed Signed Asset Report";

function isRunFullySigned(run: AssetWorkflowRun): boolean {
  return Boolean(run.installerSignedAt) && (Boolean(run.customerSignedAt) || run.signatureStatus === "Signed");
}

function issueCount(run: AssetWorkflowRun): number {
  try {
    return (JSON.parse(run.issuesJson || "[]") as RunIssue[]).filter((issue) => !issue.resolved).length;
  } catch {
    return 0;
  }
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function ClosedSignedAssetsDialog({
  open,
  onClose,
  projectId,
  projectJobNumber = "",
  projectCustomer = "",
  projectSite = "",
  projectCustomerId,
  projectTimeZoneId,
  assets,
  latestRuns,
  users,
}: SavedSignedAssetReportDialogProps) {
  const can = usePermissions();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligibleRows = useMemo<SignedAssetRow[]>(() => {
    const existingByAssetRun = new Map<string, DocumentRecord>();
    for (const doc of documents) {
      const projectMatch = doc.customValues?.projectId === projectId;
      const kindMatch = doc.customValues?.reportKind === "closed-signed-asset";
      const assetId = doc.customValues?.assetId;
      const runId = doc.customValues?.runId;
      if (!projectMatch || !kindMatch || !assetId || !runId) continue;
      existingByAssetRun.set(`${assetId}::${runId}`, doc);
    }

    const rows: SignedAssetRow[] = [];
    for (const asset of assets) {
      const run = latestRuns.find((candidate) => candidate.assetId === asset.id);
      if (!run) continue;
      if (asset.status !== "Closed") continue;
      if (!run.isLocked || !isRunFullySigned(run)) continue;
      rows.push({
        asset,
        run,
        existingDoc: existingByAssetRun.get(`${asset.id}::${run.id}`),
      });
    }

    return rows.sort((a, b) =>
      (a.asset.assetTag || a.asset.assetName || "").localeCompare(
        b.asset.assetTag || b.asset.assetName || "",
      ),
    );
  }, [assets, documents, latestRuns, projectId]);

  const refreshDocuments = useCallback(async () => {
    setLoadingDocs(true);
    setError(null);
    try {
      const docs = await documentService.getDocuments();
      setDocuments(docs.filter((doc) => doc.type === REPORT_TYPE));
    } catch {
      setError("Failed to load saved signed reports.");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshDocuments();
  }, [open, refreshDocuments]);

  const buildAssetReportContext = useCallback(async (asset: ProjectAsset, run: AssetWorkflowRun): Promise<WorkflowReportExportContext> => {
    let rawCustomerLogo: string | null = null;
    if (projectCustomerId) {
      try {
        const allCustomers = await customerService.getCustomers();
        rawCustomerLogo = allCustomers.find((c) => c.customerId === projectCustomerId || c.id === projectCustomerId)?.logo ?? null;
      } catch {
        rawCustomerLogo = null;
      }
    }

    const [brandSettings, signatureEvents, productFeatures] = await Promise.all([
      brandSettingsService.get(),
      signatureService.listEvents(run.id).catch(() => []),
      asset.productId ? featureService.getByProduct(asset.productId).catch(() => []) : Promise.resolve([]),
    ]);

    const [businessLogoBase64, customerLogoBase64] = await Promise.all([
      brandSettings.logoBase64 ? resolveImageToDataUrl(brandSettings.logoBase64) : Promise.resolve(null),
      rawCustomerLogo ? resolveImageToDataUrl(rawCustomerLogo) : Promise.resolve(null),
    ]);

    let workflowConfigName = asset.assetTag || asset.assetName || "Installation Record";
    try {
      const snapshot = JSON.parse(run.workflowSnapshotJson || "{}");
      if (typeof snapshot?.name === "string" && snapshot.name.trim()) {
        workflowConfigName = snapshot.name.trim();
      }
    } catch {
      // Keep fallback name.
    }

    const technician = users.find((user) => user.id === asset.assignedUserId)?.fullName ?? undefined;

    return {
      run,
      asset,
      workflowConfigName,
      businessLogoBase64,
      customerLogoBase64,
      customerName: projectCustomer || undefined,
      jobNumber: projectJobNumber || undefined,
      siteName: projectSite || undefined,
      siteLocation: asset.location ?? undefined,
      assignedTechnician: technician ?? undefined,
      timeZoneId: resolveReportTimeZone({ timeZoneId: projectTimeZoneId }),
      signatureEvents,
      productFeatures,
    };
  }, [projectCustomer, projectCustomerId, projectJobNumber, projectSite, projectTimeZoneId, users]);

  const handleOpenSavedPdf = useCallback(async (doc: DocumentRecord) => {
    if (!doc.downloadUrl) return;
    setError(null);
    try {
      const objectUrl = await documentService.openDocument(doc.downloadUrl);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[ClosedSignedAssetsDialog] Failed to open saved PDF", err);
      setError(`Failed to open saved PDF for ${doc.name || doc.id}.`);
    }
  }, []);

  const saveSignedReport = useCallback(async (row: SignedAssetRow) => {
    if (row.existingDoc) {
      setMessage(`A saved report already exists for ${row.asset.assetTag || row.asset.assetName}.`);
      return;
    }

    setSavingAssetId(row.asset.id);
    setError(null);
    setMessage(null);
    try {
      const context = await buildAssetReportContext(row.asset, row.run);
      const pdfBlob = await generateWorkflowReport({ ...context, outputMode: "blob" });
      if (!(pdfBlob instanceof Blob)) {
        throw new Error("Failed to build signed asset PDF.");
      }

      const fileBase = workflowReportBaseFileName(context.asset, context.run);
      const file = new File([pdfBlob], `${fileBase}.pdf`, { type: "application/pdf" });
      const uploadedDoc = await documentService.uploadDocument(
        file,
        REPORT_TYPE,
        projectJobNumber || projectId,
        undefined,
        `Saved signed asset report for ${row.asset.assetTag || row.asset.assetName || row.asset.id}`,
        {
          projectId,
          jobNumber: projectJobNumber,
          assetId: row.asset.id,
          assetTag: row.asset.assetTag,
          runId: row.run.id,
          reportKind: "closed-signed-asset",
          signatureStatus: row.run.signatureStatus,
        },
      );
      setDocuments((prev) => {
        const next = prev.filter((doc) => doc.id !== uploadedDoc.id);
        next.unshift(uploadedDoc);
        return next;
      });
      setMessage(`Saved signed report for ${row.asset.assetTag || row.asset.assetName}.`);
      await refreshDocuments();
    } catch (err) {
      console.error("[ClosedSignedAssetsDialog] Failed to save signed report", err);
      setError(`Failed to save report for ${row.asset.assetTag || row.asset.assetName}.`);
    } finally {
      setSavingAssetId(null);
    }
  }, [buildAssetReportContext, projectId, projectJobNumber, refreshDocuments]);

  const handleSaveAll = useCallback(async () => {
    const unsaved = eligibleRows.filter((row) => !row.existingDoc);
    if (unsaved.length === 0) {
      setMessage("All eligible signed asset reports are already saved.");
      return;
    }

    setBulkSaving(true);
    setError(null);
    setMessage(null);
    try {
      for (const row of unsaved) {
        // eslint-disable-next-line no-await-in-loop
        await saveSignedReport(row);
      }
      setMessage(`Saved ${unsaved.length} signed asset report${unsaved.length === 1 ? "" : "s"}.`);
    } finally {
      setBulkSaving(false);
    }
  }, [eligibleRows, saveSignedReport]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Closed & Signed Assets</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            Stores PDF reports for assets that are closed and signed by both installer and customer.
          </Typography>
          <Button size="small" startIcon={<RefreshOutlined />} onClick={() => void refreshDocuments()} disabled={loadingDocs || bulkSaving || !!savingAssetId}>
            Refresh
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={bulkSaving ? <CircularProgress size={14} /> : <PictureAsPdfOutlined />}
            onClick={() => void handleSaveAll()}
            disabled={!can.documents.upload || bulkSaving || !!savingAssetId || eligibleRows.filter((row) => !row.existingDoc).length === 0}
          >
            {bulkSaving ? "Saving..." : "Save All New PDFs"}
          </Button>
        </Stack>

        {!can.documents.upload && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Your role can view saved reports here, but only Admin or Project Manager can save new PDFs into the document library.
          </Alert>
        )}
        {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loadingDocs ? (
          <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>
        ) : eligibleRows.length === 0 ? (
          <Alert severity="info">No closed assets with both signatures were found for this project yet.</Alert>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Asset</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Signed</TableCell>
                  <TableCell>Open Issues</TableCell>
                  <TableCell>Saved PDF</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {eligibleRows.map((row) => {
                  const assetLabel = row.asset.assetTag || row.asset.assetName || row.asset.id;
                  return (
                    <TableRow key={row.asset.id} hover>
                      <TableCell>
                        <Stack spacing={0.25}>
                          <Typography variant="body2" fontWeight={700}>{assetLabel}</Typography>
                          <Typography variant="caption" color="text.secondary">{row.asset.location || "-"}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.asset.status}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{fmtDate(row.run.customerSignedAt || row.run.completedAt)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={issueCount(row.run) > 0 ? "warning.main" : "text.secondary"}>
                          {issueCount(row.run)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.existingDoc ? (
                          <Stack spacing={0.25}>
                            <Typography variant="body2" color="success.main" fontWeight={700}>Saved</Typography>
                            <Typography variant="caption" color="text.secondary">{fmtDate(row.existingDoc.uploadedAt)}</Typography>
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">Not saved</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          {row.existingDoc && (
                            <Tooltip title="Open saved PDF">
                              <IconButton onClick={() => void handleOpenSavedPdf(row.existingDoc!)} size="small">
                                <OpenInNewOutlined fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Button
                            size="small"
                            variant={row.existingDoc ? "outlined" : "contained"}
                            startIcon={savingAssetId === row.asset.id ? <CircularProgress size={14} /> : row.existingDoc ? <CheckCircleOutlineOutlined /> : <FileDownloadOutlined />}
                            disabled={!can.documents.upload || !!savingAssetId || bulkSaving || Boolean(row.existingDoc)}
                            onClick={() => void saveSignedReport(row)}
                          >
                            {savingAssetId === row.asset.id ? "Saving..." : row.existingDoc ? "Saved" : "Save PDF"}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}




