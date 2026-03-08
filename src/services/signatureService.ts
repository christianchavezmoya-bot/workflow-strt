import api from "./api";
import type { SignatureEvent, SignatureToken } from "../types/signature";

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
}

export const signatureService = {
  async listEvents(runId: string): Promise<SignatureEvent[]> {
    const r = await api.get<SignatureEvent[]>("/signature-events", { params: { runId } });
    return r.data;
  },

  async submitSignature(runId: string, payload: SubmitSignaturePayload): Promise<SignatureEvent> {
    const r = await api.post<SignatureEvent>("/signature-events", payload, { params: { runId } });
    return r.data;
  },

  async listTokens(runId: string): Promise<SignatureToken[]> {
    const r = await api.get<SignatureToken[]>("/signature-tokens", { params: { runId } });
    return r.data;
  },

  async createToken(payload: CreateTokenPayload): Promise<SignatureToken> {
    const r = await api.post<SignatureToken>("/signature-tokens", payload);
    return r.data;
  },

  async revokeToken(id: string): Promise<void> {
    await api.delete(`/signature-tokens/${id}`);
  }
};
