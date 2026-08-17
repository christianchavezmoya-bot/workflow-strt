import {
  EditOutlined,
  FolderOutlined,
  OpenInNewOutlined,
  PendingActionsOutlined,
  PhotoCameraOutlined,
  PlayArrowOutlined,
  ReportOutlined,
  WarningAmberOutlined,
  WorkOutlineOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowAssignment } from "../../types/workflowType";
import type { OpenIssueRecord, PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";
import {
  dashboardStatusChip,
  formatStepCompletionPercent,
  isInspectionWorkflowType,
} from "./dashboardPageLogic";
import type { MissingMediaFlag } from "./photoUploadTypes";

export type QuickActionAttention = {
  blockingIssues: OpenIssueRecord[];
  highObservations: OpenIssueRecord[];
  pendingSignature: PendingSignatureRecord | null;
  missingMedia: MissingMediaFlag | null;
  activeRun: AssetWorkflowRun | null;
  latestRun: AssetWorkflowRun | null;
};

export type QuickActionPrimaryAction = {
  label: string;
  color: "primary" | "success" | "warning" | "error" | "info";
  onClick: () => void;
};

export type QuickActionProductWorkflow = {
  configId: string;
  configName: string;
  workflowTypeId?: string;
};

type Props = {
  open: boolean;
  loading: boolean;
  asset: DashboardWorkspaceAssetItem | null;
  attention: QuickActionAttention;
  assignments: WorkflowAssignment[];
  runs: AssetWorkflowRun[];
  productWorkflow: QuickActionProductWorkflow | null;
  primaryAction: QuickActionPrimaryAction | null;
  docsLoading: boolean;
  docsCount: number;
  runnerLoadingAssetId: string | null;
  offlineConfigMissingBlock: boolean;
  offlineConfigMissingMessage: string;
  onClose: () => void;
  onNavigateToAssets: () => void;
  onOpenDocuments: () => void;
  onEditAsset: () => void;
  onRetryOfflineDownload: () => void;
  onOpenAssignDialog: () => void;
  onLaunchProductWorkflow: (workflow: QuickActionProductWorkflow) => void;
  onStartAssignment: (assignment: WorkflowAssignment) => void;
  onOpenInspectionImport: () => void;
  assetLikelyHasWorkflowFn: (
    asset: DashboardWorkspaceAssetItem,
    nativeAsset?: ProjectAsset | null,
  ) => boolean;
  nativeAssetContext?: ProjectAsset | null;
};

export default function DashboardQuickActionDialog({
  open,
  loading,
  asset,
  attention,
  assignments,
  runs,
  productWorkflow,
  primaryAction,
  docsLoading,
  docsCount,
  runnerLoadingAssetId,
  offlineConfigMissingBlock,
  offlineConfigMissingMessage,
  onClose,
  onNavigateToAssets,
  onOpenDocuments,
  onEditAsset,
  onRetryOfflineDownload,
  onOpenAssignDialog,
  onLaunchProductWorkflow,
  onStartAssignment,
  onOpenInspectionImport,
  assetLikelyHasWorkflowFn,
  nativeAssetContext,
}: Props) {
  const runnerLoading = asset ? runnerLoadingAssetId === asset.id : false;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <WorkOutlineOutlined sx={{ color: "primary.main" }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {asset?.assetTag || asset?.assetName || "Asset"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {asset?.jobNumber}
            </Typography>
          </Box>
          <Chip
            label={asset ? dashboardStatusChip(asset).label : ""}
            size="small"
            color={asset ? dashboardStatusChip(asset).color : "default"}
            variant="outlined"
          />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack spacing={2}>
            {asset && (
              <Box>
                {asset.totalSteps > 0 && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Progress: {formatStepCompletionPercent(asset.completedSteps, asset.totalSteps)}
                    {asset.missingItems > 0 && ` \u2022 ${asset.missingItems} missing`}
                  </Typography>
                )}
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                  {attention.blockingIssues.length > 0 && (
                    <Chip size="small" color="error" variant="outlined" label={`${attention.blockingIssues.length} blocking`} />
                  )}
                  {attention.highObservations.length > 0 && (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={`${attention.highObservations.length} obs / scope`}
                    />
                  )}
                  {attention.missingMedia && (
                    <Chip size="small" color="warning" variant="outlined" label="Missing photos" />
                  )}
                  {attention.pendingSignature && (
                    <Chip size="small" color="warning" variant="outlined" label="Pending signature" />
                  )}
                </Stack>
              </Box>
            )}

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
              Quick Actions
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                startIcon={docsLoading ? <CircularProgress size={14} /> : <FolderOutlined fontSize="small" />}
                onClick={onOpenDocuments}
                disabled={docsLoading}
              >
                Documents ({docsCount})
              </Button>
              <Button size="small" variant="outlined" startIcon={<EditOutlined fontSize="small" />} onClick={onEditAsset}>
                Edit Asset
              </Button>
              {primaryAction && (
                <Button
                  size="small"
                  variant="contained"
                  color={primaryAction.color}
                  startIcon={
                    primaryAction.label === "Resolve Blocking Issue" || primaryAction.label === "Resolve Issue" ? (
                      <WarningAmberOutlined fontSize="small" />
                    ) : primaryAction.label === "Add Missing Photos" || primaryAction.label === "Add Photos" ? (
                      <PhotoCameraOutlined fontSize="small" />
                    ) : primaryAction.label === "Complete Sign-off" ? (
                      <PendingActionsOutlined fontSize="small" />
                    ) : primaryAction.label === "Review High Observation" ? (
                      <ReportOutlined fontSize="small" />
                    ) : (
                      <PlayArrowOutlined fontSize="small" />
                    )
                  }
                  onClick={primaryAction.onClick}
                >
                  {primaryAction.label}
                </Button>
              )}
            </Stack>

            {(attention.blockingIssues.length > 0 ||
              attention.highObservations.length > 0 ||
              attention.missingMedia ||
              attention.pendingSignature) && (
              <Alert severity={attention.blockingIssues.length > 0 ? "error" : "warning"} sx={{ mt: 0.5 }}>
                {attention.blockingIssues.length > 0
                  ? "This asset has an open blocking issue. Resolve it before expecting the workflow to complete normally."
                  : attention.missingMedia
                    ? "This asset has missing workflow photos. The primary action takes the user directly to photo recovery."
                    : attention.pendingSignature
                      ? "This asset is waiting for sign-off. Keep signature recovery as a first-class action."
                      : "This asset has high-severity observations that still need review."}
              </Alert>
            )}

            {assignments.length === 0 && runs.length === 0 && !productWorkflow ? (
              asset &&
              assetLikelyHasWorkflowFn(asset, nativeAssetContext) &&
              offlineConfigMissingBlock ? (
                <Stack spacing={1.5}>
                  <Alert severity="warning">{offlineConfigMissingMessage}</Alert>
                  <Button variant="outlined" onClick={onRetryOfflineDownload}>
                    Retry download when online
                  </Button>
                </Stack>
              ) : (
                <Stack spacing={1.5}>
                  <Alert severity="info">No workflow assigned to this asset yet.</Alert>
                  <Button variant="contained" color="primary" startIcon={<PlayArrowOutlined />} onClick={onOpenAssignDialog}>
                    Assign Workflow
                  </Button>
                </Stack>
              )
            ) : assignments.length === 0 && runs.length === 0 && productWorkflow ? (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
                  Linked Workflow (from product)
                </Typography>
                <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {productWorkflow.configName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {isInspectionWorkflowType(productWorkflow.workflowTypeId) ? "Inspection" : "Installation"} workflow
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={runnerLoading ? <CircularProgress size={14} /> : <PlayArrowOutlined />}
                      disabled={runnerLoading}
                      onClick={() => onLaunchProductWorkflow(productWorkflow)}
                    >
                      Start Run
                    </Button>
                  </Stack>
                </Paper>
              </Box>
            ) : assignments.length === 0 && runs.length > 0 ? (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
                  Previous Workflow Runs
                </Typography>
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  This asset has previous workflow runs but no current assignment. Assign a new workflow to start fresh.
                </Alert>
                <Stack spacing={1}>
                  {runs.slice(0, 3).map((run) => (
                    <Paper key={run.id} elevation={0} sx={{ p: 1.25, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" fontWeight={600}>
                            Run #{run.runNumber ?? 1}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {run.status} ·{" "}
                            {run.completedAt
                              ? `Completed ${new Date(run.completedAt).toLocaleDateString()}`
                              : run.startedAt
                                ? `Started ${new Date(run.startedAt).toLocaleDateString()}`
                                : "In progress"}
                          </Typography>
                        </Box>
                        <Chip
                          label={run.status}
                          size="small"
                          color={run.status === "Complete" ? "success" : run.status === "Issue" ? "error" : "primary"}
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.65rem" }}
                        />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
                <Button variant="contained" color="primary" startIcon={<PlayArrowOutlined />} onClick={onOpenAssignDialog} sx={{ mt: 1.5 }}>
                  Assign New Workflow
                </Button>
              </Box>
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
                  Assigned Workflows
                </Typography>
                <Stack spacing={1}>
                  {assignments.map((assignment) => {
                    const isActive = runs.some(
                      (run) => run.workflowConfigId === assignment.workflowConfigId && !run.isLocked,
                    );
                    const isInspection = isInspectionWorkflowType(assignment.workflowTypeId);
                    return (
                      <Paper key={assignment.id} elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {assignment.workflowConfigName || assignment.workflowConfigId}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {isInspection ? "Inspection" : "Installation"} workflow
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={0.5}>
                            {isInspection && (
                              <Button size="small" variant="outlined" color="info" onClick={onOpenInspectionImport}>
                                Upload JSON
                              </Button>
                            )}
                            <Button
                              size="small"
                              variant="contained"
                              color={isActive ? "primary" : "success"}
                              startIcon={runnerLoading ? <CircularProgress size={14} /> : <PlayArrowOutlined />}
                              disabled={runnerLoading}
                              onClick={() => onStartAssignment(assignment)}
                            >
                              {isActive ? "Resume Run" : "Start Run"}
                            </Button>
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button variant="outlined" startIcon={<OpenInNewOutlined />} onClick={onNavigateToAssets}>
          Go to Project Assets
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
