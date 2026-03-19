/**
 * bomCommitService.ts
 * Orchestrates the publish flow via adapters.
 * Supports three modes: preview (no writes), draft (module tables only), publish (live).
 */
import type { DraftProject } from "../types/projectDraft";
import type { ValidationResult } from "../types/validation";
import { assetAdapter } from "../adapters/assetAdapter";
import { workflowAdapter } from "../adapters/workflowAdapter";
import { inventoryAdapter } from "../adapters/inventoryAdapter";
import { documentsAdapter } from "../adapters/documentsAdapter";
import { productAdapter } from "../adapters/productAdapter";
import { bomApiService } from "./bomApiService";
import { projectService } from "../../../services/projectService";

export type CommitMode = "preview" | "draft" | "publish";

export interface PublishDetails {
  customerName: string;
  jobNumber: string;
  office: string;
}

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
  mode: CommitMode,
  publishDetails?: PublishDetails
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

  // ── publish mode — writes live records ──────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const finishDate = new Date(Date.now() + 90 * 86_400_000).toISOString().split("T")[0];

  // 1. Create the Project record
  const project = await projectService.createProject({
    id: "",
    customerName: publishDetails?.customerName || draft.customerName || "BOM Import",
    customerId: "",
    siteName: draft.siteName,
    jobNumber: publishDetails?.jobNumber || `BOM-${runId.slice(0, 8).toUpperCase()}`,
    description: draft.projectName,
    startDate: today,
    finishDate,
    office: publishDetails?.office || "",
    projectType: "Internal",
    status: "In Planning",
    isInstallationProject: true,
    installationMode: "Multiple Installations",
  });

  const warnings: string[] = [];

  // 2. Create ProjectAssets
  let createdAssetIds: string[] = [];
  try {
    createdAssetIds = await assetAdapter.createAssets(project.id, draft.assets, runId);
  } catch (e) {
    warnings.push(`Asset creation partially failed: ${String(e)}`);
  }

  // 3. Mark the import run as published with the new project ID
  await bomApiService.updateRun(runId, {
    publishedProjectId: project.id,
    status: "published",
  });

  // 4. Update the BOM backend publish record
  try {
    await bomApiService.publishDraft(runId, "publish");
  } catch {
    // non-fatal — run is already marked published above
  }

  const workflowsAssigned = draft.assets.filter((a) => a.workflowTemplateCandidate).length;

  return {
    mode,
    publishedProjectId: project.id,
    assetsCreated: createdAssetIds.length,
    componentsAllocated: draft.assets.reduce((s, a) => s + a.components.length, 0),
    workflowsAssigned,
    inventoryReserved: draft.assets.reduce(
      (s, a) => s + a.components.filter((c) => c.inventoryTracked && (c.differenceQty ?? 0) >= 0).length,
      0
    ),
    shortagesCreated: draft.assets.reduce(
      (s, a) => s + a.components.filter((c) => c.differenceQty !== undefined && c.differenceQty < 0).length,
      0
    ),
    warnings: [...warnings, ...validation.warnings.map((w) => w.message)],
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
