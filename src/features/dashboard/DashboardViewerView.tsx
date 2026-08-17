import { TrendingUpOutlined, CheckCircleOutlineOutlined } from "@mui/icons-material";
import { Box, Chip, Divider, Grid, Stack, Typography } from "@mui/material";
import { projectStatusChipColor } from "./dashboardPageLogic";

type Props = {
  statusGroups: [string, number][];
  projectCount: number;
  needsAttentionSection: React.ReactNode;
  regionalSnapshotSection: React.ReactNode;
};

export default function DashboardViewerView({
  statusGroups,
  projectCount,
  needsAttentionSection,
  regionalSnapshotSection,
}: Props) {
  return (
    <>
      {needsAttentionSection}
      {regionalSnapshotSection}
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Box className="glass-card" sx={{ p: 2.5, height: "100%" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <TrendingUpOutlined sx={{ fontSize: 18, color: "primary.main" }} />
              <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem" }}>
                Project Status
              </Typography>
            </Stack>
            <Stack spacing={1.25}>
              {statusGroups.map(([status, count]) => (
                <Stack key={status} direction="row" alignItems="center" spacing={1.5}>
                  <Chip
                    label={status}
                    size="small"
                    color={projectStatusChipColor(status)}
                    variant="outlined"
                    sx={{ fontSize: "0.68rem", height: 20, minWidth: 100 }}
                  />
                  <Box sx={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <Box
                      sx={{
                        height: "100%",
                        borderRadius: 3,
                        width: `${Math.round((count / projectCount) * 100)}%`,
                        background:
                          status === "Completed"
                            ? "#2e7d32"
                            : status === "In Progress"
                              ? "#1976d2"
                              : status === "Pending Approval"
                                ? "#ed6c02"
                                : status === "Cancelled"
                                  ? "#d32f2f"
                                  : "#555",
                      }}
                    />
                  </Box>
                  <Typography variant="caption" fontWeight={700} sx={{ minWidth: 24, textAlign: "right" }}>
                    {count}
                  </Typography>
                </Stack>
              ))}
              {statusGroups.length === 0 && (
                <Typography variant="caption" color="text.disabled">
                  No projects loaded.
                </Typography>
              )}
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={1}>
              <CheckCircleOutlineOutlined sx={{ fontSize: 14, color: "success.main", mt: 0.25 }} />
              <Typography variant="caption" color="text.secondary">
                Dashboard totals include active, open, in-progress, pending, and overdue projects only.
              </Typography>
            </Stack>
          </Box>
        </Grid>
      </Grid>
    </>
  );
}
