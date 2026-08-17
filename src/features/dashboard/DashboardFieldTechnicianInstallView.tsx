import { Alert, Stack, Typography } from "@mui/material";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";
import type { OpenIssueRecord, PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import type { MissingMediaFlag } from "./photoUploadTypes";
import DashboardInspectionWorkBanner from "./DashboardInspectionWorkBanner";
import DashboardInstallHistorySection from "./DashboardInstallHistorySection";
import DashboardInstallerAttentionPanel from "./DashboardInstallerAttentionPanel";
import DashboardMissingMediaFlagsSection from "./DashboardMissingMediaFlagsSection";
import DashboardMyInstallJobsTodaySection from "./DashboardMyInstallJobsTodaySection";
import type { MyJobsCardAction } from "./dashboardPageLogic";

type PhotoReminder = {
  id: string;
  runId: string;
  assetTag: string;
  jobNumber: string;
  workflowName: string;
  sentAt: string;
  sentByName: string;
};

type Props = {
  inspectionRunsDue: number;
  myInstallAssets: DashboardWorkspaceAssetItem[];
  isNativePlatform: boolean;
  runnerLoadingAssetId: string | null;
  photoReminders: PhotoReminder[];
  missingMediaFlags: MissingMediaFlag[];
  technicianUserId: string;
  attentionLoading: boolean;
  myInstallAttentionCount: number;
  myInstallBlocking: OpenIssueRecord[];
  myInstallPendingSigs: PendingSignatureRecord[];
  myInstallHighObservations: OpenIssueRecord[];
  resolvingDashboardIssueId: string | null;
  myInstallHistory: DashboardWorkspaceAssetItem[];
  historyDialogLoading: string | null;
  getMyJobsCardAction: (asset: DashboardWorkspaceAssetItem) => MyJobsCardAction;
  assetAttentionLabel: (item: OpenIssueRecord | PendingSignatureRecord) => string;
  onOpenInspections: () => void;
  onAssetTap: (asset: DashboardWorkspaceAssetItem, cardAction?: MyJobsCardAction) => void;
  onViewAllAssets: () => void;
  onPhotoRemindersChange: (reminders: PhotoReminder[]) => void;
  onMissingMediaFlagsChange: (flags: MissingMediaFlag[]) => void;
  onUploadPhotos: (flag: MissingMediaFlag) => void;
  onOpenIssueRepair: (issue: OpenIssueRecord) => void;
  onOpenSignatureRepair: (signature: PendingSignatureRecord) => void;
  onOpenHistory: (asset: DashboardWorkspaceAssetItem) => void;
};

export default function DashboardFieldTechnicianInstallView({
  inspectionRunsDue,
  myInstallAssets,
  isNativePlatform,
  runnerLoadingAssetId,
  photoReminders,
  missingMediaFlags,
  technicianUserId,
  attentionLoading,
  myInstallAttentionCount,
  myInstallBlocking,
  myInstallPendingSigs,
  myInstallHighObservations,
  resolvingDashboardIssueId,
  myInstallHistory,
  historyDialogLoading,
  getMyJobsCardAction,
  assetAttentionLabel,
  onOpenInspections,
  onAssetTap,
  onViewAllAssets,
  onPhotoRemindersChange,
  onMissingMediaFlagsChange,
  onUploadPhotos,
  onOpenIssueRepair,
  onOpenSignatureRepair,
  onOpenHistory,
}: Props) {
  return (
    <>
      <DashboardInspectionWorkBanner inspectionRunsDue={inspectionRunsDue} onOpenInspections={onOpenInspections} />
      <DashboardMyInstallJobsTodaySection
        assets={myInstallAssets}
        isNativePlatform={isNativePlatform}
        runnerLoadingAssetId={runnerLoadingAssetId}
        getCardAction={getMyJobsCardAction}
        onAssetTap={onAssetTap}
        onViewAll={onViewAllAssets}
      />
      {photoReminders.length > 0 && (
        <Stack spacing={0.5}>
          {photoReminders.map((reminder) => (
            <Alert
              key={reminder.id}
              severity="info"
              onClose={() => {
                const updated = photoReminders.filter((item) => item.id !== reminder.id);
                localStorage.setItem("installer_photo_reminders", JSON.stringify(updated));
                onPhotoRemindersChange(updated);
              }}
            >
              <Typography variant="caption" fontWeight={600}>
                {reminder.sentByName} requested photos for: {reminder.assetTag} {"\u2014"} {reminder.workflowName}
              </Typography>
            </Alert>
          ))}
        </Stack>
      )}
      <DashboardMissingMediaFlagsSection
        variant="installer"
        flags={missingMediaFlags}
        onFlagsChange={onMissingMediaFlagsChange}
        technicianUserId={technicianUserId}
        onUploadPhotos={onUploadPhotos}
      />
      <DashboardInstallerAttentionPanel
        attentionLoading={attentionLoading}
        attentionCount={myInstallAttentionCount}
        blockingIssues={myInstallBlocking}
        pendingSignatures={myInstallPendingSigs}
        highObservations={myInstallHighObservations}
        resolvingIssueId={resolvingDashboardIssueId}
        assetAttentionLabel={assetAttentionLabel}
        onOpenIssueRepair={onOpenIssueRepair}
        onOpenSignatureRepair={onOpenSignatureRepair}
      />
      <DashboardInstallHistorySection
        title="Job History"
        description="Finished, completed, closed, cancelled, or deleted installation work that was assigned to you."
        assets={myInstallHistory}
        loadingAssetId={historyDialogLoading}
        isNativePlatform={isNativePlatform}
        onOpenHistory={onOpenHistory}
      />
    </>
  );
}
