import { OpenInNewOutlined, TrendingUpOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  FormControl,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import type { Project } from "../../types/project";
import { projectStatusChipColor } from "./dashboardPageLogic";

export type DashboardProjectScope = "mine" | "all";

export type ProjectCompletionMetrics = {
  issueCount: number;
  noWorkflowCount: number;
  totalAssets: number;
  notStarted: number;
  inProgress: number;
  complete: number;
  completionPct: number;
  pendingSignature: number;
  closed: number;
};

type Props = {
  isAdmin: boolean;
  isManager: boolean;
  canViewAllProjects: boolean;
  dashboardProjects: Project[];
  projectsMissingPmCount: number;
  dashboardProjectScope: DashboardProjectScope;
  onDashboardProjectScopeChange: (scope: DashboardProjectScope) => void;
  viewedDashboardUserId?: string | null;
  viewingOwnDashboard: boolean;
  viewedDashboardUserName?: string | null;
  getProjectCompletionMetrics: (project: Project) => ProjectCompletionMetrics;
  isReadyToCloseProject: (project: Project, completionPct: number) => boolean;
  productNameById: Map<string, string>;
  closingDashboardProjectId: string | null;
  onCloseProject: (projectId: string) => void;
  onNavigateToProjectAssets: (project: Project) => void;
};

export default function DashboardProjectStatusGrid({
  isAdmin,
  isManager,
  canViewAllProjects,
  dashboardProjects,
  projectsMissingPmCount,
  dashboardProjectScope,
  onDashboardProjectScopeChange,
  viewedDashboardUserId,
  viewingOwnDashboard,
  viewedDashboardUserName,
  getProjectCompletionMetrics,
  isReadyToCloseProject,
  productNameById,
  closingDashboardProjectId,
  onCloseProject,
  onNavigateToProjectAssets,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <TrendingUpOutlined sx={{ fontSize: 18, color: "primary.main" }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", flex: 1 }}>
          {isAdmin ? "Projects" : "Project Status"}
        </Typography>
        <Chip label={dashboardProjects.length} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
        {isAdmin && projectsMissingPmCount > 0 && (
          <Chip
            label={`${projectsMissingPmCount} missing PM`}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ height: 20, fontSize: "0.7rem" }}
          />
        )}
        {canViewAllProjects && (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select
              value={dashboardProjectScope}
              onChange={(e) => onDashboardProjectScopeChange(e.target.value as DashboardProjectScope)}
              sx={{ fontSize: "0.75rem", height: 26 }}
            >
              <MenuItem value="mine">
                <em>My Projects</em>
              </MenuItem>
              <MenuItem value="all">All Projects</MenuItem>
            </Select>
          </FormControl>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        {viewedDashboardUserId
          ? `${dashboardProjectScope === "mine" ? "My" : "All"} open projects and projects ready to close for ${viewingOwnDashboard ? "you" : viewedDashboardUserName ?? "this user"}`
          : isAdmin
            ? `${dashboardProjectScope === "mine" ? "Your" : "All"} open projects and projects ready to close in the current dashboard scope.`
            : `${dashboardProjectScope === "mine" ? "Your" : "All"} open projects and projects ready to close in the current dashboard scope.`}
      </Typography>

      {dashboardProjects.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          No assigned projects in this scope.
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {dashboardProjects.map((project) => {
            const { issueCount, noWorkflowCount, totalAssets, notStarted, inProgress, complete, completionPct, pendingSignature } =
              getProjectCompletionMetrics(project);
            const readyToClose = isReadyToCloseProject(project, completionPct);
            const awaitingSignatures = String(project.status ?? "") === "Completed"
              && completionPct >= 100
              && pendingSignature > 0;
            const productNames = (project.productIds ?? [])
              .map((id) => productNameById.get(id) ?? id)
              .filter(Boolean)
              .join(", ");

            return (
              <Box
                key={project.id}
                sx={{
                  px: 2,
                  py: 1.25,
                  borderRadius: 2,
                  border: readyToClose ? "1px solid rgba(59,130,246,0.45)" : "1px solid rgba(255,255,255,0.08)",
                  background: readyToClose
                    ? "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(16,185,129,0.08))"
                    : "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    background: readyToClose
                      ? "linear-gradient(135deg, rgba(59,130,246,0.16), rgba(16,185,129,0.1))"
                      : "rgba(45,212,191,0.06)",
                    borderColor: readyToClose ? "rgba(59,130,246,0.6)" : "rgba(45,212,191,0.25)",
                  },
                }}
                onClick={() => onNavigateToProjectAssets(project)}
              >
                <Stack spacing={0.7}>
                  <Stack direction={{ xs: "column", xl: "row" }} spacing={0.9} alignItems={{ xl: "center" }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {project.jobNumber}
                      </Typography>
                      <Chip
                        label={project.status}
                        size="small"
                        color={projectStatusChipColor(project.status)}
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.68rem" }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={700}
                        sx={{ textTransform: "uppercase", letterSpacing: 0.4 }}
                      >
                        {totalAssets} assets
                      </Typography>
                      {awaitingSignatures && (
                        <Chip
                          label={`${pendingSignature} Awaiting Signatures`}
                          size="small"
                          color="warning"
                          sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
                        />
                      )}
                      {readyToClose && (
                        <Chip label="Ready to Close" size="small" color="info" sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }} />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                      {notStarted > 0 && (
                        <Chip size="small" label={`${notStarted} Not Started`} sx={{ height: 20, fontSize: "0.68rem" }} />
                      )}
                      {inProgress > 0 && (
                        <Chip size="small" label={`${inProgress} In Progress`} color="primary" sx={{ height: 20, fontSize: "0.68rem" }} />
                      )}
                      {complete > 0 && (
                        <Chip size="small" label={`${complete} Complete`} color="success" sx={{ height: 20, fontSize: "0.68rem" }} />
                      )}
                      {issueCount > 0 && (
                        <Chip size="small" label={`${issueCount} Issue`} color="error" sx={{ height: 20, fontSize: "0.68rem" }} />
                      )}
                      {noWorkflowCount > 0 && (
                        <Chip
                          size="small"
                          label={`${noWorkflowCount} No Workflow`}
                          color="warning"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.68rem" }}
                        />
                      )}
                    </Stack>
                    <Box sx={{ flex: 1, minWidth: { xs: 120, xl: 180 } }}>
                      <LinearProgress
                        variant="determinate"
                        value={completionPct}
                        color={issueCount > 0 ? "error" : "success"}
                        sx={{ height: 6, borderRadius: 1 }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56, textAlign: { xl: "right" }, flexShrink: 0 }}>
                      {completionPct}%
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {[project.customerName, project.siteName, productNames || "No products linked"].filter(Boolean).join(" - ")}
                  </Typography>
                  {readyToClose && (
                    <Typography variant="caption" color="info.main">
                      {project.completedAtUtc
                        ? `Completed ${new Date(project.completedAtUtc).toLocaleString()}${project.completedBy ? ` by ${project.completedBy}` : ""} — all signatures finalized.`
                        : "Field work and signatures are complete — ready for PM/Admin closure."}
                    </Typography>
                  )}
                  {awaitingSignatures && (
                    <Typography variant="caption" color="warning.main">
                      Field work is 100% but {pendingSignature} asset(s) still need installer/customer sign-off (or customer waiver) before this project can be closed.
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color={project.projectManager?.trim() ? "text.secondary" : "warning.main"} noWrap>
                      PM: {project.projectManager?.trim() || "No PM assigned"}
                    </Typography>
                    <Stack direction="row" spacing={1} useFlexGap>
                      {readyToClose && isManager && (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={closingDashboardProjectId === project.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloseProject(project.id);
                          }}
                          sx={{ fontSize: "0.72rem", minHeight: 26 }}
                        >
                          {closingDashboardProjectId === project.id ? "Closing..." : "Mark as Closed"}
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<OpenInNewOutlined sx={{ fontSize: 13 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToProjectAssets(project);
                        }}
                        sx={{ fontSize: "0.72rem", minHeight: 26 }}
                      >
                        Go to Project Assets
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
