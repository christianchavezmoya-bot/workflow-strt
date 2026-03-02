export interface AssetDocumentRevision {
  id: string;
  revisionNumber: number;
  originalName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy?: string;
  uploadedAt: string;
}

export interface AssetDocument {
  id: string;
  assetId: string;
  label: string;
  createdBy?: string;
  createdAt: string;
  currentRevision?: AssetDocumentRevision;
  history: AssetDocumentRevision[];
}

export const DOCUMENT_LABELS = ["Drawing", "BOM", "Agreement", "Datasheet", "Other"] as const;
export type DocumentLabel = (typeof DOCUMENT_LABELS)[number];
