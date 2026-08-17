import { CheckCircleOutlineOutlined } from "@mui/icons-material";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";
import { fmtDate, historyChipColor } from "./dashboardPageLogic";

type Props = {
  history: DashboardWorkspaceAssetItem[];
  onNavigateToInspectionAssets: () => void;
};

export default function DashboardMyInspectionJobHistory({ history, onNavigateToInspectionAssets }: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <CheckCircleOutlineOutlined sx={{ fontSize: 18, color: history.length > 0 ? "success.main" : "text.disabled" }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
          Job History
        </Typography>
        <Chip
          label={history.length}
          size="small"
          color={history.length > 0 ? "success" : "default"}
          variant="outlined"
          sx={{ height: 20, fontSize: "0.7rem" }}
        />
      </Stack>
      {history.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No inspection history yet
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {history.slice(0, 5).map((asset) => (
            <Paper
              key={asset.id}
              elevation={0}
              onClick={onNavigateToInspectionAssets}
              sx={{
                p: 1.25,
                border: "1px solid var(--stroke)",
                borderRadius: 1.5,
                cursor: "pointer",
                "&:hover": { borderColor: "success.main", background: "rgba(45,212,191,0.04)" },
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" fontWeight={600} noWrap display="block">
                    {asset.assetTag || asset.assetName || asset.id}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                    {asset.jobNumber}
                    {" · "}
                    {asset.historyStatus === "Closed"
                      ? `Closed ${fmtDate(asset.latestActivityAt ?? asset.completedAt)}`
                      : asset.completedAt
                        ? `Field work complete ${fmtDate(asset.completedAt)}`
                        : `Updated ${fmtDate(asset.latestActivityAt)}`}
                  </Typography>
                </Box>
                <Chip
                  label={asset.historyStatus}
                  size="small"
                  color={historyChipColor(asset.historyStatus)}
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.62rem" }}
                />
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
