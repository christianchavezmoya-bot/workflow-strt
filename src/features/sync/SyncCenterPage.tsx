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
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
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
  droppedActionRequeue,
  referenceDataGet,
  type PendingAction,
  type DroppedAction,
} from "../../services/localDB";
import ApiDebugPanel from "../../components/ui/ApiDebugPanel";
import OfflineReadinessPanel from "../../components/layout/OfflineReadinessPanel";
import SyncCenterConnectivitySection from "../../components/layout/SyncCenterConnectivitySection";
import ConnectivityPerfReadout from "../../components/layout/ConnectivityPerfReadout";
import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun, RunIssue, StepResult } from "../../types/assetWorkflowRun";
import offlineStore from "../../services/offlineStore";
import {
  formatPayloadSize,
  formatSyncDiagnosticSummary,
  toAllowlistedDiagnostics,
} from "../../utils/syncDiagnostics";
import {
  copySyncSupportBundle,
  downloadSyncSupportBundle,
} from "../../services/syncSupportBundleService";
import {
  describeSyncOpType,
  formatPendingActionTechnicalDetail,
  resolvePendingActionLabel,
} from "../../utils/syncActionLabels";
import type { User } from "../../types/user";

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
  /** Installer-friendly card — hide JSON noise, one recommended action. */
  simpleMode?: boolean;
  installerGuidance?: string;
  recommendedAction?: "accept-server" | "keep-local" | "retry";
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

function isBusinessRuleConflict(action: PendingAction): boolean {
  return action.conflictKind === "business_rule" || action.conflictHttpStatus === 422 || action.conflictHttpStatus === 400;
}

function isRunCompletedOnServerConflict(
  action: PendingAction,
  localRun?: AssetWorkflowRun | null,
  serverRun?: AssetWorkflowRun | null,
): boolean {
  if (action.entityType !== "workflow-run") return false;
  const msg = (action.conflictMessage ?? "").toLowerCase();
  const serverDone = serverRun?.status === "Complete" || serverRun?.isLocked === true;
  const lockedMsg = msg.includes("locked") || msg.includes("completed");
  return serverDone || (isBusinessRuleConflict(action) && lockedMsg);
}

function installerGuidanceForConflict(
  action: PendingAction,
  detail?: ConflictDetail,
): string | undefined {
  if (detail?.installerGuidance) return detail.installerGuidance;
  if (detail?.simpleMode) {
    return "The server already has the latest version of this job. Update this phone to match — your work on the server is safe.";
  }
  if (isBusinessRuleConflict(action)) {
    const msg = action.conflictMessage ?? "";
    if (/locked|completed/i.test(msg)) {
      return "This job was already finished on the server (often from the web app). Your phone had an older copy open. Nothing is lost on the server — tap Update this phone to match the completed job.";
    }
  }
  return undefined;
}

function conflictSummary(action: PendingAction): string {
  if (action.conflictMessage) return action.conflictMessage;
  if (action.lastError) return action.lastError;
  if (isBusinessRuleConflict(action)) {
    return "The server rejected this queued action. Fix the underlying issue, then remove it from the queue or retry.";
  }
  return "Someone else edited this record while you were offline.";
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

function formatUserId(userId: unknown, userMap: Map<string, User>): string {
  if (userId == null || userId === "") return "—";
  const id = String(userId);
  return userMap.get(id)?.fullName ?? id;
}

function buildAssetConflictFields(
  action: PendingAction,
  localAsset?: ProjectAsset | null,
  serverAsset?: ProjectAsset | null,
  userMap?: Map<string, User>,
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
        addField(
          "Assigned User",
          formatUserId(getQueuedFieldValue<ProjectAsset>(action, key, localAsset?.assignedUserId), userMap ?? new Map()),
          formatUserId(serverAsset?.assignedUserId, userMap ?? new Map()),
        );
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

function conflictFetchErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401) {
    return "Session expired — sign in again to load the server version.";
  }
  return "Could not load the current server version.";
}

async function buildConflictDetail(action: PendingAction): Promise<ConflictDetail> {
  if (action.entityType === "asset") {
    const localRecord = await entityGetAsset(action.entityId);
    const localAsset = (localRecord?.data as ProjectAsset | undefined) ?? null;
    const users = (await referenceDataGet<User[]>("users")) ?? [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    let serverAsset: ProjectAsset | null = null;
    let fetchError: string | undefined;
    try {
      const response = await api.get<ProjectAsset>(`/project-assets/${action.entityId}`);
      serverAsset = response.data;
    } catch (error) {
      fetchError = conflictFetchErrorMessage(error);
    }

    return {
      title: localAsset?.assetTag ? `Asset ${localAsset.assetTag}` : `Asset ${action.entityId}`,
      subtitle: localAsset?.assetName ?? serverAsset?.assetName ?? action.url,
      localLabel: "Your offline version",
      serverLabel: "Current server version",
      fields: buildAssetConflictFields(action, localAsset, serverAsset, userMap),
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
    } catch (error) {
      fetchError = conflictFetchErrorMessage(error);
    }

    const localAsset = localRun?.assetId ? await entityGetAsset(localRun.assetId) : null;
    const localAssetData = (localAsset?.data as ProjectAsset | undefined) ?? null;
    const assetTag = localAssetData?.assetTag;
    const completedOnServer = isRunCompletedOnServerConflict(action, localRun, serverRun);
    const signedHint = serverRun?.customerSignedAt || serverRun?.installerSignedAt ? " (including signatures)" : "";

    if (completedOnServer) {
      return {
        title: assetTag ? `Job ${assetTag}` : "Workflow job",
        subtitle: assetTag ? undefined : resolvedRunId.slice(0, 8),
        simpleMode: true,
        recommendedAction: "accept-server",
        installerGuidance:
          `This job was already finished on the server${signedHint}. Your phone still had it open as "${localRun?.status ?? "In progress"}". `
          + "Nothing was lost on the server. Tap Update this phone to download the completed job to this device.",
        localLabel: "Your phone",
        serverLabel: "Server (finished)",
        fields: [{
          label: "Status",
          localValue: localRun?.status ?? "In progress",
          serverValue: serverRun?.status ?? "Complete",
        }],
        fetchError,
      };
    }

    return {
      title: localAssetData?.assetTag ? `Run for ${localAssetData.assetTag}` : `Run ${resolvedRunId.slice(0, 8)}`,
      subtitle: localRun?.status
        ? `${describeSyncOpType(action)} · ${localRun.status}`
        : describeSyncOpType(action),
      localLabel: "Your offline version",
      serverLabel: "Current server version",
      fields: buildRunConflictFields(action, localRun, serverRun),
      fetchError,
    };
  }

  if (action.entityType === "workflowAssignment") {
    const label = await resolvePendingActionLabel(action);
    const assetId = (action.body as Record<string, unknown> | undefined)?.assetId as string | undefined
      ?? (action.optimisticPatch?.assetId as string | undefined);
    let assetTag = "";
    if (assetId) {
      const localRecord = await entityGetAsset(assetId);
      const localAsset = (localRecord?.data as ProjectAsset | undefined) ?? null;
      assetTag = localAsset?.assetTag ?? assetId.slice(0, 8);
    }
    return {
      title: label.title,
      subtitle: assetTag ? `Asset ${assetTag}` : label.subtitle,
      localLabel: "Your queued assignment",
      serverLabel: "Server state",
      fields: [{
        label: "Workflow",
        localValue: label.title,
        serverValue: "Unavailable offline",
      }, ...(assetTag ? [{
        label: "Asset",
        localValue: assetTag,
        serverValue: "Unavailable offline",
      }] : [])],
      fetchError: "Assignment conflicts are resolved by retrying sync or removing from queue.",
    };
  }

  const genericLabel = await resolvePendingActionLabel(action);
  return {
    title: genericLabel.title,
    subtitle: genericLabel.subtitle,
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
        localValue: describeSyncOpType(action),
        serverValue: "Unavailable",
      }, {
        label: "Technical detail",
        localValue: formatPendingActionTechnicalDetail(action),
        serverValue: "Unavailable",
      }],
    fetchError: "Detailed comparison is not available for this record type yet.",
  };
}

function diagnosticDetailRows(action: PendingAction): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  rows.push({ label: "API", value: formatPendingActionTechnicalDetail(action) });
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
  const {
    pendingCount,
    conflictCount,
    lastSyncAt,
    syncing,
    triggerSync,
    resolveConflictKeep,
    resolveConflictDiscard,
    retryPendingAction,
    dismissPendingKeepLocal,
  } = useSyncEngine();
  const [queue, setQueue]         = useState<PendingAction[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(() => {
    try {
      return sessionStorage.getItem("sync-center-diagnostics-open") === "true";
    } catch {
      return false;
    }
  });
  const [droppedActions, setDroppedActions] = useState<DroppedAction[]>([]);
  const [conflictDetails, setConflictDetails] = useState<Record<string, ConflictDetail>>({});
  const [loadingConflictIds, setLoadingConflictIds] = useState<Record<string, boolean>>({});
  const [actionLabels, setActionLabels] = useState<Record<string, { title: string; subtitle: string }>>({});
  const [droppedLabels, setDroppedLabels] = useState<Record<string, { title: string; subtitle: string }>>({});
  const [expandedDiagIds, setExpandedDiagIds] = useState<Record<string, boolean>>({});
  const [copiedDiagId, setCopiedDiagId] = useState<string | null>(null);
  const [exportState, setExportState] = useState<"idle" | "copying" | "downloading" | "copied" | "error">("idle");

  const loadQueue = async () => setQueue(await pendingGetAll());
  const loadDropped = async () => setDroppedActions(await droppedActionsGetAll());

  useEffect(() => {
    if (open) {
      void loadQueue();
      void loadDropped();
    }
  }, [open]);

  useEffect(() => {
    try {
      sessionStorage.setItem("sync-center-diagnostics-open", String(diagnosticsOpen));
    } catch {
      // ignore
    }
  }, [diagnosticsOpen]);

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

  // Memoized on `queue` so these keep a stable reference across renders that
  // don't actually change the queue (e.g. the syncing indicator ticking) —
  // conflicted is a useEffect dependency below, and a fresh array on every
  // render meant that effect re-ran constantly, restarting the comparison
  // fetch before it could resolve and leaving "Loading comparison…" stuck.
  const conflicted    = useMemo(() => queue.filter(a => a.conflictDetected), [queue]);
  const nonConflicted = useMemo(() => queue.filter(a => !a.conflictDetected), [queue]);
  const hasFailed    = nonConflicted.some(a => a.status === "failed");

  useEffect(() => {
    let active = true;
    void (async () => {
      const entries = await Promise.all(
        queue.map(async (action) => {
          const label = await resolvePendingActionLabel(action);
          return [action.id, label] as const;
        }),
      );
      if (!active) return;
      setActionLabels(Object.fromEntries(entries));
    })();
    return () => { active = false; };
  }, [queue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const entries = await Promise.all(
        droppedActions.map(async (d) => {
          if (!d.url) return [d.id, { title: droppedActionLabel(d), subtitle: d.entityId.slice(0, 8) }] as const;
          const label = await resolvePendingActionLabel({
            id: d.id,
            url: d.url,
            method: d.method ?? "POST",
            body: d.body,
            entityType: d.entityType,
            entityId: d.entityId,
            optimisticPatch: d.optimisticPatch ?? {},
            createdAt: d.createdAt,
            retries: 0,
            status: "failed",
            opType: d.opType,
          });
          return [d.id, label] as const;
        }),
      );
      if (!active) return;
      setDroppedLabels(Object.fromEntries(entries));
    })();
    return () => { active = false; };
  }, [droppedActions]);

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
            subtitle: describeSyncOpType(action),
            localLabel: "Your queued change",
            serverLabel: "Current server version",
            fields: [{
              label: "Queued change",
              localValue: describeSyncOpType(action),
              serverValue: "Unavailable",
            }, {
              label: "Technical detail",
              localValue: formatPendingActionTechnicalDetail(action),
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
          <OfflineReadinessPanel />
          <SyncCenterConnectivitySection />

          <Stack spacing={0.5} mb={2}>
            <Typography variant="body2" color="text.secondary">
              Last sync:{" "}
              <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                {lastSyncAt ? timeAgo(lastSyncAt) : "Never"}
              </Box>
              {" · "}
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
                <Stack key={d.id} direction="row" alignItems="center" spacing={1} justifyContent="space-between" sx={{ mt: 0.5 }}>
                  <Typography variant="caption" display="block" sx={{ flex: 1 }}>
                    {droppedLabels[d.id]?.title ?? droppedActionLabel(d)}
                    {droppedLabels[d.id]?.subtitle ? ` · ${droppedLabels[d.id].subtitle}` : ""}
                    {" · "}{new Date(d.createdAt).toLocaleTimeString()}
                    {" · "}{d.lastError ?? "server unreachable after 20 retries"}
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexShrink={0}>
                    {d.url && d.method && (
                      <Button
                        size="small"
                        color="error"
                        variant="text"
                        onClick={() => {
                          void droppedActionRequeue(d.id).then((ok) => {
                            if (ok) window.dispatchEvent(new Event("sync-request-flush"));
                            void loadDropped();
                            void loadQueue();
                          });
                        }}
                        sx={{ fontSize: "0.68rem", minWidth: 0, px: 0.5 }}
                      >
                        Re-queue
                      </Button>
                    )}
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() => { droppedActionDismiss(d.id); void loadDropped(); }}
                      sx={{ fontSize: "0.68rem", color: "error.light", minWidth: 0, px: 0.5 }}
                    >
                      Dismiss
                    </Button>
                  </Stack>
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
            <Button
              variant="outlined"
              size="small"
              startIcon={<ContentCopyIcon />}
              disabled={exportState === "copying" || exportState === "downloading"}
              onClick={() => {
                setExportState("copying");
                void copySyncSupportBundle()
                  .then(() => setExportState("copied"))
                  .catch(() => setExportState("error"))
                  .finally(() => window.setTimeout(() => setExportState("idle"), 2500));
              }}
            >
              {exportState === "copied" ? "Copied bundle" : exportState === "copying" ? "Copying…" : "Copy support bundle"}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadOutlinedIcon />}
              disabled={exportState === "copying" || exportState === "downloading"}
              onClick={() => {
                setExportState("downloading");
                void downloadSyncSupportBundle()
                  .then(() => setExportState("idle"))
                  .catch(() => setExportState("error"))
                  .finally(() => window.setTimeout(() => setExportState("idle"), 2500));
              }}
            >
              Download JSON
            </Button>
          </Stack>

          {exportState === "error" && (
            <Alert severity="warning" sx={{ mb: 2, py: 0.5, fontSize: "0.75rem" }}>
              Could not export support bundle. Try again or use API Debug Log below.
            </Alert>
          )}

          {/* ── Conflicts ─────────────────────────────────────────────────────── */}
          {conflictCount > 0 && (
            <Stack spacing={1} mb={3}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <WarningAmberIcon sx={{ fontSize: 16, color: "warning.main" }} />
                <Typography variant="subtitle2" color="warning.main">
                  {conflictCount} conflict{conflictCount !== 1 ? "s" : ""} detected
                </Typography>
              </Stack>

              <Alert severity="info" sx={{ fontSize: "0.75rem", py: 0.5 }}>
                Your phone tried to send changes that the server could not apply. Pick an option below for each item.
                When a job was already finished on the web, choose <strong>Update this phone</strong> — server data is safe.
              </Alert>

              {conflicted.map(action => {
                const businessRule = isBusinessRuleConflict(action);
                const detail = conflictDetails[action.id];
                const guidance = installerGuidanceForConflict(action, detail);
                const simple = detail?.simpleMode === true;
                return (
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
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
                        {detail?.title ?? actionLabels[action.id]?.title ?? action.entityType}
                      </Typography>
                      {!simple && (
                        <Chip label={businessRule ? "needs review" : "conflict"} color="warning" size="small" sx={{ height: 16, fontSize: "0.62rem" }} />
                      )}
                    </Stack>

                    {guidance ? (
                      <Alert severity="info" sx={{ py: 0.5, fontSize: "0.78rem" }}>
                        {guidance}
                      </Alert>
                    ) : (
                      <Alert severity={businessRule ? "error" : "info"} sx={{ py: 0.25, fontSize: "0.72rem" }}>
                        {conflictSummary(action)}
                      </Alert>
                    )}

                    {loadingConflictIds[action.id] && !detail ? (
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
                        <CircularProgress size={14} />
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Loading comparison…
                        </Typography>
                      </Stack>
                    ) : detail ? (
                      <Stack spacing={1} sx={{ pt: 0.5 }}>
                        {!simple && detail.subtitle && (
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            {detail.subtitle}
                          </Typography>
                        )}

                        {detail.fetchError && !simple && (
                          <Alert severity="info" sx={{ py: 0.25, fontSize: "0.72rem" }}>
                            {detail.fetchError}
                          </Alert>
                        )}

                        {simple ? (
                          <Stack direction="row" spacing={2} sx={{ py: 0.5 }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary">Your phone</Typography>
                              <Typography variant="body2" fontWeight={600}>{detail.fields[0]?.localValue ?? "—"}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary">Server</Typography>
                              <Typography variant="body2" fontWeight={600} color="success.main">{detail.fields[0]?.serverValue ?? "Complete"}</Typography>
                            </Box>
                          </Stack>
                        ) : (
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                          <Box sx={{ flex: 1, border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1, bgcolor: "background.paper" }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                              {detail.localLabel}
                            </Typography>
                            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                              {detail.fields.map((field) => (
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
                              {detail.serverLabel}
                            </Typography>
                            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                              {detail.fields.map((field) => (
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
                        )}
                      </Stack>
                    ) : null}

                    <Stack direction="row" spacing={1} pt={0.5} flexWrap="wrap">
                      {simple ? (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            sx={{ fontSize: "0.78rem", py: 0.5 }}
                            onClick={() => void resolveConflictDiscard(action.id).then(loadQueue)}
                          >
                            Update this phone
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            color="inherit"
                            sx={{ fontSize: "0.7rem", py: 0.25 }}
                            onClick={() => void dismissPendingKeepLocal(action.id).then(loadQueue)}
                          >
                            Dismiss (keep phone as-is)
                          </Button>
                        </>
                      ) : (
                        <>
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        sx={{ fontSize: "0.7rem", py: 0.25 }}
                        onClick={() => void retryPendingAction(action.id).then(loadQueue)}
                      >
                        Retry sync
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        sx={{ fontSize: "0.7rem", py: 0.25 }}
                        onClick={() => void resolveConflictKeep(action.id).then(loadQueue)}
                      >
                        {businessRule ? "Force retry" : "Keep my change"}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        sx={{ fontSize: "0.7rem", py: 0.25 }}
                        onClick={() => void resolveConflictDiscard(action.id).then(loadQueue)}
                      >
                        {businessRule ? "Remove from queue" : "Accept server version"}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        sx={{ fontSize: "0.7rem", py: 0.25 }}
                        onClick={() => void dismissPendingKeepLocal(action.id).then(loadQueue)}
                      >
                        Dismiss
                      </Button>
                        </>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              );})}

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
                          variant="body2"
                          sx={{ fontWeight: 600, fontSize: "0.82rem" }}
                          noWrap
                        >
                          {actionLabels[action.id]?.title ?? action.entityType}
                        </Typography>
                        <Chip
                          label={action.status}
                          color={statusChipColor(action.status)}
                          size="small"
                          sx={{ height: 16, fontSize: "0.62rem" }}
                        />
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
                        {actionLabels[action.id]?.subtitle ?? describeSyncOpType(action)}
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

                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Button
                              size="small"
                              variant="text"
                              sx={{ fontSize: "0.62rem", py: 0, minWidth: 0, textTransform: "none" }}
                              onClick={() => setExpandedDiagIds(prev => ({ ...prev, [action.id]: !prev[action.id] }))}
                            >
                              {expandedDiagIds[action.id] ? "Hide technical details" : "Technical details"}
                            </Button>
                            {(action.status === "failed" || action.lastPayloadBytes != null) && (
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
                            )}
                          </Stack>
                          <Collapse in={!!expandedDiagIds[action.id]}>
                            <Stack spacing={0.25} sx={{ pl: 0.5 }}>
                              {diagnosticDetailRows(action).map(row => (
                                <Typography key={row.label} variant="caption" sx={{ fontSize: "0.62rem", color: "text.secondary", fontFamily: row.label === "API" ? "monospace" : undefined }}>
                                  <Box component="span" sx={{ fontWeight: 600 }}>{row.label}:</Box> {row.value}
                                </Typography>
                              ))}
                            </Stack>
                          </Collapse>
                        </Stack>
                    </Stack>

                    <Stack alignItems="flex-end" spacing={0.5} flexShrink={0}>
                      {(action.status === "failed" || action.conflictDetected) && (
                        <Stack direction="row" spacing={0.5}>
                          <Button
                            size="small"
                            variant="text"
                            sx={{ fontSize: "0.62rem", py: 0, minWidth: 0, textTransform: "none" }}
                            onClick={() => void retryPendingAction(action.id).then(loadQueue)}
                          >
                            Retry
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            color="inherit"
                            sx={{ fontSize: "0.62rem", py: 0, minWidth: 0, textTransform: "none" }}
                            onClick={() => void dismissPendingKeepLocal(action.id).then(loadQueue)}
                          >
                            Dismiss
                          </Button>
                        </Stack>
                      )}
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

          <Box sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: diagnosticsOpen ? 1 : 0 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
                Diagnostics
              </Typography>
              <Button
                size="small"
                variant="text"
                sx={{ textTransform: "none", fontSize: "0.72rem", minWidth: 0 }}
                onClick={() => setDiagnosticsOpen((v) => !v)}
              >
                {diagnosticsOpen ? "Hide" : "Show"}
              </Button>
            </Stack>
            <Collapse in={diagnosticsOpen}>
              <Stack spacing={2} sx={{ pt: 0.5 }}>
                <ConnectivityPerfReadout />
                <Typography variant="caption" color="text.secondary" display="block">
                  Support bundle excludes tokens, passwords, and step/photo content. Attach the JSON to tickets per{" "}
                  <Box component="span" sx={{ fontFamily: "monospace" }}>docs/BUG_TRIAGE.md</Box>.
                </Typography>
                <Button
                  variant="text"
                  size="small"
                  sx={{ textTransform: "none", color: "text.secondary", fontSize: "0.72rem", alignSelf: "flex-start" }}
                  onClick={() => setDebugOpen(true)}
                >
                  View API Debug Log
                </Button>
              </Stack>
            </Collapse>
          </Box>
        </DialogContent>
      </Dialog>

      <ApiDebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </>
  );
}
