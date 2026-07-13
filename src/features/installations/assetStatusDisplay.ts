import type { ProjectAssetStatus } from "../../types/projectAsset";

export const STATUS_COLORS: Record<ProjectAssetStatus, "default" | "primary" | "success" | "error" | "warning" | "info"> = {
  NotStarted: "default",
  InProgress: "primary",
  Paused: "warning",
  Pending: "warning",
  Complete: "success",
  Closed: "info",
  Issue: "error",
};

export const STATUS_LABELS: Record<ProjectAssetStatus, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Paused: "Paused",
  Pending: "Pending",
  Complete: "Complete",
  Closed: "Closed",
  Issue: "Issue",
};
