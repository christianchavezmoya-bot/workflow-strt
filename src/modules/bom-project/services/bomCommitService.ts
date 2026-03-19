/**
 * bomCommitService.ts
 * Orchestrates the publish flow via adapters.
 * Supports three modes: preview (no writes), draft (module tables only), publish (live).
 */
import type { DraftProject, DraftAsset, DraftComponent } from "../types/projectDraft";
import type { ValidationResult } from "../types/validation";
import { assetAdapter } from "../adapters/assetAdapter";
import { workflowAdapter } from "../adapters/workflowAdapter";
import { inventoryAdapter } from "../adapters/inventoryAdapter";
import { documentsAdapter } from "../adapters/documentsAdapter";
import { productAdapter } from "../adapters/productAdapter";
import { bomApiService } from "./bomApiService";

export type CommitMode = "preview" | "draft" | "publish";

export interface CommitResult {
  mode: CommitMode;
  publishedProjectId?: string;
  assetsCreated: number;
  componentsAllocated: number;
  workflowsAssigned: number;
  inventoryReserved: number;
  shortagesCreated: number;
  warnings: string[];
  errors: string[];
}

export async function commitDraft(
  runId: string,
  draft: DraftProject,
  validation: ValidationResult,
  mode: CommitMode
): Promise<CommitResult> {
  if (validation.isBlockingPublish && mode === "publish") {
    return {
      mode,
      assetsCreated: 0,
      componentsAllocated: 0,
      workflowsAssigned: 0,
      inventoryReserved: 0,
      shortagesCreated: 0,
      warnings: [],
      errors: validation.errors.map((e) => e.message),
    };
  }

  if (mode === "preview") {
    return previewCommit(draft, validation);
  }

  if (mode === "draft") {
    await bomApiService.saveDraft(runId, draft);
    return previewCommit(draft, validation);
  }

  // ── publish mode ────────────────────────────────────────────────────────────
  const result = await bomApiService.publishDraft(runId, mode);
  return {
    mode,
    publishedProjectId: result.publishedProjectId,
    assetsCreated: draft.assets.length,
    componentsAllocated: draft.assets.reduce((s, a) => s + a.components.length, 0),
    workflowsAssigned: draft.assets.filter((a) => a.workflowTemplateCandidate).length,
    inventoryReserved: 0,
    shortagesCreated: 0,
    warnings: result.warnings,
    errors: [],
  };
}

function previewCommit(draft: DraftProject, validation: ValidationResult): CommitResult {
  return {
    mode: "preview",
    assetsCreated: draft.assets.length,
    componentsAllocated: draft.assets.reduce((s, a) => s + a.components.length, 0),
    workflowsAssigned: draft.assets.filter((a) => a.workflowTemplateCandidate).length,
    inventoryReserved: draft.assets.reduce(
      (s, a) => s + a.components.filter((c) => c.inventoryTracked && (c.differenceQty ?? 0) >= 0).length,
      0
    ),
    shortagesCreated: draft.assets.reduce(
      (s, a) => s + a.components.filter((c) => c.differenceQty !== undefined && c.differenceQty < 0).length,
      0
    ),
    warnings: validation.warnings.map((w) => w.message),
    errors: [],
  };
}

// Re-export adapters for convenience (avoids circular import in pages)
export { assetAdapter, workflowAdapter, inventoryAdapter, documentsAdapter, productAdapter };
