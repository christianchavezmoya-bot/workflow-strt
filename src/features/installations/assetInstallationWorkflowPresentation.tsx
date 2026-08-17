import {
  CheckCircleOutlined,
  DrawOutlined,
  ErrorOutlined,
  FileUploadOutlined,
  HistoryOutlined,
  HourglassEmptyOutlined,
  PhotoCameraOutlined,
  PlayArrowOutlined,
  ReportProblemOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import type { MissingMediaFlag } from "../dashboard/photoUploadTypes";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { Project } from "../../types/project";
import type { User } from "../../types/user";
import type { WorkflowAssignment } from "../../types/workflowType";
import type { WorkflowDisplayState } from "../../utils/workflowDisplayState";
import { countMissingWorkflowItems } from "../../utils/workflowCompleteness";
import { STATUS_COLORS } from "./assetStatusDisplay";
import {
  getAssetAttentionSummary,
  getSortedAssetRuns,
  getWorkflowNameForRun,
} from "./assetInstallationWorkflowPresentationLogic";

export type AssetPrimaryAction =
  | {
      label: string;
      tooltip: string;
      color: "success" | "warning" | "error" | "info" | "inherit";
      icon: React.ReactElement;
      onClick: () => void;
      variant?: "contained" | "outlined" | "text";
    }
  | null;

export type InventoryFeatureDef = {
  id: string;
  name: string;
  valueType: string;
  isInventory?: boolean;
};

export type WorkflowPresentationDeps = {
  runsMap: Record<string, AssetWorkflowRun[]>;
  pausedProgress: Record<string, { done: number; total: number }>;
  assignmentsMap: Record<string, WorkflowAssignment[] | undefined>;
  runnerLoading: string | null;
  activeFeatures: InventoryFeatureDef[];
  projectMap: Map<string, Project>;
  users: User[];
  resolveAssetDisplayState: (
    asset: ProjectAsset,
    projectWorkflowMode?: string | null,
  ) => WorkflowDisplayState;
  computeAssetHealth: (
    asset: ProjectAsset,
    runs?: AssetWorkflowRun[],
  ) => "green" | "amber" | "red" | null;
  checkAssignmentThenStart: (asset: ProjectAsset, assignment?: WorkflowAssignment) => void | Promise<void>;
  openBlockingIssue: (asset: ProjectAsset) => void;
  startAssetFromBestWorkflowSource: (asset: ProjectAsset) => void;
  openSignatureFlow: (asset: ProjectAsset, run: AssetWorkflowRun | null) => void | Promise<void>;
  openRunHistory: (
    asset: ProjectAsset,
    wfConfigId?: string,
    wfConfigName?: string,
    entryMode?: "default" | "customer-sign",
  ) => void | Promise<void>;
  setImportDialogAsset: (asset: ProjectAsset) => void;
  setPhotoUploadTarget: (target: MissingMediaFlag | null) => void;
  setProgressPopoverAnchor: (anchor: HTMLElement | null) => void;
  setProgressPopoverAssetId: (assetId: string | null) => void;
};

export function createAssetInstallationWorkflowPresentation(deps: WorkflowPresentationDeps) {
  function openMissingMediaDialog(asset: ProjectAsset, run: AssetWorkflowRun | null) {
    if (!run) return;
    deps.setPhotoUploadTarget({
      id: `asset-${asset.id}-${run.id}`,
      runId: run.id,
      assetId: asset.id,
      assetTag: asset.assetTag || asset.assetName || asset.id,
      jobNumber: deps.projectMap.get(asset.projectId)?.jobNumber ?? "",
      workflowName: getWorkflowNameForRun(run, asset, deps.assignmentsMap[asset.id] ?? []),
      technicianUserId: asset.assignedUserId ?? "",
      technicianName: deps.users.find((user) => user.id === asset.assignedUserId)?.fullName ?? "",
      completedAt: run.completedAt ?? run.updatedAt ?? run.startedAt,
      missingSteps: [],
      totalExpected: 0,
      totalCaptured: 0,
    });
  }

  function getPrimaryAction(
    asset: ProjectAsset,
    projectWorkflowMode?: string | null,
  ): AssetPrimaryAction {
    const loading = deps.runnerLoading === asset.id;
    const summary = getAssetAttentionSummary(asset, deps.runsMap, deps.pausedProgress);
    const openImportDialog = () => deps.setImportDialogAsset(asset);
    const ds = deps.resolveAssetDisplayState(asset, projectWorkflowMode);

    if (!ds.action || ds.action.kind === "none") return null;

    const playIcon = loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />;
    const base = { label: ds.action.label, tooltip: ds.action.tooltip, color: ds.action.color };
    switch (ds.action.kind) {
      case "upload-json":
        return { ...base, icon: <FileUploadOutlined />, onClick: openImportDialog, variant: "outlined" };
      case "start":
        return { ...base, icon: playIcon, onClick: () => deps.checkAssignmentThenStart(asset), variant: "outlined" };
      case "resume":
        return { ...base, icon: playIcon, onClick: () => deps.checkAssignmentThenStart(asset), variant: "outlined" };
      case "continue":
        return { ...base, icon: playIcon, onClick: () => deps.checkAssignmentThenStart(asset), variant: "outlined" };
      case "add-missing-photos":
        return {
          ...base,
          icon: <PhotoCameraOutlined />,
          onClick: () => openMissingMediaDialog(asset, summary.latestRun),
          variant: "outlined",
        };
      case "resolve-blocking":
        return {
          ...base,
          icon: <ReportProblemOutlined />,
          onClick: () =>
            summary.latestRun
              ? deps.openBlockingIssue(asset)
              : void deps.startAssetFromBestWorkflowSource(asset),
          variant: "outlined",
        };
      case "installer-sign":
      case "customer-sign":
        return {
          ...base,
          icon: <DrawOutlined />,
          onClick: () => {
            void deps.openSignatureFlow(asset, summary.latestRun);
          },
          variant: "outlined",
        };
      case "run-details":
        return { ...base, icon: <HistoryOutlined />, onClick: () => deps.openRunHistory(asset), variant: "text" };
      case "no-workflow":
        return null;
      default:
        return null;
    }
  }

  function actionButton(asset: ProjectAsset, projectWorkflowMode?: string | null): ReactNode {
    const primaryAction = getPrimaryAction(asset, projectWorkflowMode);
    const progress = deps.pausedProgress[asset.id];
    const progressBadge = progress ? (
      <Tooltip title="Click to see completed steps">
        <Chip
          size="small"
          label={`${progress.done}/${progress.total} steps`}
          variant="outlined"
          color="warning"
          clickable
          sx={{ fontSize: 10, height: 20 }}
          onClick={(e) => {
            e.stopPropagation();
            deps.setProgressPopoverAnchor(e.currentTarget);
            deps.setProgressPopoverAssetId(asset.id);
          }}
        />
      </Tooltip>
    ) : null;
    if (!primaryAction) return <Typography variant="caption" sx={{ color: "#5a6b7a" }}>No workflow</Typography>;
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
        {progressBadge}
        <Tooltip title={primaryAction.tooltip}>
          <Button
            size="small"
            variant={primaryAction.variant ?? "outlined"}
            color={primaryAction.color}
            startIcon={primaryAction.icon}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        </Tooltip>
      </Stack>
    );
  }

  function captureTableStatusChip(asset: ProjectAsset, projectWorkflowMode?: string | null): ReactNode {
    const status = asset.status as ProjectAssetStatus;
    const baseColor = STATUS_COLORS[status] ?? "default";
    const runs = deps.runsMap[asset.id] ?? [];
    const issueHealth = deps.computeAssetHealth(asset, runs);
    const rowDisplayState = deps.resolveAssetDisplayState(asset, projectWorkflowMode);
    const chipColor =
      status === "Cancelled"
        ? "error"
        : issueHealth === "red"
          ? "error"
          : issueHealth === "amber"
            ? "warning"
            : issueHealth === "green"
              ? "success"
              : baseColor;

    return (
      <Chip
        size="small"
        label={rowDisplayState.status.label}
        color={chipColor}
        icon={
          asset.status === "InProgress" ? (
            <HourglassEmptyOutlined sx={{ fontSize: "0.9rem !important" }} />
          ) : asset.status === "Complete" || asset.status === "Closed" ? (
            <CheckCircleOutlined sx={{ fontSize: "0.9rem !important" }} />
          ) : asset.status === "Issue" ? (
            <ErrorOutlined sx={{ fontSize: "0.9rem !important" }} />
          ) : undefined
        }
      />
    );
  }

  function featureCompletenessChip(asset: ProjectAsset): ReactNode {
    let fv: Record<string, string> = {};
    try {
      fv = JSON.parse(asset.featureValuesJson || "{}");
    } catch {
      /* ignore */
    }
    const inventoryFeatures = deps.activeFeatures.filter((feat) => feat.isInventory);
    const workflowInventoryTotal = asset.workflowSummary?.totalInventoryFeatures ?? 0;
    const workflowInventoryCompleted = asset.workflowSummary?.completedInventoryFeatures ?? 0;
    const fallbackFilled = inventoryFeatures.filter((feat) => {
      const raw = fv[feat.id];
      if (!raw) return false;
      if (feat.valueType === "component") {
        try {
          return Object.values(JSON.parse(raw) as Record<string, string>).some(Boolean);
        } catch {
          return false;
        }
      }
      return true;
    }).length;

    const total = workflowInventoryTotal > 0 ? workflowInventoryTotal : inventoryFeatures.length;
    const filled =
      workflowInventoryTotal > 0 ? Math.min(workflowInventoryCompleted, workflowInventoryTotal) : fallbackFilled;

    const latestRun = getSortedAssetRuns(deps.runsMap, asset.id)[0];
    const paused = Boolean(deps.pausedProgress[asset.id]);

    let evidenceLabel = "Pending";
    let evidenceTitle = "Workflow pending";
    let evidenceColor: "warning" | "success" | "error" | "primary" = "warning";

    if (paused || latestRun?.status === "Paused" || asset.workflowSummary?.evidenceStatus === "Paused") {
      evidenceLabel = "Paused";
      evidenceTitle = "Workflow paused";
    } else if (asset.status === "InProgress" || latestRun?.status === "InProgress") {
      evidenceLabel = "Running";
      evidenceTitle = "Workflow running";
      evidenceColor = "primary";
    } else if (asset.workflowSummary?.hasWorkflow) {
      if (asset.workflowSummary.evidenceStatus === "Running") {
        evidenceLabel = "Running";
        evidenceTitle = "Workflow running";
        evidenceColor = "primary";
      } else if (asset.workflowSummary.evidenceStatus === "Complete") {
        evidenceLabel = "Done";
        evidenceTitle = "Evidence complete";
        evidenceColor = "success";
      } else if (asset.workflowSummary.evidenceStatus === "MissingData") {
        evidenceLabel = "Missing";
        evidenceTitle = "Missing data";
        evidenceColor = "error";
      }
    } else if (latestRun) {
      if (!latestRun.isLocked) {
        evidenceLabel = "Running";
        evidenceTitle = "Workflow running";
        evidenceColor = "primary";
      } else {
        const missingCount = countMissingWorkflowItems(latestRun);
        if (missingCount > 0) {
          evidenceLabel = "Missing";
          evidenceTitle = "Missing data";
          evidenceColor = "error";
        } else {
          evidenceLabel = "Done";
          evidenceTitle = "Evidence complete";
          evidenceColor = "success";
        }
      }
    }

    const inventoryColor = total > 0 && filled === total ? "success" : filled > 0 ? "warning" : "default";
    const inventoryVariant = total > 0 ? "filled" : "outlined";
    const dsWidgets = deps.resolveAssetDisplayState(asset, undefined).feature.widgets;
    const widgetColorHex: Record<string, string> = {
      yellow: "#d79b24",
      grey: "#8a9ba8",
      red: "#d32f2f",
      orange: "#e8833a",
    };

    return (
      <Tooltip
        title={`${total === 0 ? "No inventory features selected on this workflow." : `Inventory features ${filled}/${total}.`} ${evidenceTitle}.`}
      >
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center">
          <Chip
            size="small"
            label={`${filled}/${total} inv`}
            color={inventoryColor as "success" | "warning" | "default"}
            variant={inventoryVariant}
          />
          <Chip size="small" label={evidenceLabel} color={evidenceColor} variant="outlined" />
          {dsWidgets.map((w) => {
            const totalCount = w.openCount + w.resolvedCount;
            const allResolved = w.openCount === 0 && w.resolvedCount > 0;
            const Icon = w.icon === "camera" ? PhotoCameraOutlined : ReportProblemOutlined;
            const hex = widgetColorHex[w.color] ?? "#8a9ba8";
            const title =
              w.kind === "missing-photo"
                ? `${totalCount} missing photo${totalCount !== 1 ? "s" : ""}`
                : w.kind === "issue-high-blocking"
                  ? `${w.openCount} open / ${w.resolvedCount} resolved blocking issue(s)`
                  : w.kind === "high-observation"
                    ? `${w.openCount} open / ${w.resolvedCount} resolved high observation(s)`
                    : w.kind === "issue-medium"
                      ? `${w.openCount} open / ${w.resolvedCount} resolved medium issue(s)`
                      : `${w.openCount} open / ${w.resolvedCount} resolved low issue(s)`;
            return (
              <Tooltip key={w.kind} title={title}>
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, opacity: allResolved ? 0.4 : 1 }}>
                  <Icon sx={{ fontSize: 15, color: hex }} />
                  {totalCount > 1 && (
                    <Typography component="span" sx={{ fontSize: 10, fontWeight: 700, color: hex }}>
                      {totalCount}
                    </Typography>
                  )}
                </Box>
              </Tooltip>
            );
          })}
        </Stack>
      </Tooltip>
    );
  }

  return {
    getPrimaryAction,
    actionButton,
    captureTableStatusChip,
    featureCompletenessChip,
    openMissingMediaDialog,
  };
}

export type AssetInstallationWorkflowPresentation = ReturnType<
  typeof createAssetInstallationWorkflowPresentation
>;
