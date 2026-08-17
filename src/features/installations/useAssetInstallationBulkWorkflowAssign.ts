import { useCallback, useMemo, useState } from "react";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import {
  buildBulkAssignOpenForm,
  filterBulkWorkflowConfigs,
  type BulkAssignFormState,
} from "./assetInstallationWorkflowAssign";

type UseAssetInstallationBulkWorkflowAssignOptions = {
  requestedWorkflowType: string | null;
  workflowTypes: WorkflowType[];
  latestPublishedConfigs: WorkflowConfig[];
};

export function useAssetInstallationBulkWorkflowAssign({
  requestedWorkflowType,
  workflowTypes,
  latestPublishedConfigs,
}: UseAssetInstallationBulkWorkflowAssignOptions) {
  const [bulkWfOpen, setBulkWfOpen] = useState(false);
  const [bulkWfForm, setBulkWfForm] = useState<BulkAssignFormState>({
    workflowTypeId: "",
    workflowConfigId: "",
  });
  const [bulkWfSaving, setBulkWfSaving] = useState(false);

  const selectedBulkWorkflowType = useMemo(
    () => workflowTypes.find((type) => type.id === bulkWfForm.workflowTypeId) ?? null,
    [bulkWfForm.workflowTypeId, workflowTypes],
  );

  const filteredBulkWorkflowConfigs = useMemo(
    () => filterBulkWorkflowConfigs(latestPublishedConfigs, selectedBulkWorkflowType),
    [latestPublishedConfigs, selectedBulkWorkflowType],
  );

  const openBulkAssignDialog = useCallback(() => {
    setBulkWfForm(buildBulkAssignOpenForm(requestedWorkflowType, workflowTypes));
    setBulkWfOpen(true);
  }, [requestedWorkflowType, workflowTypes]);

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
    filteredBulkWorkflowConfigs,
    openBulkAssignDialog,
    closeBulkAssignDialog,
    selectBulkWorkflowType,
    selectBulkWorkflowConfig,
    applyBulkAssign,
  };
}

export type { BulkAssignFormState };
