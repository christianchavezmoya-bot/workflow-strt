import { Office } from "./project";

export type InstallationStatus =
  | "Not Started"
  | "Scheduled"
  | "In Progress"
  | "Completed"
  | "Cancelled";

export interface Installation {
  id: string;
  projectId: string;
  installationNumber: string;
  installationId?: string;
  installationName?: string;
  siteLocation: string;
  siteContactName?: string;
  siteContactPhone?: string;
  siteContactEmail?: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart?: string;
  actualFinish?: string;
  status: InstallationStatus;
  assignedTeam: string;
  assignedUsers?: string[];
  office: Office;
  installerNotes?: string;
  customerSignOffDate?: string;
  customerSignOffContact?: string;
  machineType?: string;
  pm1Serial?: string;
  pm2Serial?: string;
  pm3Serial?: string;
  pm4Serial?: string;
  isDeleted?: boolean;
  deletedAtUtc?: string;
  deletedByUserId?: string;
  deleteReason?: string;
}
