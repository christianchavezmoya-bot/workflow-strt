import { AssessmentOutlined, CloseOutlined, PrintOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { OpenAssetItem, TechnicianWorkloadSummaryItem } from "../../services/projectAssetService";
import type { Project } from "../../types/project";
import { isInProgressAsset, isNotStartedAsset, isPausedAsset } from "./dashboardPageLogic";
import type { ScopedWorkloadItem } from "./DashboardWorkloadPanel";

type Props = {
  reportTarget: ScopedWorkloadItem | null;
  allReportsOpen: boolean;
  scopedWorkload: ScopedWorkloadItem[];
  openAssets: OpenAssetItem[];
  projectById: Map<string, Project>;
  reportingTechId: string | null;
  isNativePlatform: boolean;
  onCloseTarget: () => void;
  onCloseAll: () => void;
  onGenerateTechReport: (target: TechnicianWorkloadSummaryItem) => void;
};

function workloadLoadColor(totalAssigned: number): "error" | "warning" | "success" {
  if (totalAssigned >= 10) return "error";
  if (totalAssigned >= 5) return "warning";
  return "success";
}

function assetStateLabel(asset: OpenAssetItem): string {
  if (isPausedAsset(asset.runStatus)) return "Paused";
  if (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)) return "In Progress";
  if (isNotStartedAsset(asset.status)) return "Not Started";
  return asset.status;
}

function assetStateColor(state: string): "primary" | "warning" | "default" {
  if (state === "In Progress") return "primary";
  if (state === "Paused") return "warning";
  return "default";
}

export default function DashboardWorkloadReportDialogs({
  reportTarget,
  allReportsOpen,
  scopedWorkload,
  openAssets,
  projectById,
  reportingTechId,
  isNativePlatform,
  onCloseTarget,
  onCloseAll,
  onGenerateTechReport,
}: Props) {
  const reportDateLabel = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      {reportTarget && (
        <Dialog open onClose={onCloseTarget} fullWidth maxWidth="md" id="workload-report-dialog">
          <DialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}>
              <AssessmentOutlined sx={{ color: "primary.main" }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
                  {reportTarget.fullName} — Workload Report
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {reportDateLabel}
                </Typography>
              </Box>
              <IconButton size="small" onClick={onCloseTarget}>
                <CloseOutlined fontSize="small" />
              </IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                {[
                  { label: "Total Assets", value: reportTarget.totalAssigned, color: workloadLoadColor(reportTarget.totalAssigned) },
                  { label: "In Progress", value: reportTarget.inProgress, color: "primary" as const },
                  { label: "Paused", value: reportTarget.paused, color: "warning" as const },
                  { label: "Queued", value: reportTarget.notStarted, color: "default" as const },
                ].map(({ label, value, color }) => (
                  <Paper key={label} elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, minWidth: 90 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {label}
                    </Typography>
                    <Typography variant="h5" fontWeight={700} color={`${color}.main`}>
                      {value}
                    </Typography>
                  </Paper>
                ))}
                {reportTarget.totalSteps > 0 && (
                  <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Steps
                    </Typography>
                    <Typography variant="h5" fontWeight={700}>
                      {reportTarget.completedSteps}/{reportTarget.totalSteps}
                    </Typography>
                  </Paper>
                )}
              </Stack>
              <Divider />
              {reportTarget.projectBreakdown.map((projectBreakdown) => {
                const project = projectById.get(projectBreakdown.projectId);
                const projectAssets = openAssets.filter(
                  (asset) =>
                    asset.assignedUserId === reportTarget.userId && asset.projectId === projectBreakdown.projectId,
                );
                return (
                  <Box key={projectBreakdown.projectId}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                      <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                        {projectBreakdown.jobNumber}
                      </Typography>
                      {project?.customerName && (
                        <Typography variant="body2" color="text.secondary">
                          — {project.customerName}
                        </Typography>
                      )}
                      {project?.projectManager && (
                        <Chip
                          label={`PM: ${project.projectManager}`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.65rem", ml: "auto" }}
                        />
                      )}
                      <Chip
                        label={`${projectBreakdown.inProgress} active · ${projectBreakdown.paused} paused · ${projectBreakdown.notStarted} queued`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.62rem" }}
                      />
                    </Stack>
                    <Stack spacing={0.4}>
                      {projectAssets.map((asset) => {
                        const state = assetStateLabel(asset);
                        return (
                          <Stack
                            key={asset.id}
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 1,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            <Typography variant="caption" fontWeight={700} sx={{ flex: "0 0 110px" }}>
                              {asset.assetTag || asset.id}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
                              {asset.assetName || asset.assetModel || "—"}
                            </Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                              {asset.location || ""}
                            </Typography>
                            {asset.totalSteps > 0 && (
                              <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                                {asset.completedSteps}/{asset.totalSteps} steps
                              </Typography>
                            )}
                            <Chip
                              label={state}
                              size="small"
                              color={assetStateColor(state)}
                              variant="outlined"
                              sx={{ height: 18, fontSize: "0.62rem", flexShrink: 0 }}
                            />
                          </Stack>
                        );
                      })}
                      {projectAssets.length === 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ pl: 1.5 }}>
                          No individual asset data available
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 1.5 }}>
            <Button startIcon={<PrintOutlined />} onClick={() => window.print()}>
              Print
            </Button>
            <Button
              variant="contained"
              startIcon={<AssessmentOutlined />}
              disabled={reportingTechId === reportTarget.userId}
              onClick={() => onGenerateTechReport(reportTarget)}
            >
              Download PDF
            </Button>
            <Button onClick={onCloseTarget}>Close</Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={allReportsOpen} onClose={onCloseAll} fullWidth maxWidth="lg" id="workload-report-all-dialog">
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PrintOutlined sx={{ color: "primary.main" }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
                Technician Workload — Full Report
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {scopedWorkload.length} technician{scopedWorkload.length !== 1 ? "s" : ""} · {reportDateLabel}
              </Typography>
            </Box>
            <IconButton size="small" onClick={onCloseAll}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            {scopedWorkload.map((workload) => {
              const techAssets = openAssets.filter((asset) => asset.assignedUserId === workload.userId);
              const load = workloadLoadColor(workload.totalAssigned);
              return (
                <Box key={workload.userId}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>
                      {workload.fullName}
                    </Typography>
                    <Chip
                      label={workload.totalAssigned >= 10 ? "Heavy" : workload.totalAssigned >= 5 ? "Moderate" : "Light"}
                      size="small"
                      color={load}
                      variant="outlined"
                      sx={{ height: 18, fontSize: "0.65rem" }}
                    />
                    {workload.hasIssues && (
                      <Chip label="Issues" size="small" color="warning" sx={{ height: 18, fontSize: "0.65rem" }} />
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                      {workload.inProgress} active · {workload.paused} paused · {workload.notStarted} queued ·{" "}
                      {workload.totalAssigned} total
                    </Typography>
                  </Stack>
                  {workload.projectBreakdown.map((projectBreakdown) => {
                    const project = projectById.get(projectBreakdown.projectId);
                    const projectAssets = techAssets.filter((asset) => asset.projectId === projectBreakdown.projectId);
                    return (
                      <Box key={projectBreakdown.projectId} sx={{ mb: 1, pl: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                          <Typography variant="caption" fontWeight={700} color="primary.main">
                            {projectBreakdown.jobNumber}
                          </Typography>
                          {project?.customerName && (
                            <Typography variant="caption" color="text.secondary">
                              — {project.customerName}
                            </Typography>
                          )}
                          {project?.projectManager && (
                            <Typography variant="caption" color="text.disabled">
                              · PM: {project.projectManager}
                            </Typography>
                          )}
                        </Stack>
                        <Stack spacing={0.3}>
                          {projectAssets.map((asset) => {
                            const state = assetStateLabel(asset);
                            return (
                              <Stack
                                key={asset.id}
                                direction="row"
                                alignItems="center"
                                spacing={1}
                                sx={{ px: 1, py: 0.25, borderRadius: 1, background: "rgba(255,255,255,0.03)" }}
                              >
                                <Typography variant="caption" fontWeight={600} sx={{ flex: "0 0 100px", fontSize: "0.68rem" }}>
                                  {asset.assetTag || asset.id}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, fontSize: "0.65rem" }}>
                                  {asset.assetName || asset.assetModel || "—"}
                                </Typography>
                                {asset.totalSteps > 0 && (
                                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.62rem", flexShrink: 0 }}>
                                    {asset.completedSteps}/{asset.totalSteps} steps
                                  </Typography>
                                )}
                                <Chip
                                  label={state}
                                  size="small"
                                  color={assetStateColor(state)}
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }}
                                />
                              </Stack>
                            );
                          })}
                        </Stack>
                      </Box>
                    );
                  })}
                  <Divider sx={{ mt: 1 }} />
                </Box>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          {!isNativePlatform && (
            <Button startIcon={<PrintOutlined />} onClick={() => window.print()}>
              Print All
            </Button>
          )}
          <Button onClick={onCloseAll}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
