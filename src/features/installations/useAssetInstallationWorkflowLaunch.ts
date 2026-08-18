import { useCallback } from "react";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { projectAssetService } from "../../services/projectAssetService";
import {
  loadWorkflowOpenPayload,
  refreshWorkflowOpenDataInBackground,
} from "../../services/workflowOpenService";
import { workflowConfigService } from "../../services/workflowConfigService";
import type { FeatureSelection } from "../../services/productConfigService";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { Workflow } from "../../types/workflow";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import type { User } from "../../types/user";
import { markWorkflowOpenTap } from "../../utils/workflowOpenPerf";
import {
  pickPreferredAssignment,
  workflowTypeMismatchMessage,
} from "./assetInstallationPageLogic";

export type AssetInstallationAutoAssignConfirm = {
  asset: ProjectAsset;
  assignment?: WorkflowAssignment;
  reason: "unassigned" | "other";
  otherName?: string;
};

export type AssetInstallationWfMismatchConfirm = {
  asset: ProjectAsset;
  assignment: WorkflowAssignment;
  message: string;
};

export type UseAssetInstallationWorkflowLaunchDeps = {
  runsMap: Record<string, AssetWorkflowRun[]>;
  wfConfigMap: Map<string, WorkflowConfig>;
  publishedWfConfigs: WorkflowConfig[];
  workflowConfigs: WorkflowConfig[];
  workflowTypes: WorkflowType[];
  currentUserId: string;
  users: User[];
  autoAssignConfirm: AssetInstallationAutoAssignConfirm | null;
  setAssignmentsMap: React.Dispatch<React.SetStateAction<Record<string, WorkflowAssignment[]>>>;
  setAssets: React.Dispatch<React.SetStateAction<ProjectAsset[]>>;
  setInlineSaveError: React.Dispatch<React.SetStateAction<string | null>>;
  setRunnerLoading: React.Dispatch<React.SetStateAction<string | null>>;
  setRunnerExistingRunId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setRunnerAsset: React.Dispatch<React.SetStateAction<ProjectAsset | null>>;
  setRunnerWorkflow: React.Dispatch<React.SetStateAction<Workflow | null>>;
  setRunnerWorkflowConfigId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setRunnerFeatureSelections: React.Dispatch<React.SetStateAction<FeatureSelection[] | undefined>>;
  setRunnerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setWfMismatchConfirm: React.Dispatch<React.SetStateAction<AssetInstallationWfMismatchConfirm | null>>;
  setAutoAssignConfirm: React.Dispatch<React.SetStateAction<AssetInstallationAutoAssignConfirm | null>>;
  parseFeatureSelectionsForConfig: (configId: string | undefined) => FeatureSelection[] | undefined;
  handleStartWorkOrder: (asset: ProjectAsset) => Promise<void>;
};

export type UseAssetInstallationWorkflowLaunchResult = {
  resolvePreferredAssignment: (asset: ProjectAsset) => Promise<WorkflowAssignment | null>;
  startAssetFromBestWorkflowSource: (asset: ProjectAsset) => Promise<void>;
  doStartAssignmentRun: (asset: ProjectAsset, assignment: WorkflowAssignment) => Promise<void>;
  handleStartAssignmentRun: (asset: ProjectAsset, assignment: WorkflowAssignment) => Promise<void>;
  checkAssignmentThenStart: (asset: ProjectAsset, assignment?: WorkflowAssignment) => Promise<void>;
  confirmAutoAssignAndStart: () => Promise<void>;
};

export function useAssetInstallationWorkflowLaunch(
  deps: UseAssetInstallationWorkflowLaunchDeps,
): UseAssetInstallationWorkflowLaunchResult {
  const {
    runsMap,
    wfConfigMap,
    publishedWfConfigs,
    workflowConfigs,
    workflowTypes,
    currentUserId,
    users,
    autoAssignConfirm,
    setAssignmentsMap,
    setAssets,
    setInlineSaveError,
    setRunnerLoading,
    setRunnerExistingRunId,
    setRunnerAsset,
    setRunnerWorkflow,
    setRunnerWorkflowConfigId,
    setRunnerFeatureSelections,
    setRunnerOpen,
    setWfMismatchConfirm,
    setAutoAssignConfirm,
    parseFeatureSelectionsForConfig,
    handleStartWorkOrder,
  } = deps;

  const resolvePreferredAssignment = useCallback(async (asset: ProjectAsset): Promise<WorkflowAssignment | null> => {
    // Always defer to the service's own local-first + background-refresh
    // pattern rather than short-circuiting on assignmentsMap directly — that
    // in-memory map is only ever populated once per asset per page session
    // (e.g. from the mobile offline-cache priming pass) and never
    // invalidated, so a short-circuit here meant a newly-assigned or
    // reassigned workflow made server-side (e.g. from the web) stayed
    // invisible until something else happened to force a refetch (expanding
    // the row, reopening run history, etc.) — even while fully online.
    // listByAsset is cheap to call repeatedly: it resolves from local cache
    // instantly and only awaits the network when there's truly nothing local.
    try {
      const assignments = await assetWorkflowAssignmentService.listByAsset(asset.id);
      setAssignmentsMap((prev) => ({ ...prev, [asset.id]: assignments }));
      return pickPreferredAssignment(asset, assignments, runsMap[asset.id] ?? []) ?? null;
    } catch {
      return null;
    }
  }, [runsMap, setAssignmentsMap]);

  const doStartAssignmentRun = useCallback(async (asset: ProjectAsset, assignment: WorkflowAssignment) => {
    markWorkflowOpenTap("assets-assignment", assignment.workflowConfigId);
    setRunnerLoading(asset.id);
    try {
      const cfgFromMemory = wfConfigMap.get(assignment.workflowConfigId)
        ?? publishedWfConfigs.find((c) => c.id === assignment.workflowConfigId)
        ?? null;
      const payload = await loadWorkflowOpenPayload(assignment.workflowConfigId, asset, {
        configFromMemory: cfgFromMemory,
        runs: runsMap[asset.id],
        workflowConfigIdForRun: assignment.workflowConfigId,
        mergeMedia: true,
      });
      if (!payload) { alert("Workflow config not found."); return; }

      setRunnerExistingRunId(payload.existingRunId);
      setRunnerAsset(asset);
      setRunnerWorkflow(payload.workflow);
      setRunnerWorkflowConfigId(assignment.workflowConfigId);
      setRunnerFeatureSelections(parseFeatureSelectionsForConfig(assignment.workflowConfigId));
      setRunnerOpen(true);
      refreshWorkflowOpenDataInBackground(asset.id, assignment.workflowConfigId);
    } catch { alert("Failed to load workflow."); } finally {
      setRunnerLoading(null);
    }
  }, [
    parseFeatureSelectionsForConfig,
    publishedWfConfigs,
    runsMap,
    setRunnerAsset,
    setRunnerExistingRunId,
    setRunnerFeatureSelections,
    setRunnerLoading,
    setRunnerOpen,
    setRunnerWorkflow,
    setRunnerWorkflowConfigId,
    wfConfigMap,
  ]);

  const handleStartAssignmentRun = useCallback(async (asset: ProjectAsset, assignment: WorkflowAssignment) => {
    // Workflow type / config type mismatch guard - warn before proceeding.
    const matchedTypeName = workflowTypes.find((t) => t.id === assignment.workflowTypeId)?.name
      ?? assignment.workflowTypeName;
    const matchedCfg = wfConfigMap.get(assignment.workflowConfigId)
      ?? workflowConfigs.find((c) => c.id === assignment.workflowConfigId)
      ?? await workflowConfigService.getById(assignment.workflowConfigId);
    const mismatchMsg = workflowTypeMismatchMessage(matchedTypeName, matchedCfg?.configType);
    if (mismatchMsg) {
      setWfMismatchConfirm({ asset, assignment, message: mismatchMsg });
      return;
    }
    await doStartAssignmentRun(asset, assignment);
  }, [doStartAssignmentRun, setWfMismatchConfirm, wfConfigMap, workflowConfigs, workflowTypes]);

  const startAssetFromBestWorkflowSource = useCallback(async (asset: ProjectAsset) => {
    const assignment = await resolvePreferredAssignment(asset);
    if (assignment) {
      await handleStartAssignmentRun(asset, assignment);
      return;
    }

    await handleStartWorkOrder(asset);
  }, [handleStartAssignmentRun, handleStartWorkOrder, resolvePreferredAssignment]);

  const checkAssignmentThenStart = useCallback(async (asset: ProjectAsset, assignment?: WorkflowAssignment) => {
    if (!asset.assignedUserId) {
      // Unassigned - warn and auto-assign
      setAutoAssignConfirm({ asset, assignment, reason: "unassigned" });
      return;
    }
    if (asset.assignedUserId !== currentUserId) {
      // Assigned to someone else - warn before taking over
      const otherName = users.find((u) => u.id === asset.assignedUserId)?.fullName ?? "another user";
      setAutoAssignConfirm({ asset, assignment, reason: "other", otherName });
      return;
    }
    // Assigned to me - start directly
    if (assignment) {
      await handleStartAssignmentRun(asset, assignment);
      return;
    }

    await startAssetFromBestWorkflowSource(asset);
  }, [
    currentUserId,
    handleStartAssignmentRun,
    setAutoAssignConfirm,
    startAssetFromBestWorkflowSource,
    users,
  ]);

  const confirmAutoAssignAndStart = useCallback(async () => {
    if (!autoAssignConfirm) return;
    const { asset, assignment } = autoAssignConfirm;
    setAutoAssignConfirm(null);

    // Persist the assignment via the narrow, installer-permitted endpoint.
    //
    // This previously called projectAssetService.update() (the broad PUT), which is
    // Admin/PM-only — so an Installer's claim/takeover 403'd, the failure was swallowed
    // by an empty catch, and the run started anyway from an in-memory object carrying
    // the new user. Net effect: the RUN recorded the new owner (correct in the report)
    // while the ASSET kept the old one. Because asset.assignedUserId is what the Assets
    // installer column AND the Dashboard "My Jobs Today" query both read, the new owner
    // never saw the job in their dashboard and the previous owner still did.
    //
    // We now use patchAssignment() (permitted for installers, self-assign only) and do
    // NOT continue if it fails: a run whose ownership didn't persist is a job that never
    // appears in the owner's queue, which is exactly the failure we're fixing.
    try {
      const saved = await projectAssetService.patchAssignment(asset.id, currentUserId);
      setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, assignedUserId: saved.assignedUserId } : a));
    } catch {
      setInlineSaveError("Could not assign this asset to you. The run was not started — please try again.");
      return;
    }

    const updated = { ...asset, assignedUserId: currentUserId };
    if (assignment) {
      await handleStartAssignmentRun(updated, assignment);
      return;
    }

    await startAssetFromBestWorkflowSource(updated);
  }, [
    autoAssignConfirm,
    currentUserId,
    handleStartAssignmentRun,
    setAssets,
    setAutoAssignConfirm,
    setInlineSaveError,
    startAssetFromBestWorkflowSource,
  ]);

  return {
    resolvePreferredAssignment,
    startAssetFromBestWorkflowSource,
    doStartAssignmentRun,
    handleStartAssignmentRun,
    checkAssignmentThenStart,
    confirmAutoAssignAndStart,
  };
}
