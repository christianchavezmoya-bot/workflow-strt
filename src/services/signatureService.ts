import api from "./api";
import type { SignatureEvent, SignatureToken } from "../types/signature";
import syncQueue from "./syncQueue";
import offlineStore from "./offlineStore";
import { mediaStore } from "./mediaStore";
import { isMobileNativePlatform } from "../utils/platform";
import { randomId } from "../utils/randomId";
import { RUN_MUTATION_TIMEOUT_MS } from "../utils/syncPolicy";
import { shouldSkipRunMutation } from "./connectivityMonitor";
import { applyOfflineAssetStatusUpdate, syncOfflineAssetWorkflowStateFromRun, applyWebRunMutationCache } from "./assetWorkflowRunService";
import { webCachedGet, invalidateWebCache, invalidateWebCacheByPrefix } from "./webFreshCache";

export interface SubmitSignaturePayload {
  signerRole: "Installer" | "Customer";
  signerName: string;
  signerEmail?: string;
  signerTitle?: string;
  signatureData?: string;      // base64 PNG from canvas
  reasonCode: "Completed" | "Conditional" | "ReworkAccepted" | "Declined";
  notes?: string;
  consentConfirmed: boolean;
}

export interface CreateTokenPayload {
  runId: string;
  signerRole?: "Installer" | "Customer";
  contactId?: string;
  recipientEmail?: string;
  recipientName?: string;
  expiresInHours: number;
  customMessage?: string;
}

function isOfflineNetworkError(error: unknown): boolean {
  // Mirrors assetWorkflowRunService.isOfflineNetworkError: trust the
  // connectivity state FIRST. Otherwise a synthetic "skip-network-offline"
  // throw (or a stale-but-offline condition) would not be recognized and the
  // catch handler would re-throw as a non-offline error, surfacing as
  // "failed to submit signature" in the UI.
  if (shouldSkipRunMutation()) return true;
  if (!error || typeof error !== "object") return !navigator.onLine;
  const candidate = error as { response?: unknown; code?: string; message?: string };
  if (candidate.response) return false;
  return (
    !navigator.onLine ||
    candidate.code === "ECONNABORTED" ||
    candidate.code === "ERR_NETWORK" ||
    candidate.message === "Network Error"
  );
}

export const signatureService = {
  async listEvents(runId: string): Promise<SignatureEvent[]> {
    if (!isMobileNativePlatform()) {
      // Short TTL â€” signature status is the kind of thing that should
      // never feel stale to whoever is checking it.
      return webCachedGet(
        `/signature-events?runId=${runId}`,
        async () => {
          const r = await api.get<SignatureEvent[]>("/signature-events", { params: { runId } });
          return r.data;
        },
        { ttlMs: 5_000 }
      );
    }

    const resolvedRunId = await offlineStore.getMappedId("workflow-run", runId) ?? runId;
    const r = await api.get<SignatureEvent[]>("/signature-events", { params: { runId: resolvedRunId } });
    return r.data;
  },

  async submitSignature(runId: string, payload: SubmitSignaturePayload): Promise<SignatureEvent> {
    if (!isMobileNativePlatform()) {
      const r = await api.post<SignatureEvent>("/signature-events", payload, { params: { runId } });
      invalidateWebCache(`/signature-events?runId=${runId}`);
      try {
        const runRes = await api.get<import("../types/assetWorkflowRun").AssetWorkflowRun>(
          `/asset-workflow-runs/${runId}`,
        );
        applyWebRunMutationCache(runRes.data, "asset");
      } catch {
        invalidateWebCache(`/asset-workflow-runs/${runId}`);
      }
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      window.dispatchEvent(new Event("repo:runs:updated"));
      return r.data;
    }

    const resolvedRunId = await offlineStore.getMappedId("workflow-run", runId) ?? runId;
    const signatureData = payload.signatureData
      ? await mediaStore.persistMediaValue(payload.signatureData, "signature", "signature", `${runId}:${payload.signerRole}`)
      : undefined;
    const queuedPayload: SubmitSignaturePayload = { ...payload, signatureData };

    try {
      // Fast-bail when we already know the server is unreachable â€” avoids the
      // full axios 10 s timeout on the doomed network call before falling into
      // the offline branch. Same pattern as assetWorkflowRunService.startRun.
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const requestPayload = await mediaStore.resolveUploadPayload(queuedPayload);
      const r = await api.post<SignatureEvent>("/signature-events", requestPayload, {
        params: { runId: resolvedRunId },
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      const now = r.data.signedAtUtc ?? new Date().toISOString();
      const cachedRun = await offlineStore.getRun(runId) ?? await offlineStore.getRun(resolvedRunId);
      if (cachedRun) {
        const updatedRun = {
          ...cachedRun,
          installerSignedAt: payload.signerRole === "Installer" ? now : cachedRun.installerSignedAt,
          customerSignedAt: payload.signerRole === "Customer" ? now : cachedRun.customerSignedAt,
          signatureStatus: payload.signerRole === "Customer"
            ? (payload.reasonCode === "Declined" ? "Declined" : "Signed")
            : "PendingCustomer",
          updatedAt: now,
          lastLocalSavedAt: now,
          dirty: false,
          localStatus: "Synced" as const,
          syncError: undefined,
        };
        await offlineStore.saveRun(updatedRun);
        if (isMobileNativePlatform()) {
          await syncOfflineAssetWorkflowStateFromRun(
            updatedRun,
            payload.signerRole === "Customer" ? "Complete" : "Pending",
          );
        }
        window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
          detail: { assetId: updatedRun.assetId, runs: [updatedRun], mergeById: true },
        }));
      }
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return r.data;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const now = new Date().toISOString();
      const existing = (await syncQueue.listByEntityId(resolvedRunId))
        .filter((op) => op.opType === "SIGNATURE_SUBMIT" && op.url === `/signature-events?runId=${encodeURIComponent(resolvedRunId)}` && (op.body as SubmitSignaturePayload | undefined)?.signerRole === payload.signerRole)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (existing && existing.status !== "uploading") {
        await syncQueue.updateQueuedOp(existing.id, {
          body: queuedPayload,
          optimisticPatch: { signerRole: payload.signerRole, signedAtUtc: now },
        });
      } else {
        const dependsOnRunComplete = (await syncQueue.listByEntityId(resolvedRunId))
          .filter((op) => op.opType === "RUN_COMPLETE" && op.status !== "uploading")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;

        // The customer signature must not reach the server ahead of the installer's — if the
        // installer's own submission fails or ends up flagged as a conflict, the flush loop just
        // skips past it and keeps going, so without this the customer's op can sync on its own
        // and the run can look locally "Complete" while the server never received the installer
        // signature.
        let dependsOnInstallerSignature: string | undefined;
        if (payload.signerRole === "Customer") {
          dependsOnInstallerSignature = (await syncQueue.listByEntityId(resolvedRunId))
            .filter((op) =>
              op.opType === "SIGNATURE_SUBMIT" &&
              op.status !== "uploading" &&
              (op.body as SubmitSignaturePayload | undefined)?.signerRole === "Installer"
            )
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;
        }

        await syncQueue.enqueue({
          opType: "SIGNATURE_SUBMIT",
          url: `/signature-events?runId=${encodeURIComponent(resolvedRunId)}`,
          method: "POST",
          entityType: "workflow-run",
          entityId: resolvedRunId,
          body: queuedPayload,
          optimisticPatch: { signerRole: payload.signerRole, signedAtUtc: now },
          dependsOnOpId: dependsOnInstallerSignature ?? dependsOnRunComplete,
        });
      }

      const cachedRun = await offlineStore.getRun(runId) ?? await offlineStore.getRun(resolvedRunId);
      if (cachedRun) {
        const updatedRun = {
          ...cachedRun,
          installerSignedAt: payload.signerRole === "Installer" ? now : cachedRun.installerSignedAt,
          customerSignedAt: payload.signerRole === "Customer" ? now : cachedRun.customerSignedAt,
          signatureStatus: payload.signerRole === "Customer"
            ? (payload.reasonCode === "Declined" ? "Declined" : "Signed")
            : (cachedRun.customerSignedAt ? "Signed" : "PendingCustomer"),
          updatedAt: now,
          localStatus: "PendingSync" as const,
          dirty: true,
          syncError: undefined,
          lastLocalSavedAt: now,
        };
        await offlineStore.saveRun(updatedRun);
        await syncOfflineAssetWorkflowStateFromRun(
          updatedRun,
          payload.signerRole === "Customer"
            ? (payload.reasonCode === "Declined" ? "Pending" : "Complete")
            : "Pending",
        );
        // Mirror the offline-run-write refresh signal from assetWorkflowRunService
        // so the Assets page updates immediately when a signature is captured
        // offline. mergeById: true replaces this run by id and keeps sibling
        // runs intact, matching the Finding-2 fix.
        window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
          detail: { assetId: updatedRun.assetId, runs: [updatedRun], mergeById: true },
        }));
        // Update the parent asset's status so the dashboard / asset page
        // reflect the new lifecycle state immediately:
        //   - Customer signs (final step) â†’ asset.status = "Complete"
        //   - Installer signs (intermediate) â†’ asset.status = "Pending"
        //     (still waiting for the customer signature)
        const nextAssetStatus = payload.signerRole === "Customer"
          ? (payload.reasonCode === "Declined" ? "Pending" : "Complete")
          : "Pending";
        await applyOfflineAssetStatusUpdate(updatedRun.assetId, nextAssetStatus);
      }

      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));

      return {
        id: `offline-signature-${randomId()}`,
        runId,
        signerRole: payload.signerRole,
        signerName: payload.signerName,
        signerEmail: payload.signerEmail,
        signerTitle: payload.signerTitle,
        signedAtUtc: now,
        hasDrawnSignature: Boolean(signatureData),
        reasonCode: payload.reasonCode,
        notes: payload.notes,
      };
    }
  },

  async listTokens(runId: string): Promise<SignatureToken[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(
        `/signature-tokens?runId=${runId}`,
        async () => {
          const r = await api.get<SignatureToken[]>("/signature-tokens", { params: { runId } });
          return r.data;
        },
        { ttlMs: 5_000 }
      );
    }

    const resolvedRunId = await offlineStore.getMappedId("workflow-run", runId) ?? runId;
    const r = await api.get<SignatureToken[]>("/signature-tokens", { params: { runId: resolvedRunId } });
    return r.data;
  },

  async createToken(payload: CreateTokenPayload): Promise<SignatureToken> {
    if (!isMobileNativePlatform()) {
      const r = await api.post<SignatureToken>("/signature-tokens", payload);
      invalidateWebCache(`/signature-tokens?runId=${payload.runId}`);
      invalidateWebCacheByPrefix("/asset-workflow-runs/pending-signatures");
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return r.data;
    }

    const resolvedRunId = await offlineStore.getMappedId("workflow-run", payload.runId) ?? payload.runId;
    const r = await api.post<SignatureToken>("/signature-tokens", { ...payload, runId: resolvedRunId });
    return r.data;
  },

  async revokeToken(id: string): Promise<void> {
    await api.delete(`/signature-tokens/${id}`);
  }
};
