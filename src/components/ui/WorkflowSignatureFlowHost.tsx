import { useEffect, useState } from "react";
import SignatureDialog from "./SignatureDialog";
import RequestCustomerSignatureDialog from "./RequestCustomerSignatureDialog";
import {
  isPendingCustomerSignature,
  isPendingInstallerSignature,
} from "../../services/assetWorkflowRunService";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";

export type WorkflowSignatureFlowTarget = {
  asset: ProjectAsset;
  run: AssetWorkflowRun;
  jobNumber?: string;
};

type Props = {
  target: WorkflowSignatureFlowTarget | null;
  assignedTechnician?: string;
  canRequestCustomerSignature?: boolean;
  onClose: () => void;
  onComplete?: () => void;
};

export default function WorkflowSignatureFlowHost({
  target,
  assignedTechnician,
  canRequestCustomerSignature = false,
  onClose,
  onComplete,
}: Props) {
  const [installerRun, setInstallerRun] = useState<AssetWorkflowRun | null>(null);
  const [customerRun, setCustomerRun] = useState<AssetWorkflowRun | null>(null);

  useEffect(() => {
    if (!target) {
      setInstallerRun(null);
      setCustomerRun(null);
      return;
    }
    const { run } = target;
    if (isPendingInstallerSignature(run.signatureStatus)) {
      setInstallerRun(run);
      setCustomerRun(null);
      return;
    }
    if (isPendingCustomerSignature(run.signatureStatus)) {
      if (canRequestCustomerSignature) {
        setCustomerRun(run);
        setInstallerRun(null);
        return;
      }
      setInstallerRun(null);
      setCustomerRun(null);
      onClose();
      return;
    }
    setInstallerRun(null);
    setCustomerRun(null);
    onClose();
  }, [target, canRequestCustomerSignature, onClose]);

  if (!target) return null;

  const handleComplete = () => {
    onComplete?.();
    onClose();
  };

  return (
    <>
      {installerRun && (
        <SignatureDialog
          open
          runId={installerRun.id}
          signerRole="Installer"
          defaultSignerName={assignedTechnician ?? ""}
          onClose={onClose}
          onSigned={handleComplete}
        />
      )}
      {customerRun && (
        <RequestCustomerSignatureDialog
          open
          asset={target.asset}
          run={customerRun}
          jobNumber={target.jobNumber}
          onClose={onClose}
          onSent={handleComplete}
          onWaived={handleComplete}
        />
      )}
    </>
  );
}
