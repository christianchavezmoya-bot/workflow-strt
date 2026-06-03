export type ImportRunStatus =
  | "uploading"
  | "parsing"
  | "mapping"
  | "classifying"
  | "validating"
  | "ready"
  | "committing"
  | "published"
  | "failed"
  | "archived";

export interface BomImportRun {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  uploadedAt: string;           // ISO
  uploadedBy: string;
  status: ImportRunStatus;
  statusMessage?: string;
  sheetNames: string[];
  selectedSheets: string[];
  mappingProfileId?: string;
  ruleProfileId?: string;
  totalRawRows: number;
  normalizedRows: number;
  classifiedRows: number;
  validationErrors: number;
  validationWarnings: number;
  publishedProjectId?: string;
  notes?: string;
  isDeleted?: boolean;
  deletedAtUtc?: string;
  deletedByUserId?: string;
  deleteReason?: string;
}
