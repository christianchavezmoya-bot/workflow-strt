import { useCallback, useState } from "react";
import { projectAssetService } from "../../services/projectAssetService";
import type { Product } from "../../types/product";
import type { Project } from "../../types/project";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import {
  buildWorkflowConfigTypeMap,
  mapCsvRowsToAssetDrafts,
  parseAssetInstallationCsv,
  type AssetInstallationCsvRow,
} from "./assetInstallationCsvImport";

export function mergeImportedAssets(prev: ProjectAsset[], created: ProjectAsset[]): ProjectAsset[] {
  const merged = [...prev];
  for (const asset of created) {
    if (!merged.some((item) => item.id === asset.id)) merged.push(asset);
  }
  return merged;
}

type ImportCsvParams = {
  activeProduct: Product;
  projectId: string;
  fallbackProjectId?: string;
  workflowConfigs: WorkflowConfig[];
  onAssetsCreated: (assets: ProjectAsset[]) => void;
  onRefresh?: () => void;
};

export function useAssetInstallationCsvImport() {
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<AssetInstallationCsvRow[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);

  const closeCsvImport = useCallback(() => {
    setCsvImportOpen(false);
    setCsvRows([]);
  }, []);

  const loadCsvFile = useCallback(async (file: File) => {
    const text = await file.text();
    setCsvRows(parseAssetInstallationCsv(text));
    setCsvImportOpen(true);
  }, []);

  const importCsv = useCallback(async (params: ImportCsvParams) => {
    const { activeProduct, projectId, fallbackProjectId, workflowConfigs, onAssetsCreated, onRefresh } = params;
    if (csvRows.length === 0) return;

    setCsvImporting(true);
    try {
      const configsByType = buildWorkflowConfigTypeMap(workflowConfigs);
      const drafts = mapCsvRowsToAssetDrafts(csvRows, configsByType);
      const resolvedProjectId = projectId || fallbackProjectId || "";

      const created = await Promise.all(
        drafts.map((draft) =>
          projectAssetService.create({
            projectId: resolvedProjectId,
            productId: activeProduct.id,
            assetTag: draft.assetTag,
            assetName: draft.assetName,
            serialNumber: draft.serialNumber,
            assetModel: draft.assetModel,
            manufacturer: draft.manufacturer,
            productConfigId: draft.productConfigId,
          }),
        ),
      );

      onAssetsCreated(created);
      closeCsvImport();
      onRefresh?.();
    } catch {
      alert("Import failed. Check your CSV and try again.");
    } finally {
      setCsvImporting(false);
    }
  }, [closeCsvImport, csvRows]);

  return {
    csvImportOpen,
    setCsvImportOpen,
    csvRows,
    setCsvRows,
    csvImporting,
    closeCsvImport,
    loadCsvFile,
    importCsv,
  };
}

export type { ImportCsvParams };
