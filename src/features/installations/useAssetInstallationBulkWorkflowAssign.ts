import { useCallback, useMemo, useState } from "react";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import type { Project } from "../../types/project";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import { projectScopesWorkflowType } from "../../utils/workflowTypeRules";
import {
  buildBulkAssignOpenForm,
  filterBulkWorkflowConfigs,
  filterPublishedConfigsForProject,
  filterWorkflowTypesForProject,
  type BulkAssignFormState,
} from "./assetInstallationWorkflowAssign";

type UseAssetInstallationBulkWorkflowAssignOptions = {
  requestedWorkflowType: string | null;
  workflowTypes: WorkflowType[];
  latestPublishedConfigs: WorkflowConfig[];
  project?: Pick<Project, "workflowTypeId" | "workflowMode" | "isInstallationProject"> | null;
};

export function useAssetInstallationBulkWorkflowAssign({
  requestedWorkflowType,
  workflowTypes,
  latestPublishedConfigs,
  project = null,
}: UseAssetInstallationBulkWorkflowAssignOptions) {
  const [bulkWfOpen, setBulkWfOpen] = useState(false);
  const [bulkWfForm, setBulkWfForm] = useState<BulkAssignFormState>({
    workflowTypeId: "",
    workflowConfigId: "",
  });
  const [bulkWfSaving, setBulkWfSaving] = useState(false);

  const projectWorkflowTypeLocked = projectScopesWorkflowType(project);

  const scopedWorkflowTypes = useMemo(
    () => filterWorkflowTypesForProject(workflowTypes, project),
    [project, workflowTypes],
  );

  const selectedBulkWorkflowType = useMemo(
    () => scopedWorkflowTypes.find((type) => type.id === bulkWfForm.workflowTypeId) ?? null,
    [bulkWfForm.workflowTypeId, scopedWorkflowTypes],
  );

  const filteredBulkWorkflowConfigs = useMemo(() => {
    const bySelectedType = filterBulkWorkflowConfigs(latestPublishedConfigs, selectedBulkWorkflowType);
    return filterPublishedConfigsForProject(bySelectedType, workflowTypes, project);
  }, [latestPublishedConfigs, project, selectedBulkWorkflowType, workflowTypes]);

  const openBulkAssignDialog = useCallback(() => {
    setBulkWfForm(buildBulkAssignOpenForm(requestedWorkflowType, workflowTypes, project));
    setBulkWfOpen(true);
  }, [project, requestedWorkflowType, workflowTypes]);

  const closeBulkAssignDialog = useCallback(() => {
    setBulkWfOpen(false);
  }, []);

  const selectBulkWorkflowType = useCallback((typeId: string) => {
    setBulkWfForm({ workflowTypeId: typeId, workflowConfigId: "" });
  }, []);

  const selectBulkWorkflowConfig = useCallback((configId: string) => {
    setBulkWfForm((prev) => ({ ...prev, workflowConfigId: configId }));
  }, []);

  const applyBulkAssign = useCallback(
    async (assetIds: string[], onSuccess: () => void) => {
      if (!bulkWfForm.workflowTypeId || !bulkWfForm.workflowConfigId || assetIds.length === 0) return;

      setBulkWfSaving(true);
      try {
        await Promise.all(
          assetIds.map((assetId) =>
            assetWorkflowAssignmentService.create(
              assetId,
              bulkWfForm.workflowConfigId,
              bulkWfForm.workflowTypeId,
            ),
          ),
        );
        onSuccess();
        setBulkWfOpen(false);
      } finally {
        setBulkWfSaving(false);
      }
    },
    [bulkWfForm.workflowConfigId, bulkWfForm.workflowTypeId],
  );

  return {
    bulkWfOpen,
    bulkWfForm,
    bulkWfSaving,
    scopedWorkflowTypes,
    projectWorkflowTypeLocked,
    filteredBulkWorkflowConfigs,
    openBulkAssignDialog,
    closeBulkAssignDialog,
    selectBulkWorkflowType,
    selectBulkWorkflowConfig,
    applyBulkAssign,
  };
}

export type { BulkAssignFormState };
