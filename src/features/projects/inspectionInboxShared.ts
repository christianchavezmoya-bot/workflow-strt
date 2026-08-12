import type { InspectionImportStatus } from "../../types/project";

export const INSPECTION_IMPORT_STATUS_COLOR: Record<
  InspectionImportStatus | string,
  "default" | "info" | "warning" | "success" | "error"
> = {
  RECEIVED: "info",
  NEEDS_ASSIGNMENT: "warning",
  MAPPED: "success",
  FAILED: "error",
};

export const INSPECTION_INBOX_SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "disk", label: "Disk" },
  { value: "onedrive", label: "OneDrive" },
  { value: "email", label: "Email" },
  { value: "generic-kv", label: "Generic Key-Value" },
] as const;

export const INSPECTION_DIALOG_SOURCE_OPTIONS = [
  { value: "LOCAL", label: "Local / Manual (canonical)" },
  { value: "ONEDRIVE", label: "OneDrive (canonical)" },
  { value: "EMAIL", label: "Email attachment (canonical)" },
  { value: "API", label: "External system / API (canonical)" },
  { value: "generic-kv", label: "Generic Key-Value (auto-adapted)" },
] as const;
