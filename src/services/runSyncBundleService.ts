/**
 * Build atomic run sync bundles from pending queue ops (RUN_COMPLETE + signatures).
 */
import { pendingGetByEntityId, type PendingAction } from "./localDB";
import type { SubmitSignaturePayload } from "./signatureService";
import offlineStore from "./offlineStore";

const BUNDLE_UNSUPPORTED_CACHE_PREFIX = "sync-bundle-unsupported:";

export interface SyncRunBundleSignature {
  signerRole: "Installer" | "Customer";
  payload: SubmitSignaturePayload;
  actionId: string;
}

export interface SyncRunBundleRequestBody {
  stepResultsJson: string;
  issuesJson: string;
  completedByName?: string;
  completedAtUtc?: string;
  bomActualJson?: string;
  signatures: SyncRunBundleSignature[];
  idempotencyKey: string;
}

export interface BuiltRunSyncBundle {
  runId: string;
  completeActionId: string;
  signatureActionIds: string[];
  request: SyncRunBundleRequestBody;
}

const BUNDLE_SIGNATURE_ROLES: Array<"Installer" | "Customer"> = ["Installer", "Customer"];

export async function markRunSyncBundleUnsupported(runEntityId: string): Promise<void> {
  await offlineStore.saveCache(`${BUNDLE_UNSUPPORTED_CACHE_PREFIX}${runEntityId}`, true);
}

export async function isRunSyncBundleUnsupported(runEntityId: string): Promise<boolean> {
  const flagged = await offlineStore.getCache<boolean>(`${BUNDLE_UNSUPPORTED_CACHE_PREFIX}${runEntityId}`);
  return flagged === true;
}

export async function isRunBundleCandidate(runEntityId: string): Promise<boolean> {
  if (await isRunSyncBundleUnsupported(runEntityId)) return false;
  const pending = await pendingGetByEntityId(runEntityId);
  const hasComplete = pending.some((op) => op.opType === "RUN_COMPLETE" && op.status !== "uploading");
  const hasSignature = pending.some((op) => op.opType === "SIGNATURE_SUBMIT" && op.status !== "uploading");
  return hasComplete && hasSignature;
}

export function collectBundledActionIds(bundle: BuiltRunSyncBundle): string[] {
  return [bundle.completeActionId, ...bundle.signatureActionIds];
}

export async function buildRunSyncBundleRequest(runEntityId: string): Promise<BuiltRunSyncBundle | null> {
  const pending = (await pendingGetByEntityId(runEntityId))
    .filter((op) => op.status !== "uploading")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const completeOp = pending.find((op) => op.opType === "RUN_COMPLETE");
  if (!completeOp) return null;

  const signatureOps = pending.filter((op) => op.opType === "SIGNATURE_SUBMIT");
  if (signatureOps.length === 0) return null;

  const completeBody = completeOp.body as {
    stepResultsJson?: string;
    issuesJson?: string;
    completedByName?: string;
    completedAtUtc?: string;
    bomActualJson?: string;
  } | undefined;

  const mappedRunId = await offlineStore.getMappedId("workflow-run", runEntityId) ?? runEntityId;

  const signatures: SyncRunBundleSignature[] = [];
  for (const role of BUNDLE_SIGNATURE_ROLES) {
    const op = signatureOps.find((item) => (item.body as SubmitSignaturePayload | undefined)?.signerRole === role);
    if (!op) continue;
    signatures.push({
      signerRole: role,
      payload: op.body as SubmitSignaturePayload,
      actionId: op.id,
    });
  }

  return {
    runId: mappedRunId,
    completeActionId: completeOp.id,
    signatureActionIds: signatures.map((sig) => sig.actionId),
    request: {
      stepResultsJson: completeBody?.stepResultsJson ?? "[]",
      issuesJson: completeBody?.issuesJson ?? "[]",
      completedByName: completeBody?.completedByName,
      completedAtUtc: completeBody?.completedAtUtc,
      bomActualJson: completeBody?.bomActualJson,
      signatures,
      idempotencyKey: `bundle:${mappedRunId}:${completeOp.id}`,
    },
  };
}

export function findPrimaryBundleAction(pending: PendingAction[]): PendingAction | null {
  const complete = pending.find((op) => op.opType === "RUN_COMPLETE" && op.status !== "uploading");
  if (!complete) return null;
  return complete;
}
