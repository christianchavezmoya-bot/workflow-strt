import { AssessmentOutlined } from "@mui/icons-material";
import { Box, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import type { OpenAssetItem } from "../../services/projectAssetService";
import type { Project } from "../../types/project";
import { isInProgressAsset } from "./dashboardPageLogic";

type Props = {
  inspectionScopeProjects: Project[];
  inspectionScopeAssets: OpenAssetItem[];
  onNavigateToProject: (projectId: string) => void;
};

export default function DashboardAdminInspectionWorkspace({
  inspectionScopeProjects,
  inspectionScopeAssets,
  onNavigateToProject,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <AssessmentOutlined sx={{ color: "primary.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
          Inspections
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Inspection projects and open inspection assets across the current dashboard scope.
      </Typography>

      {inspectionScopeProjects.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          No inspection projects in this scope.
        </Typography>
      ) : (
        <Grid container spacing={1.5}>
          {inspectionScopeProjects.slice(0, 8).map((project) => {
            const projectAssets = inspectionScopeAssets.filter((asset) => asset.projectId === project.id);
            const activeAssets = projectAssets.filter(
              (asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status),
            ).length;
            return (
              <Grid item xs={12} sm={6} md={4} key={project.id}>
                <Paper
                  elevation={0}
                  onClick={() => onNavigateToProject(project.id)}
                  sx={{
                    p: 1.5,
                    border: "1px solid var(--stroke)",
                    borderRadius: 1.5,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
                  }}
                >
                  <Stack spacing={0.75}>
                    <Typography variant="caption" fontWeight={700} noWrap display="block">
                      {project.jobNumber}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {project.customerName || "No customer"} - {project.status}
                    </Typography>
                    <Typography
                      variant="caption"
                      color={project.projectManager?.trim() ? "text.secondary" : "warning.main"}
                      noWrap
                      display="block"
                    >
                      PM: {project.projectManager?.trim() || "No PM assigned"}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      <Chip
                        label={`${projectAssets.length} open assets`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.62rem" }}
                      />
                      {activeAssets > 0 && (
                        <Chip
                          label={`${activeAssets} in progress`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.62rem" }}
                        />
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
