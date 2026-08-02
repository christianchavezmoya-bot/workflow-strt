export type SignatureStatus =
  | "None"
  | "PendingInstaller"
  | "PendingCustomer"
  | "Signed"
  | "Declined"
  | "WaivedCustomer";

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
  signatureData?: string;   // base64 PNG — present when a drawn signature was captured
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
  // Report generation fields
  workflowSnapshotJson: string;
  stepResultsJson: string;
  issuesJson: string;
  assetTag?: string;
  assetLocation?: string;
  // Installer signature (already captured)
  installerSignerName?: string;
  installerSignatureData?: string;
  installerReasonCode?: string;
  installerNotes?: string;
  installerSignedAt?: string;
  /** Project site IANA timezone so the customer PDF renders wall-clock times consistently. */
  timeZoneId?: string;
}
