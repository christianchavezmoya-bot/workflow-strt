/**
 * SyncCenterPage — full-screen dialog showing sync status and pending queue.
 * Opened by tapping the SyncStatusBadge in the Topbar.
 */

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useEffect, useMemo, useState } from "react";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import api from "../../services/api";
import {
  entityGetAsset,
  entityGetWorkflowRun,
  pendingGetAll,
  pendingRemove,
  droppedActionsGetAll,
  droppedActionDismiss,
  type PendingAction,
  type DroppedAction,
} from "../../services/localDB";
import ApiDebugPanel from "../../components/ui/ApiDebugPanel";
import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun, RunIssue, StepResult } from "../../types/assetWorkflowRun";
import offlineStore from "../../services/offlineStore";
import {
  formatPayloadSize,
  formatSyncDiagnosticSummary,
  toAllowlistedDiagnostics,
} from "../../utils/syncDiagnostics";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ConflictFieldComparison {
  label: string;
  localValue: string;
  serverValue: string;
}

interface ConflictDetail {
  title: string;
  subtitle?: string;
  localLabel: string;
  serverLabel: string;
  fields: ConflictFieldComparison[];
  fetchError?: string;
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)  return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const secs = Math.floor((d.getTime() - Date.now()) / 1000);
  if (secs <= 0) return "now";
  if (secs < 60)  return `in ${secs}s`;
  return `in ${Math.floor(secs / 60)}m`;
}

function droppedActionLabel(action: DroppedAction): string {
  const entity = action.entityType
    ? action.entityType.charAt(0).toUpperCase() + action.entityType.slice(1)
    : "Record";
  const op = action.opType ? `${action.opType} ` : "";
  return `${op}${entity}`;
}

function statusChipColor(
  status: PendingAction["status"]
): "warning" | "info" | "error" | "default" {
  if (status === "uploading") return "info";
  if (status === "failed")    return "error";
  return "warning";
}

function connectivityLabel(
  status: string,
  pendingCount: number
): { label: string; color: "success" | "warning" | "error" | "default" } {
  switch (status) {
    case "synced":
    case "syncing":
    case "pending":
      return { label: "Online", color: "success" };
    case "offline":
      return {
        label: pendingCount > 0 ? `Offline · ${pendingCount} queued` : "Offline",
        color: "warning",
      };
    case "error":
      return { label: "Sync error", color: "error" };
    default:
      return { label: "Unknown", color: "default" };
  }
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatIssuesSummary(raw: string | null | undefined): string {
  const issues = parseJsonArray<RunIssue>(raw);
  const open = issues.filter((issue) => !issue.resolved).length;
  const blocking = issues.filter((issue) => issue.isBlocking && !issue.resolved).length;
  return `${open} open${blocking > 0 ? ` · ${blocking} blocking` : ""}`;
}

function formatStepResultsSummary(raw: string | null | undefined): string {
  const steps = parseJsonArray<StepResult>(raw);
  return `${steps.length} completed step${steps.length === 1 ? "" : "s"}`;
}

function formatFeatureValuesSummary(raw: string | null | undefined): string {
  if (!raw) return "0 values";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return `${Object.values(parsed ?? {}).filter((value) => value !== null && value !== undefined && value !== "").length} values`;
  } catch {
    return "—";
  }
}

function formatBomSummary(raw: string | null | undefined): string {
  const items = parseJsonArray<unknown>(raw);
  return `${items.length} BOM item${items.length === 1 ? "" : "s"}`;
}

function deriveChangedKeys(action: PendingAction): string[] {
  const source = Object.keys(action.optimisticPatch ?? {});
  if (source.length > 0) return source;
  if (action.body && typeof action.body === "object") {
    return Object.keys(action.body as Record<string, unknown>);
  }
  return [];
}

function getQueuedFieldValue<T extends object>(
  action: PendingAction,
  key: keyof T & string,
  fallback: unknown,
): unknown {
  const optimisticValue = (action.optimisticPatch as Record<string, unknown> | undefined)?.[key];
  if (optimisticValue !== undefined) return optimisticValue;
  const bodyValue = action.body && typeof action.body === "object"
    ? (action.body as Record<string, unknown>)[key]
    : undefined;
  if (bodyValue !== undefined) return bodyValue;
  return fallback;
}

function buildAssetConflictFields(
  action: PendingAction,
  localAsset?: ProjectAsset | null,
  serverAsset?: ProjectAsset | null,
): ConflictFieldComparison[] {
  const changedKeys = deriveChangedKeys(action);
  const fields: ConflictFieldComparison[] = [];
  const addField = (label: string, localValue: unknown, serverValue: unknown) => {
    fields.push({
      label,
      localValue: formatValue(localValue),
      serverValue: formatValue(serverValue),
    });
  };

  changedKeys.forEach((key) => {
    switch (key) {
      case "status":
        addField("Status", getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.status), serverAsset?.status);
        break;
      case "assetTag":
        addField("Asset Tag", getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.assetTag), serverAsset?.assetTag);
        break;
      case "assetName":
        addField("Asset Name", getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.assetName), serverAsset?.assetName);
        break;
      case "location":
        addField("Location", getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.location), serverAsset?.location);
        break;
      case "assignedUserId":
        addField("Assigned User", getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.assignedUserId), serverAsset?.assignedUserId);
        break;
      case "workOrderId":
        addField("Work Order", getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.workOrderId), serverAsset?.workOrderId);
        break;
      case "notes":
        addField("Notes", getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.notes), serverAsset?.notes);
        break;
      case "issuesJson":
        addField(
          "Issues",
          formatIssuesSummary(getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.issuesJson) as string | undefined),
          formatIssuesSummary(serverAsset?.issuesJson)
        );
        break;
      case "featureValuesJson":
        addField(
          "Feature Values",
          formatFeatureValuesSummary(getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.featureValuesJson) as string | undefined),
          formatFeatureValuesSummary(serverAsset?.featureValuesJson)
        );
        break;
      case "updatedAt":
        addField(
          "Updated",
          formatDateTime(getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.updatedAt) as string | undefined),
          formatDateTime(serverAsset?.updatedAt)
        );
        break;
      default:
        addField(
          key,
          getQueuedFieldValue<ProjectAsset>(action, key as keyof ProjectAsset & string, localAsset?.[key as keyof ProjectAsset]),
          serverAsset?.[key as keyof ProjectAsset]
        );
        break;
    }
  });

  if (fields.length === 0) {
    addField("Queued change", action.method, `${action.method} ${action.url}`);
  }
  return fields;
}

function buildRunConflictFields(
  action: PendingAction,
  localRun?: AssetWorkflowRun | null,
  serverRun?: AssetWorkflowRun | null,
): ConflictFieldComparison[] {
  const changedKeys = deriveChangedKeys(action);
  const fields: ConflictFieldComparison[] = [];
  const addField = (label: string, localValue: unknown, serverValue: unknown) => {
    fields.push({
      label,
      localValue: formatValue(localValue),
      serverValue: formatValue(serverValue),
    });
  };

  changedKeys.forEach((key) => {
    switch (key) {
      case "status":
        addField("Status", getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.status), serverRun?.status);
        break;
      case "stepResultsJson":
        addField(
          "Steps",
          formatStepResultsSummary(getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.stepResultsJson) as string | undefined),
          formatStepResultsSummary(serverRun?.stepResultsJson)
        );
        break;
      case "issuesJson":
        addField(
          "Issues",
          formatIssuesSummary(getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.issuesJson) as string | undefined),
          formatIssuesSummary(serverRun?.issuesJson)
        );
        break;
      case "signatureStatus":
        addField("Signature", getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.signatureStatus), serverRun?.signatureStatus);
        break;
      case "completedAt":
        addField(
          "Completed",
          formatDateTime(getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.completedAt) as string | undefined),
          formatDateTime(serverRun?.completedAt)
        );
        break;
      case "updatedAt":
        addField(
          "Updated",
          formatDateTime(getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.updatedAt) as string | undefined),
          formatDateTime(serverRun?.updatedAt)
        );
        break;
      case "productiveSeconds":
        addField("Productive Time", getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.productiveSeconds), serverRun?.productiveSeconds);
        break;
      case "downtimeSeconds":
        addField("Downtime", getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.downtimeSeconds), serverRun?.downtimeSeconds);
        break;
      case "bomActualJson":
        addField(
          "BOM",
          formatBomSummary(getQueuedFieldValue<AssetWorkflowRun>(action, key, localRun?.bomActualJson) as string | undefined),
          formatBomSummary(serverRun?.bomActualJson)
        );
        break;
      default:
        addField(
          key,
          getQueuedFieldValue<AssetWorkflowRun>(action, key as keyof AssetWorkflowRun & string, localRun?.[key as keyof AssetWorkflowRun]),
          serverRun?.[key as keyof AssetWorkflowRun]
        );
        break;
    }
  });

  if (fields.length === 0) {
    addField("Queued change", action.method, `${action.method} ${action.url}`);
  }
  return fields;
}

async function buildConflictDetail(action: PendingAction): Promise<ConflictDetail> {
  if (action.entityType === "asset") {
    const localRecord = await entityGetAsset(action.entityId);
    const localAsset = (localRecord?.data as ProjectAsset | undefined) ?? null;
    let serverAsset: ProjectAsset | null = null;
    let fetchError: string | undefined;
    try {
      const response = await api.get<ProjectAsset>(`/project-assets/${action.entityId}`);
      serverAsset = response.data;
    } catch {
      fetchError = "Could not load the current server version.";
    }

    return {
      title: localAsset?.assetTag ? `Asset ${localAsset.assetTag}` : `Asset ${action.entityId}`,
      subtitle: localAsset?.assetName ?? serverAsset?.assetName ?? action.url,
      localLabel: "Your offline version",
      serverLabel: "Current server version",
      fields: buildAssetConflictFields(action, localAsset, serverAsset),
      fetchError,
    };
  }

  if (action.entityType === "workflow-run") {
    const localRun = (await offlineStore.getRun(action.entityId)) ?? ((await entityGetWorkflowRun(action.entityId))?.data as AssetWorkflowRun | undefined) ?? null;
    const resolvedRunId = await offlineStore.getMappedId("workflow-run", action.entityId) ?? action.entityId;
    let serverRun: AssetWorkflowRun | null = null;
    let fetchError: string | undefined;
    try {
      const response = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}`);
      serverRun = response.data;
    } catch {
      fetchError = "Could not load the current server version.";
    }

    const localAsset = localRun?.assetId ? await entityGetAsset(localRun.assetId) : null;
    const localAssetData = (localAsset?.data as ProjectAsset | undefined) ?? null;
    return {
      title: localAssetData?.assetTag ? `Run for ${localAssetData.assetTag}` : `Run ${resolvedRunId}`,
      subtitle: localRun?.status ? `${localRun.status} · ${action.method} ${action.url}` : action.url,
      localLabel: "Your offline version",
      serverLabel: "Current server version",
      fields: buildRunConflictFields(action, localRun, serverRun),
      fetchError,
    };
  }

  return {
    title: `${action.entityType} conflict`,
    subtitle: `${action.method} ${action.url}`,
    localLabel: "Your queued change",
    serverLabel: "Current server version",
    fields: deriveChangedKeys(action).length > 0
      ? deriveChangedKeys(action).map((key) => ({
        label: key,
        localValue: formatValue((action.optimisticPatch as Record<string, unknown>)[key] ?? (action.body as Record<string, unknown> | undefined)?.[key]),
        serverValue: "Unavailable",
      }))
      : [{
        label: "Queued change",
        localValue: `${action.method} ${action.url}`,
        serverValue: "Unavailable",
      }],
    fetchError: "Detailed comparison is not available for this record type yet.",
  };
}

function diagnosticDetailRows(action: PendingAction): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (action.lastOpType) rows.push({ label: "Op type", value: action.lastOpType });
  if (action.lastPayloadBytes != null) rows.push({ label: "Payload", value: formatPayloadSize(action.lastPayloadBytes) });
  if (action.lastStepResultsBytes != null) rows.push({ label: "stepResultsJson", value: formatPayloadSize(action.lastStepResultsBytes) });
  if (action.lastPhotoCount != null) rows.push({ label: "Inline photos", value: String(action.lastPhotoCount) });
  if (action.lastDurationMs != null) rows.push({ label: "Duration", value: `${action.lastDurationMs.toLocaleString()} ms` });
  if (action.lastTimeoutMs) rows.push({ label: "Timeout", value: `${action.lastTimeoutMs.toLocaleString()} ms` });
  if (action.lastHttpStatus != null) rows.push({ label: "HTTP status", value: String(action.lastHttpStatus) });
  else if (action.lastErrorCode) rows.push({ label: "Error code", value: action.lastErrorCode });
  if (action.lastMappedRunId) rows.push({ label: "Mapped run ID", value: action.lastMappedRunId });
  if (action.lastIsOfflineRunId) rows.push({ label: "Offline run ID", value: "yes" });
  if (action.lastServerReachable != null) rows.push({ label: "Server reachable (ping)", value: action.lastServerReachable ? "yes" : "no" });
  if (action.lastConnectivity) rows.push({ label: "Connectivity", value: action.lastConnectivity });
  if (action.lastApiHost) rows.push({ label: "API host", value: action.lastApiHost });
  if (action.lastAttemptAt) rows.push({ label: "Last attempt", value: new Date(action.lastAttemptAt).toLocaleString() });
  return rows;
}

async function copyDiagnostics(action: PendingAction): Promise<void> {
  const json = JSON.stringify(toAllowlistedDiagnostics(action), null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(json);
  }
}

export default function SyncCenterPage({ open, onClose }: Props) {
  const { status, pendingCount, conflictCount, lastSyncAt, syncing, triggerSync, resolveConflictKeep, resolveConflictDiscard } = useSyncEngine();
  const [queue, setQueue]         = useState<PendingAction[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [droppedActions, setDroppedActions] = useState<DroppedAction[]>([]);
  const [conflictDetails, setConflictDetails] = useState<Record<string, ConflictDetail>>({});
  const [loadingConflictIds, setLoadingConflictIds] = useState<Record<string, boolean>>({});
  const [expandedDiagIds, setExpandedDiagIds] = useState<Record<string, boolean>>({});
  const [copiedDiagId, setCopiedDiagId] = useState<string | null>(null);

  const loadQueue = async () => setQueue(await pendingGetAll());
  const loadDropped = async () => setDroppedActions(await droppedActionsGetAll());

  useEffect(() => {
    if (open) {
      void loadQueue();
      void loadDropped();
    }
  }, [open]);

  useEffect(() => {
    void loadQueue();
    void loadDropped();
    const h = () => { void loadQueue(); void loadDropped(); };
    window.addEventListener("sync-pending-changed", h);
    window.addEventListener("sync-conflict-detected", h);
    return () => {
      window.removeEventListener("sync-pending-changed", h);
      window.removeEventListener("sync-conflict-detected", h);
    };
  }, []);

  const handleClearFailed = async () => {
    const failed = queue.filter(a => a.status === "failed" && !a.conflictDetected);
    await Promise.all(failed.map(a => pendingRemove(a.id)));
    await loadQueue();
  };

  const { label: connLabel, color: connColor } = connectivityLabel(status, pendingCount);
  // Memoized on `queue` so these keep a stable reference across renders that
  // don't actually change the queue (e.g. the syncing indicator ticking) —
  // conflicted is a useEffect dependency below, and a fresh array on every
  // render meant that effect re-ran constantly, restarting the comparison
  // fetch before it could resolve and leaving "Loading comparison…" stuck.
  const conflicted    = useMemo(() => queue.filter(a => a.conflictDetected), [queue]);
  const nonConflicted = useMemo(() => queue.filter(a => !a.conflictDetected), [queue]);
  const hasFailed    = nonConflicted.some(a => a.status === "failed");

  useEffect(() => {
    if (!open || conflicted.length === 0) return;

    let active = true;
    setLoadingConflictIds(Object.fromEntries(conflicted.map((action) => [action.id, true])));

    void Promise.all(
      conflicted.map(async (action) => {
        try {
          const detail = await buildConflictDetail(action);
          return [action.id, detail] as const;
        } catch {
          return [action.id, {
            title: `${action.entityType} conflict`,
            subtitle: `${action.method} ${action.url}`,
            localLabel: "Your queued change",
            serverLabel: "Current server version",
            fields: [{
              label: "Queued change",
              localValue: `${action.method} ${action.url}`,
              serverValue: "Unavailable",
            }],
            fetchError: "Could not build the comparison for this conflict.",
          } satisfies ConflictDetail] as const;
        }
      })
    ).then((entries) => {
      if (!active) return;
      setConflictDetails(Object.fromEntries(entries));
      setLoadingConflictIds({});
    });

    return () => {
      active = false;
    };
  }, [open, conflicted]);

  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={600}>Sync Center</Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ px: 2, pt: 1, pb: 4 }}>
          {/* Connection status */}
          <Stack spacing={1} mb={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" color="text.secondary">Connection</Typography>
              <Chip
                label={connLabel}
                color={connColor}
                size="small"
                sx={{ fontWeight: 600, fontSize: "0.72rem" }}
              />
            </Stack>

            <Typography variant="body2" color="text.secondary">
              Last sync:{" "}
              <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                {lastSyncAt ? timeAgo(lastSyncAt) : "Never"}
              </Box>
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Pending:{" "}
              <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                {pendingCount} action{pendingCount !== 1 ? "s" : ""}
              </Box>
            </Typography>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* Dropped actions alert — reads from persisted IndexedDB store */}
          {droppedActions.length > 0 && (
            <Alert
              severity="error"
              sx={{ mb: 2, fontSize: "0.78rem" }}
              action={
                <Button
                  size="small"
                  color="error"
                  onClick={() => {
                    droppedActions.forEach(a => droppedActionDismiss(a.id));
                    void loadDropped();
                  }}
                >
                  Dismiss all
                </Button>
              }
            >
              <Typography variant="body2" fontWeight={600} gutterBottom>
                {droppedActions.length} change{droppedActions.length !== 1 ? "s" : ""} permanently failed to sync — manual action required
              </Typography>
              {droppedActions.map((d) => (
                <Stack key={d.id} direction="row" alignItems="center" spacing={1} justifyContent="space-between">
                  <Typography variant="caption" display="block" sx={{ flex: 1 }}>
                    {droppedActionLabel(d)} · {new Date(d.createdAt).toLocaleTimeString()} · {d.lastError ?? "server unreachable after 20 retries"}
                  </Typography>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => { droppedActionDismiss(d.id); void loadDropped(); }}
                    sx={{ fontSize: "0.68rem", color: "error.light", minWidth: 0, px: 0.5 }}
                  >
                    Dismiss
                  </Button>
                </Stack>
              ))}
            </Alert>
          )}

          {/* Action buttons */}
          <Stack direction="row" spacing={1} mb={3} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => void triggerSync()}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
            {hasFailed && (
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={() => void handleClearFailed()}
              >
                Clear Failed
              </Button>
            )}
          </Stack>

          {/* ── Conflicts ─────────────────────────────────────────────────────── */}
          {conflictCount > 0 && (
            <Stack spacing={1} mb={3}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <WarningAmberIcon sx={{ fontSize: 16, color: "warning.main" }} />
                <Typography variant="subtitle2" color="warning.main">
                  {conflictCount} conflict{conflictCount !== 1 ? "s" : ""} detected
                </Typography>
              </Stack>

              <Alert severity="warning" sx={{ fontSize: "0.75rem", py: 0.5 }}>
                Someone else edited these records while you were offline. Choose
                whether to keep your change or accept the server version.
              </Alert>

              {conflicted.map(action => (
                <Box
                  key={action.id}
                  sx={{
                    border: "1px solid",
                    borderColor: "warning.main",
                    borderRadius: 1,
                    p: 1.5,
                    bgcolor: "rgba(237,108,2,0.06)",
                  }}
                >
                  <Stack spacing={0.75}>
                    <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "warning.main", fontSize: "0.65rem" }}>
                        {action.entityType}
                      </Typography>
                      <Chip label="conflict" color="warning" size="small" sx={{ height: 16, fontSize: "0.62rem" }} />
                      <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem" }}>
                        {action.method} {action.url}
                      </Typography>
                    </Stack>

                    {loadingConflictIds[action.id] && !conflictDetails[action.id] ? (
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
                        <CircularProgress size={14} />
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Loading comparison…
                        </Typography>
                      </Stack>
                    ) : conflictDetails[action.id] ? (
                      <Stack spacing={1} sx={{ pt: 0.5 }}>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {conflictDetails[action.id].title}
                          </Typography>
                          {conflictDetails[action.id].subtitle && (
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              {conflictDetails[action.id].subtitle}
                            </Typography>
                          )}
                        </Box>

                        {conflictDetails[action.id].fetchError && (
                          <Alert severity="info" sx={{ py: 0.25, fontSize: "0.72rem" }}>
                            {conflictDetails[action.id].fetchError}
                          </Alert>
                        )}

                        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                          <Box sx={{ flex: 1, border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1, bgcolor: "background.paper" }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                              {conflictDetails[action.id].localLabel}
                            </Typography>
                            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                              {conflictDetails[action.id].fields.map((field) => (
                                <Box key={`${action.id}-local-${field.label}`}>
                                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                    {field.label}
                                  </Typography>
                                  <Typography variant="body2">{field.localValue}</Typography>
                                </Box>
                              ))}
                            </Stack>
                          </Box>

                          <Box sx={{ flex: 1, border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1, bgcolor: "background.paper" }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                              {conflictDetails[action.id].serverLabel}
                            </Typography>
                            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                              {conflictDetails[action.id].fields.map((field) => (
                                <Box key={`${action.id}-server-${field.label}`}>
                                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                    {field.label}
                                  </Typography>
                                  <Typography variant="body2">{field.serverValue}</Typography>
                                </Box>
                              ))}
                            </Stack>
                          </Box>
                        </Stack>
                      </Stack>
                    ) : null}

                    <Stack direction="row" spacing={1} pt={0.5}>
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        sx={{ fontSize: "0.7rem", py: 0.25 }}
                        onClick={() => void resolveConflictKeep(action.id).then(loadQueue)}
                      >
                        Keep my change
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        sx={{ fontSize: "0.7rem", py: 0.25 }}
                        onClick={() => void resolveConflictDiscard(action.id).then(loadQueue)}
                      >
                        Discard
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              ))}

              <Divider />
            </Stack>
          )}

          {/* Pending queue */}
          {nonConflicted.length === 0 && conflictCount === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No pending actions — all synced.
            </Typography>
          ) : nonConflicted.length === 0 ? null : (
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary" mb={0.5}>
                Pending queue
              </Typography>
              {nonConflicted.map(action => (
                <Box
                  key={action.id}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 1.5,
                    bgcolor: "background.paper",
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                    <Stack spacing={0.5} flex={1} minWidth={0}>
                      <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            textTransform: "uppercase",
                            color: "text.secondary",
                            fontSize: "0.65rem",
                          }}
                        >
                          {action.entityType}
                        </Typography>
                        <Chip
                          label={action.status}
                          color={statusChipColor(action.status)}
                          size="small"
                          sx={{ height: 16, fontSize: "0.62rem" }}
                        />
                        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem" }}>
                          {action.method}
                        </Typography>
                      </Stack>

                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          fontSize: "0.68rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {action.url}
                      </Typography>

                      {action.lastError && (
                        <Typography
                          variant="caption"
                          sx={{ color: "error.main", fontSize: "0.65rem" }}
                        >
                          {action.lastError}
                        </Typography>
                      )}

                      {formatSyncDiagnosticSummary(action) && (
                        <Typography
                          variant="caption"
                          sx={{ color: "text.secondary", fontSize: "0.63rem", fontFamily: "monospace" }}
                        >
                          {formatSyncDiagnosticSummary(action)}
                        </Typography>
                      )}

                      {(action.status === "failed" || action.lastPayloadBytes != null) && diagnosticDetailRows(action).length > 0 && (
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Button
                              size="small"
                              variant="text"
                              sx={{ fontSize: "0.62rem", py: 0, minWidth: 0, textTransform: "none" }}
                              onClick={() => setExpandedDiagIds(prev => ({ ...prev, [action.id]: !prev[action.id] }))}
                            >
                              {expandedDiagIds[action.id] ? "Hide diagnostics" : "Show diagnostics"}
                            </Button>
                            <Button
                              size="small"
                              variant="text"
                              startIcon={<ContentCopyIcon sx={{ fontSize: 12 }} />}
                              sx={{ fontSize: "0.62rem", py: 0, minWidth: 0, textTransform: "none" }}
                              onClick={() => {
                                void copyDiagnostics(action).then(() => {
                                  setCopiedDiagId(action.id);
                                  setTimeout(() => setCopiedDiagId(prev => (prev === action.id ? null : prev)), 2000);
                                });
                              }}
                            >
                              {copiedDiagId === action.id ? "Copied" : "Copy diagnostics"}
                            </Button>
                          </Stack>
                          <Collapse in={!!expandedDiagIds[action.id]}>
                            <Stack spacing={0.25} sx={{ pl: 0.5 }}>
                              {diagnosticDetailRows(action).map(row => (
                                <Typography key={row.label} variant="caption" sx={{ fontSize: "0.62rem", color: "text.secondary" }}>
                                  <Box component="span" sx={{ fontWeight: 600 }}>{row.label}:</Box> {row.value}
                                </Typography>
                              ))}
                            </Stack>
                          </Collapse>
                        </Stack>
                      )}
                    </Stack>

                    <Stack alignItems="flex-end" spacing={0.25} flexShrink={0}>
                      <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.63rem" }}>
                        {action.retries > 0 ? `${action.retries} retr${action.retries === 1 ? "y" : "ies"}` : "No retries"}
                      </Typography>
                      {action.nextRetryAt && action.status === "failed" && (
                        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.63rem" }}>
                          Next: {formatTime(action.nextRetryAt)}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}

          <Divider sx={{ mt: 4, mb: 2 }} />

          {/* Link to API Debug Log */}
          <Button
            variant="text"
            size="small"
            sx={{ textTransform: "none", color: "text.secondary", fontSize: "0.72rem" }}
            onClick={() => setDebugOpen(true)}
          >
            View API Debug Log
          </Button>
        </DialogContent>
      </Dialog>

      <ApiDebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </>
  );
}
