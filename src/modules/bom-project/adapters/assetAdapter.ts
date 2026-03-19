/**
 * assetAdapter.ts — creates ProjectAssets from approved draft assets
 * via the existing /api/project-assets endpoint.
 */
import api from "../../../services/api";
import type { DraftAsset } from "../types/projectDraft";

export const assetAdapter = {
  async createAssets(
    projectId: string,
    assets: DraftAsset[],
    importRunId: string
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const asset of assets) {
      const payload = {
        projectId,
        assetName: asset.assetName,
        assetType: asset.assetType ?? "",
        location: asset.location ?? "",
        status: "Pending",
        sourceImportRunId: importRunId,
      };
      const { data } = await api.post<{ id: string }>("/project-assets", payload);
      ids.push(data.id);
    }
    return ids;
  },

  async commitAssets(draftProjectId: string): Promise<void> {
    await api.post(`/bom-import-runs/${draftProjectId}/commit-assets`);
  },
};
