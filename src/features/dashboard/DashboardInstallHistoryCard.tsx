import { Box, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";
import { fmtDate, historyChipColor } from "./dashboardPageLogic";

type Props = {
  asset: DashboardWorkspaceAssetItem;
  loading?: boolean;
  onClick: () => void;
};

export default function DashboardInstallHistoryCard({ asset, loading, onClick }: Props) {
  return (
    <Paper
      elevation={0}
      onClick={onClick}
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
            {asset.completedAt
              ? `Completed ${fmtDate(asset.completedAt)}`
              : `Updated ${fmtDate(asset.latestActivityAt)}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center">
          {loading && <CircularProgress size={12} />}
          <Chip
            label={asset.historyStatus}
            size="small"
            color={historyChipColor(asset.historyStatus)}
            variant="outlined"
            sx={{ height: 18, fontSize: "0.62rem" }}
          />
        </Stack>
      </Stack>
    </Paper>
  );
}
