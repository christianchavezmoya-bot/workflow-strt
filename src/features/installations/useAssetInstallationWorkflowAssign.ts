import { useCallback, useState } from "react";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { workflowConfigService } from "../../services/workflowConfigService";
import { workflowTypeService } from "../../services/workflowTypeService";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import {
  assignFormFromConfigSelection,
  buildAssignFormPreselection,
  resolveAssignmentWorkflowTypeId,
  resolveRequestedWorkflowTypeId,
  type AssignFormState,
} from "./assetInstallationWorkflowAssign";

type UseAssetInstallationWorkflowAssignOptions = {
  requestedWorkflowType: string | null;
  onWorkflowTypesLoaded?: (types: WorkflowType[]) => void;
  onWorkflowConfigsLoaded?: (configs: WorkflowConfig[]) => void;
  onAssignmentSaved: (assetId: string) => void | Promise<void>;
  onSaveError: (message: string) => void;
};

export function useAssetInstallationWorkflowAssign({
  requestedWorkflowType,
  onWorkflowTypesLoaded,
  onWorkflowConfigsLoaded,
  onAssignmentSaved,
  onSaveError,
}: UseAssetInstallationWorkflowAssignOptions) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignDialogAsset, setAssignDialogAsset] = useState<ProjectAsset | null>(null);
  const [assignForm, setAssignForm] = useState<AssignFormState>({
    workflowTypeId: "",
    workflowConfigId: "",
  });
  const [assignSaving, setAssignSaving] = useState(false);
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
  const [workflowConfigs, setWorkflowConfigs] = useState<WorkflowConfig[]>([]);

  const closeAssignDialog = useCallback(() => {
    setAssignDialogOpen(false);
  }, []);

  const openAssignDialog = useCallback(
    async (asset: ProjectAsset) => {
      setAssignDialogAsset(asset);
      setAssignForm({ workflowTypeId: "", workflowConfigId: "" });
      setAssignDialogOpen(true);
      try {
        const [types, cfgs] = await Promise.all([
          workflowTypeService.list(),
          workflowConfigService.listByProduct(asset.productId, "Published"),
        ]);
        setWorkflowTypes(types);
        setWorkflowConfigs(cfgs);
        onWorkflowTypesLoaded?.(types);
        onWorkflowConfigsLoaded?.(cfgs);

        const requestedWorkflowTypeId = resolveRequestedWorkflowTypeId(requestedWorkflowType, types);
        setAssignForm(
          buildAssignFormPreselection(cfgs, types, requestedWorkflowTypeId, requestedWorkflowType),
        );
      } catch {
        console.warn("[useAssetInstallationWorkflowAssign] failed to load workflow types/configs");
      }
    },
    [onWorkflowConfigsLoaded, onWorkflowTypesLoaded, requestedWorkflowType],
  );

  const selectAssignConfig = useCallback(
    (configId: string) => {
      setAssignForm(assignFormFromConfigSelection(configId, workflowConfigs, workflowTypes));
    },
    [workflowConfigs, workflowTypes],
  );

  const saveAssignment = useCallback(async () => {
    if (!assignDialogAsset || !assignForm.workflowConfigId) return;

    const workflowTypeId = resolveAssignmentWorkflowTypeId(
      assignForm.workflowTypeId,
      assignForm.workflowConfigId,
      workflowConfigs,
      workflowTypes,
    );
    if (!workflowTypeId) {
      onSaveError(
        "Could not determine the workflow type for this config. Reconnect and try again.",
      );
      return;
    }

    setAssignSaving(true);
    try {
      await assetWorkflowAssignmentService.create(
        assignDialogAsset.id,
        assignForm.workflowConfigId,
        workflowTypeId,
      );
      await onAssignmentSaved(assignDialogAsset.id);
      setAssignDialogOpen(false);
    } catch (err) {
      console.warn("[useAssetInstallationWorkflowAssign] saveAssignment failed", err);
      onSaveError("Could not assign the workflow. Please try again.");
    } finally {
      setAssignSaving(false);
    }
  }, [
    assignDialogAsset,
    assignForm.workflowConfigId,
    assignForm.workflowTypeId,
    onAssignmentSaved,
    onSaveError,
    workflowConfigs,
    workflowTypes,
  ]);

  return {
    assignDialogOpen,
    assignDialogAsset,
    assignForm,
    assignSaving,
    workflowConfigs,
    openAssignDialog,
    closeAssignDialog,
    selectAssignConfig,
    saveAssignment,
  };
}

export type { AssignFormState };
