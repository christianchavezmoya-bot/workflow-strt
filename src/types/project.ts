export type Office = string;

export type UserRole = "Admin" | "Project Manager" | "Engineer" | "Viewer";

export type ProjectType = "Internal" | "External";

export type InstallationMode = "Single Installation" | "Multiple Installations";

export type ApprovalDecision = "Approved" | "Rejected" | "More Info Required";

export type ProjectStatus =
  | "Draft"
  | "In Planning"
  | "Pending Approval"
  | "Approved"
  | "In Progress"
  | "On Hold"
  | "Completed"
  | "Closed"
  | "Cancelled";

export type WorkflowMode = "INSTALLATION_ONLY" | "INSPECTION_ONLY" | "MIXED";

export interface Project {
  id: string;
  customerName: string;
  customerId: string;
  siteId?: string;
  siteName?: string;
  jobNumber: string;
  purchaseOrderNumber?: string;
  description: string;
  startDate: string;
  finishDate: string;
  office: Office;
  officeId?: string;
  region?: string;
  projectType: ProjectType;
  status: ProjectStatus;
  approvalDecision?: ApprovalDecision;
  isInstallationProject: boolean;
  installationMode?: InstallationMode;
  /** INSTALLATION_ONLY | INSPECTION_ONLY | MIXED. Derived server-side for legacy rows. */
  workflowMode?: WorkflowMode;
  projectManager?: string;
  assignedPmUserId?: string | null;
  contractValue?: number;
  probabilityStage?: string;
  minimumCompletionPercent?: number;
  productIds?: string[];
  productFeatureValues?: Record<string, string>;
  assetCount?: number;
  teamMemberIds?: string[];
  completedAtUtc?: string | null;
  completedBy?: string | null;
  closedAtUtc?: string | null;
  closedBy?: string | null;
  isDeleted?: boolean;
  deletedAtUtc?: string;
  deletedByUserId?: string;
  deleteReason?: string;
}

// ── Inspection Imports ────────────────────────────────────────────────────────

export type InspectionImportStatus = "RECEIVED" | "NEEDS_ASSIGNMENT" | "MAPPED" | "FAILED";
export type InspectionImportSource = "ONEDRIVE" | "LOCAL" | "EMAIL" | "API";

export interface InspectionImport {
  id: string;
  source: InspectionImportSource;
  receivedAt: string;
  fileName?: string;
  contentHash?: string;
  hash?: string;
  rawJson?: string;
  projectId?: string | null;
  assetId?: string | null;
  projectAssetId?: string | null;
  status: InspectionImportStatus;
  errorText?: string | null;
  error?: string | null;
  mappedRunId?: string | null;
  uploadedBy?: string;
  isArchived?: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
  archiveRef?: string | null;
}
