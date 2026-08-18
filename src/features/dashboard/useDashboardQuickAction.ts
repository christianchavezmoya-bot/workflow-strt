import { useCallback, useEffect, useMemo, useState } from "react";
import { shouldSkipBlockingFetch } from "../../services/connectivityMonitor";
import { assetDocumentLinkService } from "../../services/assetDocumentLinkService";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { assetWorkflowRunService, type OpenIssueRecord, type PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import { projectAssetService, type OpenAssetItem } from "../../services/projectAssetService";
import { workflowConfigService } from "../../services/workflowConfigService";
import { workflowTypeService } from "../../services/workflowTypeService";
import { WorkflowAssignmentRepository } from "../../repositories/WorkflowAssignmentRepository";
import { entityGetAsset } from "../../services/localDB";
import { getWorkflowDisplayState, type WorkflowDisplayState } from "../../utils/workflowDisplayState";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import type { WorkflowConfig } from "../../types/workflowConfig";
import { resolveConfigWorkflowTypeId } from "../installations/assetInstallationPageLogic";
import type { QuickActionPrimaryAction } from "./DashboardQuickActionDialog";
import type { MissingMediaFlag } from "./photoUploadTypes";
import {
  isPausedAsset,
  myJobsAssetIdsKey,
  pendingSignatureStageLabel,
  type MyJobsCardAction,
} from "./dashboardPageLogic";
import {
  canStartDirectlyFromDashboard,
  computeQuickActionAttention,
  getMyJobsCardAction,
  loadQuickActionContext,
  type AutoAssignConfirmState,
  type DashboardProductWorkflow,
  type NativeMyJobsCardContext,
  type QuickActionAsset,
} from "./dashboardQuickActionLogic";

export type OpenRunnerWithPayload = (
  asset: QuickActionAsset,
  configId: string,
  source: string,
  options?: {
    runs?: AssetWorkflowRun[];
    existingRunId?: string;
    onOpened?: () => void;
  },
) => Promise<boolean>;

export type UseDashboardQuickActionParams = {
  myInstallAssets: QuickActionAsset[];
  openIssues: OpenIssueRecord[];
  pendingSigs: PendingSignatureRecord[];
  missingMediaFlags: MissingMediaFlag[];
  userId: string;
  userFullName: string;
  isNativePlatform: boolean;
  setOpenAssets: React.Dispatch<React.SetStateAction<OpenAssetItem[]>>;
  setDashboardError: (message: string) => void;
  openIssueRepair: (issue: OpenIssueRecord) => Promise<void>;
  openSignatureRepair: (sig: PendingSignatureRecord) => void;
  setPhotoUploadMode: (mode: "installer" | "pm") => void;
  setPhotoUploadTarget: (target: MissingMediaFlag | null) => void;
  openRunnerWithPayload: OpenRunnerWithPayload;
  setRunnerLoading: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useDashboardQuickAction({
  myInstallAssets,
  openIssues,
  pendingSigs,
  missingMediaFlags,
  userId,
  userFullName,
  isNativePlatform,
  setOpenAssets,
  setDashboardError,
  openIssueRepair,
  openSignatureRepair,
  setPhotoUploadMode,
  setPhotoUploadTarget,
  openRunnerWithPayload,
  setRunnerLoading,
}: UseDashboardQuickActionParams) {
  const [nativeMyJobsCardContext, setNativeMyJobsCardContext] = useState<Record<string, NativeMyJobsCardContext>>({});
  const [dashboardAssignmentsMap, setDashboardAssignmentsMap] = useState<Record<string, WorkflowAssignment[]>>({});

  const [quickActionAsset, setQuickActionAsset] = useState<QuickActionAsset | null>(null);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [quickActionAssignments, setQuickActionAssignments] = useState<WorkflowAssignment[]>([]);
  const [quickActionRuns, setQuickActionRuns] = useState<AssetWorkflowRun[]>([]);
  const [quickActionLoading, setQuickActionLoading] = useState(false);
  const [autoAssignConfirm, setAutoAssignConfirm] = useState<AutoAssignConfirmState | null>(null);
  const [importDialogAsset, setImportDialogAsset] = useState<{ id: string; assetTag?: string; assetName?: string; projectId: string } | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [docsDialogAsset, setDocsDialogAsset] = useState<QuickActionAsset | null>(null);
  const [docsCount, setDocsCount] = useState(0);
  const [docsLoading, setDocsLoading] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ workflowTypeId: "", workflowConfigId: "" });
  const [assignSaving, setAssignSaving] = useState(false);
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
  const [workflowConfigs, setWorkflowConfigs] = useState<WorkflowConfig[]>([]);
  const [productWorkflow, setProductWorkflow] = useState<DashboardProductWorkflow>(null);

  const myInstallAssetIdsKey = useMemo(() => myJobsAssetIdsKey(myInstallAssets), [myInstallAssets]);

  useEffect(() => {
    if (myInstallAssets.length === 0) {
      setNativeMyJobsCardContext({});
      return;
    }

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        myInstallAssets.map(async (asset) => {
          if (isNativePlatform) {
            const [cachedAsset, runs] = await Promise.all([
              entityGetAsset(asset.id),
              assetWorkflowRunService.listLocalByAsset(asset.id),
            ]);
            const data = cachedAsset?.data as ProjectAsset | undefined;
            if (!data) return null;
            return [asset.id, { asset: data, runs }] as const;
          }

          if (shouldSkipBlockingFetch()) return null;

          const [fullAsset, runs] = await Promise.all([
            projectAssetService.getById(asset.id).catch(() => null),
            assetWorkflowRunService.listByAsset(asset.id).catch(() => [] as AssetWorkflowRun[]),
          ]);
          if (!fullAsset) return null;
          return [asset.id, { asset: fullAsset, runs }] as const;
        }),
      );

      if (cancelled) return;
      setNativeMyJobsCardContext((prev) => {
        const fresh: Record<string, NativeMyJobsCardContext> = {};
        for (const entry of entries) {
          if (!entry) continue;
          fresh[entry[0]] = entry[1];
        }
        const merged: Record<string, NativeMyJobsCardContext> = {};
        for (const asset of myInstallAssets) {
          if (fresh[asset.id]) {
            merged[asset.id] = fresh[asset.id];
            continue;
          }
          if (prev[asset.id]) {
            merged[asset.id] = prev[asset.id];
          }
        }
        return merged;
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlatform, myInstallAssetIdsKey]);

  const nativeMyJobsDisplayStateByAssetId = useMemo(() => {
    const map = new Map<string, WorkflowDisplayState>();
    for (const asset of myInstallAssets) {
      const ctx = nativeMyJobsCardContext[asset.id];
      if (!ctx) continue;
      map.set(asset.id, getWorkflowDisplayState(ctx.asset, ctx.runs, {
        paused: isPausedAsset(asset.runStatus),
        inspectionMode: asset.workflowMode === "INSPECTION_ONLY",
        hasRunnableWorkflowSource:
          ctx.runs.length > 0
          || !!ctx.asset.productConfigId
          || !!ctx.asset.workflowTemplateId
          || !!ctx.asset.workflowSummary?.hasWorkflow,
      }));
    }
    return map;
  }, [myInstallAssets, nativeMyJobsCardContext]);

  useEffect(() => {
    const handler = (event: Event) => {
      const assetId = (event as CustomEvent<{ assetId?: string }>).detail?.assetId;
      if (!assetId) return;
      const loadRuns = isNativePlatform
        ? assetWorkflowRunService.listLocalByAsset(assetId)
        : shouldSkipBlockingFetch()
          ? Promise.resolve(null)
          : assetWorkflowRunService.listByAsset(assetId);
      void loadRuns.then((runs) => {
        if (!runs) return;
        setNativeMyJobsCardContext((prev) => {
          const existing = prev[assetId];
          if (!existing) return prev;
          return { ...prev, [assetId]: { ...existing, runs } };
        });
      });
    };
    window.addEventListener("workflow-runs-cache-updated", handler as EventListener);
    return () => window.removeEventListener("workflow-runs-cache-updated", handler as EventListener);
  }, [isNativePlatform]);

  useEffect(() => {
    if (!isNativePlatform || myInstallAssets.length === 0) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        myInstallAssets.map(async (asset) => {
          const local = await WorkflowAssignmentRepository.getLocalByAsset(asset.id).catch(() => []);
          return [asset.id, local] as const;
        }),
      );
      if (cancelled) return;
      setDashboardAssignmentsMap((prev) => {
        const next = { ...prev };
        for (const [assetId, local] of entries) {
          if (local.length > 0) next[assetId] = local;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlatform, myInstallAssetIdsKey]);

  useEffect(() => {
    if (!isNativePlatform || myInstallAssets.length === 0 || shouldSkipBlockingFetch()) return;
    for (const asset of myInstallAssets) {
      void assetWorkflowAssignmentService.listByAsset(asset.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlatform, myInstallAssetIdsKey]);

  useEffect(() => {
    if (!isNativePlatform) return;
    const onAssignmentsUpdated = (event: Event) => {
      const assetId = (event as CustomEvent<{ assetId?: string }>).detail?.assetId;
      if (!assetId) return;
      void WorkflowAssignmentRepository.getLocalByAsset(assetId)
        .then((local) => {
          if (local.length === 0) return;
          setDashboardAssignmentsMap((prev) => ({ ...prev, [assetId]: local }));
        })
        .catch(() => {});
    };
    window.addEventListener("repo:assignments:updated", onAssignmentsUpdated);
    return () => window.removeEventListener("repo:assignments:updated", onAssignmentsUpdated);
  }, [isNativePlatform]);

  const closeQuickActionDialog = useCallback(() => {
    setQuickActionOpen(false);
    setQuickActionAsset(null);
    setQuickActionAssignments([]);
    setQuickActionRuns([]);
  }, []);

  const quickActionAttention = useMemo(
    () => computeQuickActionAttention({
      asset: quickActionAsset,
      runs: quickActionRuns,
      openIssues,
      pendingSigs,
      missingMediaFlags,
      technicianName: userFullName,
    }),
    [missingMediaFlags, openIssues, pendingSigs, quickActionAsset, quickActionRuns, userFullName],
  );

  const getMyJobsCardActionForAsset = useCallback((asset: QuickActionAsset): MyJobsCardAction => (
    getMyJobsCardAction({
      asset,
      isNativePlatform,
      pendingSigs,
      missingMediaFlags,
      nativeMyJobsDisplayStateByAssetId,
    })
  ), [isNativePlatform, missingMediaFlags, nativeMyJobsDisplayStateByAssetId, pendingSigs]);

  useEffect(() => {
    if (!isNativePlatform || !quickActionOpen || !quickActionAsset) return;
    const asset = quickActionAsset;
    const onAssignmentsUpdated = (event: Event) => {
      const assetId = (event as CustomEvent<{ assetId?: string }>).detail?.assetId;
      if (assetId !== asset.id) return;
      void loadQuickActionContext({
        asset,
        dashboardAssignmentsMap,
        nativeMyJobsCardContext,
      }).then((ctx) => {
        setQuickActionAssignments(ctx.assignments);
        setQuickActionRuns(ctx.runs);
        setProductWorkflow(ctx.resolvedProductWorkflow);
      });
    };
    window.addEventListener("repo:assignments:updated", onAssignmentsUpdated);
    return () => window.removeEventListener("repo:assignments:updated", onAssignmentsUpdated);
  }, [dashboardAssignmentsMap, isNativePlatform, nativeMyJobsCardContext, quickActionAsset, quickActionOpen]);

  const startWorkflowFromDashboard = useCallback(async (
    asset: QuickActionAsset,
    assignment: WorkflowAssignment,
    runsOverride?: AssetWorkflowRun[],
  ) => {
    await openRunnerWithPayload(asset, assignment.workflowConfigId, "dashboard-start", {
      runs: runsOverride ?? quickActionRuns,
      onOpened: closeQuickActionDialog,
    });
  }, [closeQuickActionDialog, openRunnerWithPayload, quickActionRuns]);

  const resumeActiveRunFromDashboard = useCallback(async (asset: QuickActionAsset, run: AssetWorkflowRun): Promise<boolean> => (
    openRunnerWithPayload(asset, run.workflowConfigId, "dashboard-resume", {
      existingRunId: run.id,
      onOpened: closeQuickActionDialog,
    })
  ), [closeQuickActionDialog, openRunnerWithPayload]);

  const launchProductWorkflowFromDashboard = useCallback(async (
    asset: QuickActionAsset,
    workflowMeta: { configId: string; configName: string; workflowTypeId?: string },
  ) => {
    const opened = await openRunnerWithPayload(asset, workflowMeta.configId, "dashboard-product", {
      onOpened: closeQuickActionDialog,
    });
    if (!opened) return;
  }, [closeQuickActionDialog, openRunnerWithPayload]);

  const checkAssignmentThenStartFromDashboard = useCallback((asset: QuickActionAsset, assignment?: WorkflowAssignment) => {
    if (!asset.assignedUserId) {
      setAutoAssignConfirm({ asset, assignment, reason: "unassigned" });
      return;
    }
    if (asset.assignedUserId !== userId) {
      setAutoAssignConfirm({ asset, assignment, reason: "other", otherName: "another user" });
      return;
    }
    if (assignment) {
      void startWorkflowFromDashboard(asset, assignment);
    }
  }, [startWorkflowFromDashboard, userId]);

  const openQuickActionDialog = useCallback(async (asset: QuickActionAsset) => {
    setQuickActionAsset(asset);
    setQuickActionOpen(true);
    setQuickActionLoading(true);
    setDocsLoading(true);
    setProductWorkflow(null);
    try {
      const { assignments, runs, resolvedProductWorkflow } = await loadQuickActionContext({
        asset,
        dashboardAssignmentsMap,
        nativeMyJobsCardContext,
      });
      const docs = await assetDocumentLinkService.listByAsset(asset.id).catch(() => []);
      setQuickActionAssignments(assignments);
      setQuickActionRuns(runs);
      setDocsCount(Array.isArray(docs) ? docs.length : 0);
      setProductWorkflow(resolvedProductWorkflow);
    } catch {
      setQuickActionAssignments([]);
      setQuickActionRuns([]);
      setDocsCount(0);
    } finally {
      setQuickActionLoading(false);
      setDocsLoading(false);
    }
  }, [dashboardAssignmentsMap, nativeMyJobsCardContext]);

  const openQuickActionOrStart = useCallback(async (asset: QuickActionAsset) => {
    setQuickActionLoading(true);
    setRunnerLoading(asset.id);
    setDocsLoading(true);
    let docsLoadDeferred = false;
    try {
      const { assignments, runs, resolvedProductWorkflow } = await loadQuickActionContext({
        asset,
        dashboardAssignmentsMap,
        nativeMyJobsCardContext,
      });

      assetWorkflowRunService.refreshByAssetInBackground(asset.id);

      const attention = computeQuickActionAttention({
        asset,
        runs,
        openIssues,
        pendingSigs,
        missingMediaFlags,
        technicianName: userFullName,
      });
      if (attention.pendingSignature) {
        openSignatureRepair(attention.pendingSignature);
        return;
      }
      if (attention.activeRun && !attention.activeRun.isLocked) {
        const launched = await resumeActiveRunFromDashboard(asset, attention.activeRun);
        if (launched) return;
      }

      if (assignments.length === 1 && canStartDirectlyFromDashboard({
        asset,
        assignments,
        runs,
        productWorkflow: null,
        userId,
        openIssues,
        pendingSigs,
        missingMediaFlags,
        technicianName: userFullName,
      })) {
        await startWorkflowFromDashboard(asset, assignments[0], runs);
        return;
      }

      if (canStartDirectlyFromDashboard({
        asset,
        assignments,
        runs,
        productWorkflow: resolvedProductWorkflow,
        userId,
        openIssues,
        pendingSigs,
        missingMediaFlags,
        technicianName: userFullName,
      })) {
        if (assignments.length === 1) {
          await startWorkflowFromDashboard(asset, assignments[0], runs);
          return;
        }
        if (resolvedProductWorkflow) {
          await launchProductWorkflowFromDashboard(asset, resolvedProductWorkflow);
          return;
        }
      }

      setQuickActionAsset(asset);
      setQuickActionAssignments(assignments);
      setQuickActionRuns(runs);
      setDocsCount(0);
      setProductWorkflow(resolvedProductWorkflow);
      setQuickActionOpen(true);

      docsLoadDeferred = true;
      void assetDocumentLinkService.listByAsset(asset.id)
        .then((links) => setDocsCount(links.length))
        .catch(() => setDocsCount(0))
        .finally(() => setDocsLoading(false));
    } catch {
      setQuickActionAsset(asset);
      setQuickActionAssignments([]);
      setQuickActionRuns([]);
      setDocsCount(0);
      setProductWorkflow(null);
      setQuickActionOpen(true);
    } finally {
      setRunnerLoading((current) => (current === asset.id ? null : current));
      if (!docsLoadDeferred) setDocsLoading(false);
      setQuickActionLoading(false);
    }
  }, [
    dashboardAssignmentsMap,
    launchProductWorkflowFromDashboard,
    missingMediaFlags,
    nativeMyJobsCardContext,
    openIssues,
    openSignatureRepair,
    pendingSigs,
    resumeActiveRunFromDashboard,
    setRunnerLoading,
    startWorkflowFromDashboard,
    userFullName,
    userId,
  ]);

  const openMissingMediaFromDashboardAsset = useCallback(async (asset: QuickActionAsset) => {
    setRunnerLoading(asset.id);
    try {
      const runs = await assetWorkflowRunService.listByAsset(asset.id).catch(() => []);
      const missingMedia = computeQuickActionAttention({
        asset,
        runs,
        openIssues,
        pendingSigs,
        missingMediaFlags,
        technicianName: userFullName,
      }).missingMedia;
      if (!missingMedia) {
        await openQuickActionOrStart(asset);
        return;
      }
      setPhotoUploadMode("installer");
      setPhotoUploadTarget(missingMedia);
    } finally {
      setRunnerLoading((current) => (current === asset.id ? null : current));
    }
  }, [missingMediaFlags, openIssues, openQuickActionOrStart, pendingSigs, setPhotoUploadMode, setPhotoUploadTarget, setRunnerLoading, userFullName]);

  const handleMyJobsAssetTap = useCallback(async (asset: QuickActionAsset, cardAction?: MyJobsCardAction) => {
    const action = cardAction ?? getMyJobsCardActionForAsset(asset);
    if (action.actionKind === "missing-media") {
      await openMissingMediaFromDashboardAsset(asset);
      return;
    }
    if (action.actionKind === "resolve-blocking") {
      const blockingIssue = openIssues.find((issue) => issue.assetId === asset.id && issue.isBlocking);
      if (blockingIssue) {
        setRunnerLoading(asset.id);
        try {
          await openIssueRepair(blockingIssue);
        } finally {
          setRunnerLoading((current) => (current === asset.id ? null : current));
        }
        return;
      }
    }
    const pendingSignature = pendingSigs.find((sig) => sig.assetId === asset.id);
    if (action.actionKind === "signature" || pendingSignature) {
      if (pendingSignature) {
        openSignatureRepair(pendingSignature);
        return;
      }
    }
    await openQuickActionOrStart(asset);
  }, [getMyJobsCardActionForAsset, openIssueRepair, openMissingMediaFromDashboardAsset, openQuickActionOrStart, openIssues, openSignatureRepair, pendingSigs, setRunnerLoading]);

  const quickActionPrimaryAction = useMemo((): QuickActionPrimaryAction | null => {
    if (!quickActionAsset) return null;

    const assignmentForActiveRun =
      quickActionAttention.activeRun
        ? quickActionAssignments.find(
            (assignment) => assignment.workflowConfigId === quickActionAttention.activeRun?.workflowConfigId,
          ) ?? null
        : null;
    const primaryAssignment = quickActionAssignments[0] ?? null;
    const hasMatchingActiveRun = primaryAssignment
      ? quickActionRuns.some((run) => !run.isLocked && run.workflowConfigId === primaryAssignment.workflowConfigId)
      : false;

    if (quickActionAttention.missingMedia) {
      return {
        label: isNativePlatform ? "Add Photos" : "Add Missing Photos",
        color: "warning",
        onClick: () => {
          setPhotoUploadMode("installer");
          setPhotoUploadTarget(quickActionAttention.missingMedia);
          closeQuickActionDialog();
        },
      };
    }

    if (quickActionAttention.activeRun && assignmentForActiveRun) {
      return {
        label: "Resume Run",
        color: "primary",
        onClick: () => checkAssignmentThenStartFromDashboard(quickActionAsset, assignmentForActiveRun),
      };
    }

    if (quickActionAttention.blockingIssues.length > 0) {
      return {
        label: isNativePlatform ? "Resolve Issue" : "Resolve Blocking Issue",
        color: "error",
        onClick: () => {
          closeQuickActionDialog();
          void openIssueRepair(quickActionAttention.blockingIssues[0]);
        },
      };
    }

    if (quickActionAttention.pendingSignature) {
      const pendingSignature = quickActionAttention.pendingSignature;
      return {
        label: pendingSignatureStageLabel(pendingSignature.signatureStatus),
        color: "warning",
        onClick: () => {
          closeQuickActionDialog();
          openSignatureRepair(pendingSignature);
        },
      };
    }

    if (quickActionAttention.highObservations.length > 0) {
      return {
        label: "Review Observation / Scope",
        color: "info",
        onClick: () => {
          closeQuickActionDialog();
          void openIssueRepair(quickActionAttention.highObservations[0]);
        },
      };
    }

    if (primaryAssignment) {
      return {
        label: hasMatchingActiveRun ? "Resume Run" : "Start Run",
        color: hasMatchingActiveRun ? "primary" : "success",
        onClick: () => checkAssignmentThenStartFromDashboard(quickActionAsset, primaryAssignment),
      };
    }

    if (productWorkflow) {
      return {
        label: "Start Run",
        color: "success",
        onClick: () => { void launchProductWorkflowFromDashboard(quickActionAsset, productWorkflow); },
      };
    }

    return null;
  }, [
    checkAssignmentThenStartFromDashboard,
    closeQuickActionDialog,
    isNativePlatform,
    launchProductWorkflowFromDashboard,
    openIssueRepair,
    openSignatureRepair,
    productWorkflow,
    quickActionAsset,
    quickActionAssignments,
    quickActionAttention,
    quickActionRuns,
    setPhotoUploadMode,
    setPhotoUploadTarget,
  ]);

  const confirmAutoAssignAndStartFromDashboard = useCallback(async () => {
    if (!autoAssignConfirm) return;
    const { asset, assignment } = autoAssignConfirm;
    setAutoAssignConfirm(null);
    try {
      await projectAssetService.patchAssignment(asset.id, userId);
      projectAssetService.listOpen().then(setOpenAssets).catch(() => {});
    } catch {
      setDashboardError("Could not assign this asset to you. The run was not started — please try again.");
      return;
    }
    if (assignment) {
      void startWorkflowFromDashboard(asset, assignment);
    }
  }, [autoAssignConfirm, setDashboardError, setOpenAssets, startWorkflowFromDashboard, userId]);

  const openAssignDialogFromDashboard = useCallback(async () => {
    if (!quickActionAsset) return;
    setAssignForm({ workflowTypeId: "", workflowConfigId: "" });
    setAssignDialogOpen(true);
    try {
      const fullAsset = await projectAssetService.getByIdLocalFirst(quickActionAsset.id);
      if (!fullAsset?.productId) {
        setWorkflowConfigs([]);
        return;
      }
      const [types, cfgs] = await Promise.all([
        workflowTypeService.list(),
        workflowConfigService.listByProduct(fullAsset.productId, "Published"),
      ]);
      setWorkflowTypes(types);
      setWorkflowConfigs(cfgs);
    } catch {
      setWorkflowConfigs([]);
    }
  }, [quickActionAsset]);

  const saveAssignmentFromDashboard = useCallback(async () => {
    if (!quickActionAsset || !assignForm.workflowConfigId) return;
    const cfg = workflowConfigs.find((c) => c.id === assignForm.workflowConfigId);
    const workflowTypeId = cfg ? resolveConfigWorkflowTypeId(cfg, workflowTypes) || (cfg.workflowTypeId ?? "") : "";
    if (!workflowTypeId) {
      alert("Could not determine the workflow type for this config. Reconnect and try again.");
      return;
    }
    setAssignSaving(true);
    try {
      await assetWorkflowAssignmentService.create(quickActionAsset.id, assignForm.workflowConfigId, workflowTypeId);
      const [assignments, runs] = await Promise.all([
        assetWorkflowAssignmentService.listByAsset(quickActionAsset.id),
        assetWorkflowRunService.listByAsset(quickActionAsset.id),
      ]);
      setQuickActionAssignments(assignments);
      setQuickActionRuns(runs);
      setAssignDialogOpen(false);
      setAssignForm({ workflowTypeId: "", workflowConfigId: "" });
    } catch (err) {
      console.error("[Dashboard] Failed to save assignment", err);
      alert("Failed to assign workflow. Please try again.");
    } finally {
      setAssignSaving(false);
    }
  }, [assignForm.workflowConfigId, quickActionAsset, workflowConfigs, workflowTypes]);

  return {
    nativeMyJobsCardContext,
    quickActionOpen,
    quickActionLoading,
    quickActionAsset,
    quickActionAttention,
    quickActionAssignments,
    quickActionRuns,
    productWorkflow,
    quickActionPrimaryAction,
    autoAssignConfirm,
    setAutoAssignConfirm,
    docsLoading,
    docsCount,
    setDocsCount,
    docsDialogOpen,
    setDocsDialogOpen,
    docsDialogAsset,
    setDocsDialogAsset,
    importDialogOpen,
    setImportDialogOpen,
    importDialogAsset,
    setImportDialogAsset,
    assignDialogOpen,
    setAssignDialogOpen,
    assignForm,
    setAssignForm,
    assignSaving,
    workflowTypes,
    workflowConfigs,
    closeQuickActionDialog,
    openQuickActionDialog,
    openQuickActionOrStart,
    getMyJobsCardAction: getMyJobsCardActionForAsset,
    handleMyJobsAssetTap,
    checkAssignmentThenStartFromDashboard,
    launchProductWorkflowFromDashboard,
    confirmAutoAssignAndStartFromDashboard,
    openAssignDialogFromDashboard,
    saveAssignmentFromDashboard,
  };
}
