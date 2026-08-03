import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { UserRole } from "../types/user";

export interface RunEditPermissions {
  time: boolean;
  data: boolean;
  finalized: boolean;
}

const PM_ADMIN_ROLES = new Set<string>(["Admin", "Project Manager", "Supervisor"]);

function isFinalized(signatureStatus: string): boolean {
  return (
    signatureStatus === "Signed" ||
    signatureStatus === "Declined" ||
    signatureStatus === "WaivedCustomer"
  );
}

function isAwaitingCustomer(signatureStatus: string): boolean {
  return signatureStatus === "PendingCustomer";
}

export function canEditRun(
  run: Pick<AssetWorkflowRun, "signatureStatus">,
  role: UserRole | null | undefined,
): RunEditPermissions {
  const status = run.signatureStatus ?? "None";
  const isPmAdmin = !!role && PM_ADMIN_ROLES.has(role);
  const isInstaller = role === "Installer" || role === "Engineer";

  if (isFinalized(status)) {
    return { time: false, data: false, finalized: true };
  }

  if (isAwaitingCustomer(status)) {
    return { time: isPmAdmin, data: isPmAdmin, finalized: false };
  }

  const canEdit = isPmAdmin || isInstaller;
  return { time: canEdit, data: canEdit, finalized: false };
}