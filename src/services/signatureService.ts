import api from "./api";
import type { SignatureEvent, SignatureToken } from "../types/signature";
import syncQueue from "./syncQueue";
import offlineStore from "./offlineStore";
import { mediaStore } from "./mediaStore";

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
  contactId?: string;
  recipientEmail: string;
  recipientName?: string;
  expiresInHours: number;
  customMessage?: string;
}

function isOfflineNetworkError(error: unknown): boolean {
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
    const resolvedRunId = await offlineStore.getMappedId("workflow-run", runId) ?? runId;
    const r = await api.get<SignatureEvent[]>("/signature-events", { params: { runId: resolvedRunId } });
    return r.data;
  },

  async submitSignature(runId: string, payload: SubmitSignaturePayload): Promise<SignatureEvent> {
    const resolvedRunId = await offlineStore.getMappedId("workflow-run", runId) ?? runId;
    const signatureData = payload.signatureData
      ? await mediaStore.persistMediaValue(payload.signatureData, "signature", "signature", `${runId}:${payload.signerRole}`)
      : undefined;
    const queuedPayload: SubmitSignaturePayload = {
      ...payload,
      signatureData,
    };

    try {
      const requestPayload = await mediaStore.resolveUploadPayload(queuedPayload);
      const r = await api.post<SignatureEvent>("/signature-events", requestPayload, { params: { runId: resolvedRunId } });
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
          optimisticPatch: {
            signerRole: payload.signerRole,
            signedAtUtc: now,
          },
        });
      } else {
        await syncQueue.enqueue({
          opType: "SIGNATURE_SUBMIT",
          url: `/signature-events?runId=${encodeURIComponent(resolvedRunId)}`,
          method: "POST",
          entityType: "workflow-run",
          entityId: resolvedRunId,
          body: queuedPayload,
          optimisticPatch: {
            signerRole: payload.signerRole,
            signedAtUtc: now,
          },
        });
      }

      const cachedRun = await offlineStore.getRun(runId) ?? await offlineStore.getRun(resolvedRunId);
      if (cachedRun) {
        await offlineStore.saveRun({
          ...cachedRun,
          installerSignedAt: payload.signerRole === "Installer" ? now : cachedRun.installerSignedAt,
          customerSignedAt: payload.signerRole === "Customer" ? now : cachedRun.customerSignedAt,
          signatureStatus: payload.signerRole === "Customer" ? "Signed" : (cachedRun.customerSignedAt ? "Signed" : "PendingCustomer"),
          localStatus: "PendingSync",
          dirty: true,
          syncError: undefined,
          lastLocalSavedAt: now,
        });
      }

      return {
        id: `offline-signature-${crypto.randomUUID()}`,
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
    const resolvedRunId = await offlineStore.getMappedId("workflow-run", runId) ?? runId;
    const r = await api.get<SignatureToken[]>("/signature-tokens", { params: { runId: resolvedRunId } });
    return r.data;
  },

  async createToken(payload: CreateTokenPayload): Promise<SignatureToken> {
    const resolvedRunId = await offlineStore.getMappedId("workflow-run", payload.runId) ?? payload.runId;
    const r = await api.post<SignatureToken>("/signature-tokens", { ...payload, runId: resolvedRunId });
    return r.data;
  },

  async revokeToken(id: string): Promise<void> {
    await api.delete(`/signature-tokens/${id}`);
  }
};
