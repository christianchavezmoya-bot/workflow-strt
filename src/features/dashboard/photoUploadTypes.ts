/** Types for PhotoUploadDialog — split so lazy-loaded consumers don't pull dialog code. */

export type MissingStep = {
  stepId: string;
  stepOrder: number;
  stepTitle: string;
  stepDescription?: string;
  inputId: string;
  inputLabel: string;
  inputType: "photo" | "video";
  captured: number;
};

export type MissingMediaFlag = {
  id: string;
  runId: string;
  assetId: string;
  assetTag: string;
  jobNumber: string;
  workflowName: string;
  technicianUserId: string;
  technicianName: string;
  completedAt: string;
  missingSteps: MissingStep[];
  totalExpected: number;
  totalCaptured: number;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
};

export type PhotoUpdateNotification = {
  id: string;
  runId: string;
  assetTag: string;
  jobNumber: string;
  workflowName: string;
  installerName: string;
  updatedAt: string;
  stillMissing: number;
  wasComplete: boolean;
};
