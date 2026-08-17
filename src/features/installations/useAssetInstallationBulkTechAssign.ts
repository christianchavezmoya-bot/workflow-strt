import { useCallback, useState } from "react";
import { projectAssetService } from "../../services/projectAssetService";

export function useAssetInstallationBulkTechAssign() {
  const [bulkTechOpen, setBulkTechOpen] = useState(false);
  const [bulkTechId, setBulkTechId] = useState("");
  const [bulkTechSaving, setBulkTechSaving] = useState(false);

  const openBulkTechDialog = useCallback(() => {
    setBulkTechId("");
    setBulkTechOpen(true);
  }, []);

  const closeBulkTechDialog = useCallback(() => {
    setBulkTechOpen(false);
  }, []);

  const selectBulkTechUser = useCallback((userId: string) => {
    setBulkTechId(userId);
  }, []);

  const applyBulkTechAssign = useCallback(
    async (assetIds: string[], onSuccess: () => void) => {
      if (assetIds.length === 0) return;

      setBulkTechSaving(true);
      try {
        await Promise.all(
          assetIds.map((assetId) =>
            projectAssetService.update(assetId, {
              assignedUserId: bulkTechId || null,
            } as Parameters<typeof projectAssetService.update>[1]),
          ),
        );
        onSuccess();
        setBulkTechOpen(false);
      } finally {
        setBulkTechSaving(false);
      }
    },
    [bulkTechId],
  );

  return {
    bulkTechOpen,
    bulkTechId,
    bulkTechSaving,
    openBulkTechDialog,
    closeBulkTechDialog,
    selectBulkTechUser,
    applyBulkTechAssign,
  };
}
