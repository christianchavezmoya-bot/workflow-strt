/**
 * bomApiService.ts
 * All HTTP calls for the BOM module.
 * Uses the same `api` axios instance as the rest of the app.
 */
import api from "../../../services/api";
import type { BomImportRun } from "../types/importRun";
import type { MappingProfile } from "../types/sourceWorkbook";
import type { RuleProfile } from "../types/classification";
import type { DraftProject } from "../types/projectDraft";
import type { ValidationResult } from "../types/validation";

const BASE = "/bom-import-runs";

// ── Import Runs ──────────────────────────────────────────────────────────────

export const bomApiService = {
  /** List all import runs */
  async listRuns(includeDeleted = false): Promise<BomImportRun[]> {
    const { data } = await api.get<BomImportRun[]>(BASE, {
      params: { includeDeleted: includeDeleted || undefined },
    });
    return data;
  },

  /** Get a single import run */
  async getRun(id: string, includeDeleted = false): Promise<BomImportRun> {
    const { data } = await api.get<BomImportRun>(`${BASE}/${id}`, {
      params: { includeDeleted: includeDeleted || undefined },
    });
    return data;
  },

  /** Create a new import run (metadata only; file stored separately) */
  async createRun(payload: {
    fileName: string;
    fileSizeBytes: number;
    sheetNames: string[];
    selectedSheets: string[];
    notes?: string;
  }): Promise<BomImportRun> {
    const { data } = await api.post<BomImportRun>(BASE, payload);
    return data;
  },

  /** Update run status / metadata */
  async updateRun(id: string, patch: Partial<BomImportRun>): Promise<BomImportRun> {
    const { data } = await api.put<BomImportRun>(`${BASE}/${id}`, patch);
    return data;
  },

  /** Delete (archive) an import run */
  async deleteRun(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  },

  async restoreRun(id: string): Promise<void> {
    await api.post(`${BASE}/${id}/restore`);
  },

  /** Permanently delete an import run (cannot be undone) */
  async purgeRun(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}/purge`);
  },

  // ── Mapping Profiles ───────────────────────────────────────────────────────

  async listMappingProfiles(): Promise<MappingProfile[]> {
    const { data } = await api.get<MappingProfile[]>("/bom-mapping-profiles");
    return data;
  },

  async saveMappingProfile(profile: Omit<MappingProfile, "id" | "createdAt" | "updatedAt">): Promise<MappingProfile> {
    const { data } = await api.post<MappingProfile>("/bom-mapping-profiles", profile);
    return data;
  },

  async deleteMappingProfile(id: string): Promise<void> {
    await api.delete(`/bom-mapping-profiles/${id}`);
  },

  // ── Rule Profiles ──────────────────────────────────────────────────────────

  async listRuleProfiles(): Promise<RuleProfile[]> {
    const { data } = await api.get<RuleProfile[]>("/bom-rule-profiles");
    return data;
  },

  async saveRuleProfile(profile: Omit<RuleProfile, "id" | "createdAt" | "updatedAt">): Promise<RuleProfile> {
    const { data } = await api.post<RuleProfile>("/bom-rule-profiles", profile);
    return data;
  },

  // ── Draft persistence ──────────────────────────────────────────────────────

  async saveDraft(runId: string, draft: DraftProject): Promise<DraftProject> {
    const { data } = await api.post<DraftProject>(`${BASE}/${runId}/draft`, draft);
    return data;
  },

  async getDraft(runId: string): Promise<DraftProject | null> {
    try {
      const { data } = await api.get<DraftProject>(`${BASE}/${runId}/draft`);
      return data;
    } catch {
      return null;
    }
  },

  // ── Validation ─────────────────────────────────────────────────────────────

  async saveValidationResult(runId: string, result: ValidationResult): Promise<void> {
    await api.post(`${BASE}/${runId}/validation`, result);
  },

  // ── Publish ────────────────────────────────────────────────────────────────

  async publishDraft(
    runId: string,
    mode: "preview" | "draft" | "publish"
  ): Promise<{ publishedProjectId?: string; summary: string; warnings: string[] }> {
    const { data } = await api.post(`${BASE}/${runId}/publish`, { mode });
    return data;
  },
};
