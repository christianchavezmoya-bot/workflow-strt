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

export interface Project {
  id: string;
  customerName: string;
  customerId: string;
  jobNumber: string;
  description: string;
  startDate: string;
  finishDate: string;
  office: Office;
  region?: string;
  projectType: ProjectType;
  status: ProjectStatus;
  approvalDecision?: ApprovalDecision;
  isInstallationProject: boolean;
  installationMode?: InstallationMode;
  projectManager?: string;
  contractValue?: number;
  probabilityStage?: string;
  productIds?: string[];
}
