export type InspectionImportStatus = "RECEIVED" | "NEEDS_ASSIGNMENT" | "MAPPED" | "FAILED";

export interface InspectionImport {
  id: string;
  source: string;
  receivedAt: string;
  rawJson: string;
  hash: string;
  projectId?: string | null;
  projectAssetId?: string | null;
  status: InspectionImportStatus;
  error?: string | null;
  mappedRunId?: string | null;
}

export interface CreateInspectionImportInput {
  source?: string;
  rawJson: string;
  projectId?: string;
  projectAssetId?: string;
}
