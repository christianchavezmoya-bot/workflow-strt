export type SignatureStatus =
  | "None"
  | "PendingInstaller"
  | "PendingCustomer"
  | "Signed"
  | "Declined";

export type SignerRole = "Installer" | "Customer";
export type ReasonCode = "Completed" | "Conditional" | "ReworkAccepted" | "Declined";

export interface SignatureEvent {
  id: string;
  runId: string;
  signerRole: SignerRole;
  signerName: string;
  signerEmail?: string;
  signerTitle?: string;
  signedAtUtc: string;
  hasDrawnSignature: boolean;
  deviceInfo?: string;
  ipAddress?: string;
  reasonCode: ReasonCode;
  notes?: string;
  tokenId?: string;
}

export interface SignatureToken {
  id: string;
  runId: string;
  contactId?: string;
  recipientEmail: string;
  recipientName?: string;
  createdAtUtc: string;
  expiresAtUtc: string;
  usedAtUtc?: string;
  isRevoked: boolean;
  isExpired: boolean;
}

export interface PublicRunSummary {
  runId: string;
  assetName: string;
  assetSerial: string;
  workflowName: string;
  projectJobNumber: string;
  customerName: string;
  completedByName: string;
  completedAt: string;
  signatureStatus: SignatureStatus;
  recipientName: string;
  recipientEmail: string;
  tokenValid: boolean;
}
