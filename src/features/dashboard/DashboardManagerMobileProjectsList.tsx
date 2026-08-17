import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { Project } from "../../types/project";
import {
  workflowModeChipColor,
  workflowModeLabel,
} from "./dashboardPageLogic";
import type { DashboardProjectScope } from "./DashboardProjectStatusGrid";

type ProjectCompletionMetrics = {
  issueCount: number;
  totalAssets: number;
  complete: number;
  completionPct: number;
};

type Props = {
  projects: Project[];
  canViewAllProjects: boolean;
  dashboardProjectScope: DashboardProjectScope;
  onDashboardProjectScopeChange: (scope: DashboardProjectScope) => void;
  onNavigateToProjects: () => void;
  onNavigateToProjectAssets: (project: Project) => void;
  getProjectCompletionMetrics: (project: Project) => ProjectCompletionMetrics;
};

export default function DashboardManagerMobileProjectsList({
  projects,
  canViewAllProjects,
  dashboardProjectScope,
  onDashboardProjectScopeChange,
  onNavigateToProjects,
  onNavigateToProjectAssets,
  getProjectCompletionMetrics,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: canViewAllProjects ? 1 : 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>
          Projects
        </Typography>
        <Button size="small" variant="text" onClick={onNavigateToProjects}>
          View all
        </Button>
      </Stack>
      {canViewAllProjects && (
        <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }}>
          <Chip
            label="My Projects"
            clickable
            size="small"
            color={dashboardProjectScope === "mine" ? "primary" : "default"}
            variant={dashboardProjectScope === "mine" ? "filled" : "outlined"}
            onClick={() => onDashboardProjectScopeChange("mine")}
            sx={{ height: 26, fontSize: "0.72rem" }}
          />
          <Chip
            label="All Projects"
            clickable
            size="small"
            color={dashboardProjectScope === "all" ? "primary" : "default"}
            variant={dashboardProjectScope === "all" ? "filled" : "outlined"}
            onClick={() => onDashboardProjectScopeChange("all")}
            sx={{ height: 26, fontSize: "0.72rem" }}
          />
        </Stack>
      )}
      {projects.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No projects in scope.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {projects.slice(0, 6).map((project) => {
            const { issueCount, totalAssets, complete, completionPct } = getProjectCompletionMetrics(project);
            return (
              <Paper
                key={project.id}
                elevation={0}
                onClick={() => onNavigateToProjectAssets(project)}
                sx={{
                  p: 1.5,
                  border: "1px solid var(--stroke)",
                  borderRadius: 1.5,
                  cursor: "pointer",
                  "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1 }}>
                    {project.jobNumber}
                  </Typography>
                  <Chip
                    label={workflowModeLabel(project.workflowMode)}
                    color={workflowModeChipColor(project.workflowMode)}
                    size="small"
                    variant="outlined"
                    sx={{ height: 22, fontSize: 11 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ mb: 1 }}>
                  {project.customerName || "No customer"} · {project.status}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {totalAssets} assets
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {complete} done
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 80 }}>
                    <LinearProgress
                      variant="determinate"
                      value={completionPct}
                      color={issueCount > 0 ? "error" : "success"}
                      sx={{ height: 6, borderRadius: 1 }}
                    />
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ minWidth: 34, textAlign: "right", flexShrink: 0 }}
                  >
                    {completionPct}%
                  </Typography>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
