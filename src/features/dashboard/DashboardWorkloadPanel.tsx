import {
  AssessmentOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  PrintOutlined,
} from "@mui/icons-material";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { OpenAssetItem, TechnicianWorkloadSummaryItem } from "../../services/projectAssetService";
import type { Project } from "../../types/project";
import { isInProgressAsset, isNotStartedAsset, isPausedAsset } from "./dashboardPageLogic";

export type WorkloadProjectBreakdown = {
  projectId: string;
  jobNumber: string;
  notStarted: number;
  inProgress: number;
  paused: number;
  total: number;
};

export type ScopedWorkloadItem = TechnicianWorkloadSummaryItem & {
  projectBreakdown: WorkloadProjectBreakdown[];
};

type Props = {
  scopedWorkload: ScopedWorkloadItem[];
  workloadLoading: boolean;
  cacheHydrated: boolean;
  expandedWorkloadId: string | null;
  onExpandedWorkloadIdChange: (userId: string | null) => void;
  openAssets: OpenAssetItem[];
  projectById: Map<string, Project>;
  onOpenAllReports: () => void;
  onOpenTechnicianReport: (target: ScopedWorkloadItem) => void;
  onNavigateToProject: (projectId: string) => void;
};

export default function DashboardWorkloadPanel({
  scopedWorkload,
  workloadLoading,
  cacheHydrated,
  expandedWorkloadId,
  onExpandedWorkloadIdChange,
  openAssets,
  projectById,
  onOpenAllReports,
  onOpenTechnicianReport,
  onNavigateToProject,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
            Technician Workload
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Click a card to expand · report icon for detail print/download
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Tooltip title="Workflow run is currently active and in progress" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "help" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "success.main" }} />
              <Typography variant="caption" color="text.secondary">
                Active
              </Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Workflow run is currently paused" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "help" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "warning.main" }} />
              <Typography variant="caption" color="text.secondary">
                Paused
              </Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="No workflow run has been started yet" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "help" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                Queued
              </Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Asset is assigned and acknowledged but the workflow hasn't started" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "help" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "info.main", opacity: 0.7 }} />
              <Typography variant="caption" color="text.secondary">
                Pending
              </Typography>
            </Stack>
          </Tooltip>
          {scopedWorkload.length > 0 && (
            <Tooltip title="Print / download full workload report">
              <IconButton size="small" onClick={onOpenAllReports} sx={{ color: "text.secondary" }}>
                <PrintOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
      {workloadLoading && !cacheHydrated ? (
        <LinearProgress />
      ) : scopedWorkload.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No open assets currently assigned to technicians in this scope.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {scopedWorkload.map((w) => {
            const isExpanded = expandedWorkloadId === w.userId;
            const inPct = w.totalAssigned > 0 ? (w.inProgress / w.totalAssigned) * 100 : 0;
            const pausedPct = w.totalAssigned > 0 ? (w.paused / w.totalAssigned) * 100 : 0;
            const notPct = w.totalAssigned > 0 ? (w.notStarted / w.totalAssigned) * 100 : 0;
            const stepPct = w.totalSteps > 0 ? Math.min(100, (w.completedSteps / w.totalSteps) * 100) : 0;
            const load = w.totalAssigned >= 10 ? "error" : w.totalAssigned >= 5 ? "warning" : "success";
            const loadLabel = w.totalAssigned >= 10 ? "Heavy" : w.totalAssigned >= 5 ? "Moderate" : "Light";
            const barColor = w.hasIssues ? "warning.main" : "primary.main";
            const startLabel = w.startedAt
              ? new Date(w.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : null;
            const techAssets = openAssets.filter((a) => a.assignedUserId === w.userId);
            return (
              <Paper
                key={w.userId}
                elevation={0}
                onClick={() => onExpandedWorkloadIdChange(isExpanded ? null : w.userId)}
                sx={{
                  p: 1.5,
                  border: "1px solid",
                  borderColor: isExpanded ? "primary.main" : w.hasIssues ? "warning.dark" : "var(--stroke)",
                  borderRadius: 1.5,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: isExpanded ? "rgba(45,212,191,0.04)" : undefined,
                  "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
                }}
              >
                <Stack spacing={0.5}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ flex: "0 0 160px", minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {w.fullName}
                        </Typography>
                        <Chip
                          label={loadLabel}
                          size="small"
                          color={load}
                          variant="outlined"
                          sx={{ height: 16, fontSize: "0.6rem", flexShrink: 0 }}
                        />
                        {w.hasIssues && (
                          <Chip label="Issues" size="small" color="warning" sx={{ height: 16, fontSize: "0.6rem", flexShrink: 0 }} />
                        )}
                      </Stack>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Tooltip
                        title={
                          w.totalSteps > 0
                            ? `${w.completedSteps}/${w.totalSteps} steps · ${w.inProgress} active · ${w.paused} paused · ${w.notStarted} queued`
                            : `${w.inProgress} active · ${w.paused} paused · ${w.notStarted} queued`
                        }
                        arrow
                      >
                        <Box
                          sx={{
                            position: "relative",
                            height: 10,
                            borderRadius: 5,
                            overflow: "hidden",
                            background: "rgba(255,255,255,0.08)",
                            display: "flex",
                          }}
                        >
                          {w.totalSteps > 0 ? (
                            <Box sx={{ width: `${stepPct}%`, bgcolor: barColor, transition: "width 0.4s" }} />
                          ) : (
                            <>
                              {inPct > 0 && (
                                <Box sx={{ width: `${inPct}%`, bgcolor: "success.main", transition: "width 0.4s" }} />
                              )}
                              {pausedPct > 0 && (
                                <Box sx={{ width: `${pausedPct}%`, bgcolor: "warning.main", transition: "width 0.4s" }} />
                              )}
                              {notPct > 0 && (
                                <Box sx={{ width: `${notPct}%`, bgcolor: "text.secondary", transition: "width 0.4s" }} />
                              )}
                            </>
                          )}
                        </Box>
                      </Tooltip>
                      {w.totalSteps > 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                          {w.completedSteps}/{w.totalSteps} steps
                        </Typography>
                      )}
                    </Box>
                    <Chip label={w.totalAssigned} size="small" color={load} sx={{ fontWeight: 700, minWidth: 40 }} />
                    <Tooltip title="View detail / print / download report">
                      <span>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenTechnicianReport(w);
                          }}
                          sx={{ color: "text.secondary", flexShrink: 0 }}
                        >
                          <AssessmentOutlined sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <IconButton
                      size="small"
                      sx={{ color: "text.secondary", flexShrink: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onExpandedWorkloadIdChange(isExpanded ? null : w.userId);
                      }}
                    >
                      {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
                    </IconButton>
                  </Stack>

                  <Stack direction="row" spacing={0} alignItems="center" flexWrap="nowrap">
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {w.inProgress} active ·{" "}
                      <Tooltip title="Workflow run is currently paused" arrow>
                        <span style={{ cursor: "help", textDecoration: "underline dotted" }}>{w.paused} paused</span>
                      </Tooltip>
                      {" · "}
                      <Tooltip title="No workflow run has been started yet" arrow>
                        <span style={{ cursor: "help", textDecoration: "underline dotted" }}>{w.notStarted} queued</span>
                      </Tooltip>
                      {startLabel && <span style={{ opacity: 0.5 }}>{" · since "}{startLabel}</span>}
                    </Typography>
                  </Stack>

                  {w.projectBreakdown.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {w.projectBreakdown.map((pb) => (
                        <Tooltip
                          key={pb.projectId}
                          title={`${pb.inProgress} active · ${pb.paused} paused · ${pb.notStarted} queued`}
                          arrow
                        >
                          <Chip
                            label={`${pb.jobNumber}: ${pb.total}`}
                            size="small"
                            variant="outlined"
                            color={pb.inProgress > 0 ? "primary" : pb.paused > 0 ? "warning" : "default"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToProject(pb.projectId);
                            }}
                            sx={{ height: 16, fontSize: "0.6rem", cursor: "pointer" }}
                          />
                        </Tooltip>
                      ))}
                    </Stack>
                  )}

                  <Collapse in={isExpanded} unmountOnExit>
                    <Box sx={{ mt: 1, pt: 1, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      {w.projectBreakdown.map((pb) => {
                        const pbAssets = techAssets.filter((a) => a.projectId === pb.projectId);
                        const proj = projectById.get(pb.projectId);
                        return (
                          <Box key={pb.projectId} sx={{ mb: 1.5 }}>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                              <Typography variant="caption" fontWeight={700} color="primary.main">
                                {pb.jobNumber}
                              </Typography>
                              {proj?.customerName && (
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  — {proj.customerName}
                                </Typography>
                              )}
                              {proj?.projectManager && (
                                <Chip
                                  label={`PM: ${proj.projectManager}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: "0.58rem", ml: "auto" }}
                                />
                              )}
                            </Stack>
                            <Stack spacing={0.4}>
                              {pbAssets.map((a) => {
                                const state = isPausedAsset(a.runStatus)
                                  ? "Paused"
                                  : isInProgressAsset(a.runStatus) || isInProgressAsset(a.status)
                                    ? "In Progress"
                                    : isNotStartedAsset(a.status)
                                      ? "Not Started"
                                      : a.status;
                                const stateColor =
                                  state === "In Progress" ? "primary" : state === "Paused" ? "warning" : "default";
                                return (
                                  <Stack
                                    key={a.id}
                                    direction="row"
                                    alignItems="center"
                                    spacing={1}
                                    sx={{ px: 1, py: 0.25, borderRadius: 1, background: "rgba(255,255,255,0.03)" }}
                                  >
                                    <Typography
                                      variant="caption"
                                      fontWeight={600}
                                      noWrap
                                      sx={{ flex: "0 0 100px", fontSize: "0.68rem" }}
                                    >
                                      {a.assetTag || a.assetName || a.id}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, fontSize: "0.65rem" }}>
                                      {a.assetName || a.assetModel || ""}
                                    </Typography>
                                    {a.totalSteps > 0 && (
                                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.62rem", flexShrink: 0 }}>
                                        {a.completedSteps}/{a.totalSteps} steps
                                      </Typography>
                                    )}
                                    <Chip
                                      label={state}
                                      size="small"
                                      color={stateColor as "primary" | "warning" | "default"}
                                      variant="outlined"
                                      sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }}
                                    />
                                  </Stack>
                                );
                              })}
                              {pbAssets.length === 0 && (
                                <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                                  No open assets
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                        );
                      })}
                    </Box>
                  </Collapse>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
