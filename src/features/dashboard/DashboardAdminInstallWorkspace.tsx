import { WorkOutlineOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { OpenAssetItem } from "../../services/projectAssetService";
import type { Project } from "../../types/project";
import { dashboardStatusChip, isInProgressAsset } from "./dashboardPageLogic";

export type AdminInstallFilter = "all" | "in-progress" | "unassigned";

type Props = {
  installProjectsWithOpenAssets: Project[];
  totalInstallAssetCount: number;
  installScopeAssets: OpenAssetItem[];
  adminInstallFilter: AdminInstallFilter;
  onAdminInstallFilterChange: (filter: AdminInstallFilter) => void;
  filteredAdminInstallAssets: OpenAssetItem[];
  filteredAdminInstallProjects: Project[];
  adminInstallProjectsOpen: boolean;
  onAdminInstallProjectsOpenChange: (open: boolean) => void;
  adminInstallPmFilter: string;
  onAdminInstallPmFilterChange: (value: string) => void;
  adminInstallProjectFilter: string;
  onAdminInstallProjectFilterChange: (value: string) => void;
  projectPmLabel: (projectId?: string | null) => string;
  onNavigateToInstallations: () => void;
  onNavigateToProject: (projectId: string) => void;
};

export default function DashboardAdminInstallWorkspace({
  installProjectsWithOpenAssets,
  totalInstallAssetCount,
  installScopeAssets,
  adminInstallFilter,
  onAdminInstallFilterChange,
  filteredAdminInstallAssets,
  filteredAdminInstallProjects,
  adminInstallProjectsOpen,
  onAdminInstallProjectsOpenChange,
  adminInstallPmFilter,
  onAdminInstallPmFilterChange,
  adminInstallProjectFilter,
  onAdminInstallProjectFilterChange,
  projectPmLabel,
  onNavigateToInstallations,
  onNavigateToProject,
}: Props) {
  const inProgressCount = installScopeAssets.filter(
    (asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status),
  ).length;
  const unassignedCount = installScopeAssets.filter((asset) => !asset.assignedUserId).length;

  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <WorkOutlineOutlined sx={{ color: "primary.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
          Installs
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Open installation assets across the current dashboard scope with PM ownership.
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Paper
            elevation={0}
            onClick={() => onAdminInstallProjectsOpenChange(true)}
            sx={{
              p: 1.5,
              border: "1px solid var(--stroke)",
              borderRadius: 1.5,
              cursor: "pointer",
              transition: "all 0.15s",
              "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Projects
            </Typography>
            <Typography variant="h5" fontWeight={700}>
              {installProjectsWithOpenAssets.length}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              {totalInstallAssetCount} total assets
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper
            elevation={0}
            onClick={() => onAdminInstallFilterChange("all")}
            sx={{
              p: 1.5,
              border: "1px solid var(--stroke)",
              borderRadius: 1.5,
              cursor: "pointer",
              transition: "all 0.15s",
              borderColor: adminInstallFilter === "all" ? "primary.main" : "var(--stroke)",
              background: adminInstallFilter === "all" ? "rgba(45,212,191,0.08)" : undefined,
              "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Open Assets
            </Typography>
            <Typography variant="h5" fontWeight={700}>
              {totalInstallAssetCount}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Showing all live installs
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper
            elevation={0}
            onClick={() => onAdminInstallFilterChange("in-progress")}
            sx={{
              p: 1.5,
              border: "1px solid var(--stroke)",
              borderRadius: 1.5,
              cursor: "pointer",
              transition: "all 0.15s",
              borderColor: adminInstallFilter === "in-progress" ? "primary.main" : "var(--stroke)",
              background: adminInstallFilter === "in-progress" ? "rgba(45,212,191,0.08)" : undefined,
              "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
            }}
          >
            <Typography variant="caption" color="text.secondary">
              In Progress
            </Typography>
            <Typography variant="h5" fontWeight={700}>
              {inProgressCount}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Click to filter the list
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper
            elevation={0}
            onClick={() => onAdminInstallFilterChange("unassigned")}
            sx={{
              p: 1.5,
              border: "1px solid var(--stroke)",
              borderRadius: 1.5,
              cursor: "pointer",
              transition: "all 0.15s",
              borderColor: adminInstallFilter === "unassigned" ? "warning.main" : "var(--stroke)",
              background: adminInstallFilter === "unassigned" ? "rgba(237,108,2,0.08)" : undefined,
              "&:hover": { borderColor: "warning.main", background: "rgba(237,108,2,0.04)" },
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Unassigned
            </Typography>
            <Typography variant="h5" fontWeight={700}>
              {unassignedCount}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Click to filter the list
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {adminInstallFilter === "all"
            ? "Showing all open install assets"
            : adminInstallFilter === "in-progress"
              ? "Showing in-progress install assets"
              : "Showing unassigned install assets"}
        </Typography>
        {adminInstallFilter !== "all" && (
          <Button size="small" variant="text" onClick={() => onAdminInstallFilterChange("all")} sx={{ minWidth: 0, px: 0.5 }}>
            Clear filter
          </Button>
        )}
      </Stack>

      {filteredAdminInstallAssets.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          No installation assets in this scope.
        </Typography>
      ) : (
        <Grid container spacing={1.5}>
          {filteredAdminInstallAssets.slice(0, 8).map((asset) => (
            <Grid item xs={12} sm={6} md={4} key={asset.id}>
              <Paper
                elevation={0}
                onClick={onNavigateToInstallations}
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
                    {asset.assetTag || asset.assetName || asset.id}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {asset.jobNumber} - {dashboardStatusChip(asset).label}
                  </Typography>
                  <Typography
                    variant="caption"
                    color={projectPmLabel(asset.projectId) === "No PM assigned" ? "warning.main" : "text.secondary"}
                    noWrap
                    display="block"
                  >
                    PM: {projectPmLabel(asset.projectId)}
                  </Typography>
                  <Chip
                    label={asset.assignedUserId ? "Assigned" : "Unassigned"}
                    size="small"
                    color={asset.assignedUserId ? "default" : "warning"}
                    variant="outlined"
                    sx={{ alignSelf: "flex-start", height: 18, fontSize: "0.62rem" }}
                  />
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
      {filteredAdminInstallAssets.length > 8 && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>
          +{filteredAdminInstallAssets.length - 8} more assets -{" "}
          <Box component="span" sx={{ cursor: "pointer", color: "primary.main" }} onClick={onNavigateToInstallations}>
            view all
          </Box>
        </Typography>
      )}

      <Dialog open={adminInstallProjectsOpen} onClose={() => onAdminInstallProjectsOpenChange(false)} fullWidth maxWidth="md">
        <DialogTitle>Install Projects</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Open install projects in the current dashboard scope. Filter by PM name or project number.
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} md={6}>
                <TextField
                  size="small"
                  fullWidth
                  label="Filter by PM"
                  value={adminInstallPmFilter}
                  onChange={(e) => onAdminInstallPmFilterChange(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  size="small"
                  fullWidth
                  label="Filter by Project Number"
                  value={adminInstallProjectFilter}
                  onChange={(e) => onAdminInstallProjectFilterChange(e.target.value)}
                />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={`${filteredAdminInstallProjects.length} open projects`} size="small" color="info" variant="outlined" />
              <Chip label={`${totalInstallAssetCount} total assets`} size="small" variant="outlined" />
              {(adminInstallPmFilter || adminInstallProjectFilter) && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    onAdminInstallPmFilterChange("");
                    onAdminInstallProjectFilterChange("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
            {filteredAdminInstallProjects.length === 0 ? (
              <Typography variant="caption" color="text.disabled">
                No install projects match the current filters.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {filteredAdminInstallProjects.map((project) => {
                  const projectAssets = installScopeAssets.filter((asset) => asset.projectId === project.id);
                  return (
                    <Paper
                      key={project.id}
                      elevation={0}
                      onClick={() => {
                        onAdminInstallProjectsOpenChange(false);
                        onNavigateToProject(project.id);
                      }}
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
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {project.jobNumber}
                          </Typography>
                          <Chip label={project.status} size="small" variant="outlined" sx={{ height: 20, fontSize: "0.68rem" }} />
                          <Chip
                            label={`${projectAssets.length} open assets`}
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.68rem" }}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {project.customerName || "No customer"}
                        </Typography>
                        <Typography
                          variant="caption"
                          color={project.projectManager?.trim() ? "text.secondary" : "warning.main"}
                          noWrap
                          display="block"
                        >
                          PM: {project.projectManager?.trim() || "No PM assigned"}
                        </Typography>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
