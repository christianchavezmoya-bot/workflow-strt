import { AssignmentLateOutlined } from "@mui/icons-material";
import { Box, Chip, Stack, Typography } from "@mui/material";

type PendingProject = {
  id: string;
  jobNumber?: string | null;
};

type Props = {
  projects: PendingProject[];
  onNavigateToProject: (projectId: string) => void;
  emphasized?: boolean;
};

export default function DashboardPendingApprovalsSection({
  projects,
  onNavigateToProject,
  emphasized = false,
}: Props) {
  if (projects.length === 0) return null;

  return (
    <Box
      className="glass-card"
      sx={{
        p: 2,
        ...(emphasized
          ? { border: "1px solid", borderColor: "warning.dark", background: "rgba(230,119,0,0.07)" }
          : {}),
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: emphasized ? 1 : 0.5 }}>
        <AssignmentLateOutlined sx={{ fontSize: 18, color: "warning.main" }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
          Pending Approvals
        </Typography>
        <Chip
          label={projects.length}
          size="small"
          color="warning"
          variant="outlined"
          sx={{ height: 20, fontSize: "0.7rem" }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Projects waiting for your approval
      </Typography>
      <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }} flexWrap="nowrap">
        {projects.map((project) => (
          <Chip
            key={project.id}
            label={project.jobNumber || project.id}
            onClick={() => onNavigateToProject(project.id)}
            color="warning"
            variant="outlined"
            sx={{ flexShrink: 0, cursor: "pointer" }}
          />
        ))}
      </Stack>
    </Box>
  );
}
