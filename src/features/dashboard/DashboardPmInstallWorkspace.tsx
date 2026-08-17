import { WorkOutlineOutlined } from "@mui/icons-material";
import { Box, Button, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";
import { dashboardStatusChip } from "./dashboardPageLogic";
import DashboardInstallHistorySection from "./DashboardInstallHistorySection";

type Props = {
  myInstallAssets: DashboardWorkspaceAssetItem[];
  myInstallHistory: DashboardWorkspaceAssetItem[];
  historyLoadingAssetId: string | null;
  isNativePlatform: boolean;
  onNavigateToAssets: () => void;
  onOpenHistory: (asset: DashboardWorkspaceAssetItem) => void;
};

export default function DashboardPmInstallWorkspace({
  myInstallAssets,
  myInstallHistory,
  historyLoadingAssetId,
  isNativePlatform,
  onNavigateToAssets,
  onOpenHistory,
}: Props) {
  return (
    <Stack spacing={2}>
      <Box className="glass-card" sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <WorkOutlineOutlined sx={{ color: "primary.main", fontSize: 20 }} />
          <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
            My Installs
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Installation assets currently assigned to you for field execution.
        </Typography>
        {myInstallAssets.length === 0 ? (
          <Typography variant="caption" color="text.disabled">
            No installation assets currently assigned to you for field execution.
          </Typography>
        ) : (
          <>
            <Grid container spacing={1.5}>
              {myInstallAssets.slice(0, 6).map((asset) => (
                <Grid item xs={12} sm={6} md={4} key={asset.id}>
                  <Paper
                    elevation={0}
                    onClick={onNavigateToAssets}
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
                      <Typography variant="caption" fontWeight={600} noWrap display="block">
                        {asset.assetTag || asset.assetName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                        {asset.jobNumber}
                      </Typography>
                      <Chip
                        label={dashboardStatusChip(asset).label}
                        size="small"
                        variant="outlined"
                        color={dashboardStatusChip(asset).color}
                        sx={{ alignSelf: "flex-start", height: 16, fontSize: "0.58rem" }}
                      />
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            {myInstallAssets.length > 6 && (
              <Button size="small" variant="text" sx={{ mt: 1 }} onClick={onNavigateToAssets}>
                View all {myInstallAssets.length} assets
              </Button>
            )}
          </>
        )}
      </Box>
      <DashboardInstallHistorySection
        assets={myInstallHistory}
        loadingAssetId={historyLoadingAssetId}
        isNativePlatform={isNativePlatform}
        onOpenHistory={onOpenHistory}
      />
    </Stack>
  );
}
