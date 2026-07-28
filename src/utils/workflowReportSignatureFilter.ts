import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { SignatureEvent } from "../types/signature";

export type WorkflowReportSignatureFilter =
  | "all"
  | "completed-no-signatures"
  | "completed-installer-signed"
  | "completed-all-signatures";

export type WorkflowReportSignatureBucket =
  | "no-workflow"
  | "not-started"
  | "in-progress"
  | "completed-no-signatures"
  | "completed-installer-signed"
  | "completed-all-signatures"
  | "other";

export const WORKFLOW_REPORT_SIGNATURE_FILTER_OPTIONS: Array<{
  value: WorkflowReportSignatureFilter;
  label: string;
  description: string;
}> = [
  { value: "all", label: "All reports", description: "Every selected asset" },
  {
    value: "completed-no-signatures",
    label: "Completed — no signatures",
    description: "Locked/complete runs awaiting sign-off",
  },
  {
    value: "completed-installer-signed",
    label: "Completed — installer signed",
    description: "Installer signed; customer signature pending",
  },
  {
    value: "completed-all-signatures",
    label: "Completed — all signatures",
    description: "Customer signed or customer sign-off waived",
  },
];

export function classifyWorkflowReportSignature(
  run: AssetWorkflowRun,
  signatureEvents: SignatureEvent[] = [],
): WorkflowReportSignatureBucket {
  const hasPersistedRun = Boolean(run.id);
  const snapshot = (run.workflowSnapshotJson ?? "").trim();
  const snapshotEmpty = !snapshot || snapshot === "{}" || snapshot === "null";

  if (!hasPersistedRun && snapshotEmpty) return "no-workflow";
  if (!hasPersistedRun) return "not-started";
  if (!run.isLocked && run.status !== "Complete") return "in-progress";

  const installerSigned =
    Boolean(run.installerSignedAt)
    || signatureEvents.some((event) => event.signerRole === "Installer");
  const customerComplete =
    Boolean(run.customerSignedAt)
    || run.signatureStatus === "Signed"
    || run.signatureStatus === "WaivedCustomer"
    || signatureEvents.some((event) => event.signerRole === "Customer");

  if (customerComplete) return "completed-all-signatures";
  if (installerSigned) return "completed-installer-signed";
  if (run.isLocked || run.status === "Complete") return "completed-no-signatures";

  return "other";
}

export function matchesWorkflowReportSignatureFilter(
  bucket: WorkflowReportSignatureBucket,
  filter: WorkflowReportSignatureFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "completed-no-signatures") return bucket === "completed-no-signatures";
  if (filter === "completed-installer-signed") return bucket === "completed-installer-signed";
  if (filter === "completed-all-signatures") return bucket === "completed-all-signatures";
  return false;
}

export function workflowReportSignatureBucketLabel(bucket: WorkflowReportSignatureBucket): string {
  switch (bucket) {
    case "no-workflow": return "No workflow";
    case "not-started": return "Not started";
    case "in-progress": return "In progress";
    case "completed-no-signatures": return "Awaiting signatures";
    case "completed-installer-signed": return "Installer signed";
    case "completed-all-signatures": return "Fully signed";
    default: return "Other";
  }
}
