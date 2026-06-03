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
  contractValue?: number;
  probabilityStage?: string;
  productIds?: string[];
  productFeatureValues?: Record<string, string>;
  assetCount?: number;
  teamMemberIds?: string[];
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
  rawJson?: string;
  projectId?: string;
  assetId?: string;
  status: InspectionImportStatus;
  errorText?: string;
  mappedRunId?: string;
  uploadedBy?: string;
}
