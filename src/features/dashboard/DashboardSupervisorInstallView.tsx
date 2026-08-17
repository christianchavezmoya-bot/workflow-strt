import { AssignmentLateOutlined, WarningAmberOutlined } from "@mui/icons-material";
import { Box, Chip, Grid, Stack, Typography } from "@mui/material";
import type { OpenAssetItem } from "../../services/projectAssetService";
import DashboardAttentionItemRow from "./DashboardAttentionItemRow";
import DashboardInstallHistorySection from "./DashboardInstallHistorySection";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";

type Props = {
  needsAttentionSection: React.ReactNode;
  workloadPanel: React.ReactNode;
  unassignedAssets: OpenAssetItem[];
  notStartedAssets: OpenAssetItem[];
  installHistory: DashboardWorkspaceAssetItem[];
  historyLoadingAssetId: string | null;
  isNativePlatform: boolean;
  onNavigateToAssets: () => void;
  onOpenHistory: (asset: DashboardWorkspaceAssetItem) => void;
};

export default function DashboardSupervisorInstallView({
  needsAttentionSection,
  workloadPanel,
  unassignedAssets,
  notStartedAssets,
  installHistory,
  historyLoadingAssetId,
  isNativePlatform,
  onNavigateToAssets,
  onOpenHistory,
}: Props) {
  return (
    <>
      {needsAttentionSection}
      {workloadPanel}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <WarningAmberOutlined sx={{ fontSize: 18, color: unassignedAssets.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                Unassigned Assets
              </Typography>
              <Chip
                label={unassignedAssets.length}
                size="small"
                color={unassignedAssets.length > 0 ? "warning" : "default"}
                variant="outlined"
                sx={{ height: 20, fontSize: "0.7rem" }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Active jobs with no technician assigned
            </Typography>
            {unassignedAssets.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                All assets are assigned
              </Typography>
            ) : (
              <Stack spacing={0.25}>
                {unassignedAssets.slice(0, 5).map((asset) => (
                  <DashboardAttentionItemRow
                    key={asset.id}
                    label={asset.assetTag || asset.assetName || asset.id}
                    sub={asset.jobNumber}
                    onClick={onNavigateToAssets}
                  />
                ))}
                {unassignedAssets.length > 5 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{unassignedAssets.length - 5} more
                  </Typography>
                )}
              </Stack>
            )}
          </Box>
        </Grid>
        <Grid item xs={12} md={6}>
          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <AssignmentLateOutlined sx={{ fontSize: 18, color: notStartedAssets.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                Not Started
              </Typography>
              <Chip
                label={notStartedAssets.length}
                size="small"
                color={notStartedAssets.length > 0 ? "warning" : "default"}
                variant="outlined"
                sx={{ height: 20, fontSize: "0.7rem" }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Assigned but not yet begun
            </Typography>
            {notStartedAssets.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                All assigned assets are in progress
              </Typography>
            ) : (
              <Stack spacing={0.25}>
                {notStartedAssets.slice(0, 5).map((asset) => (
                  <DashboardAttentionItemRow
                    key={asset.id}
                    label={asset.assetTag || asset.assetName || asset.id}
                    sub={[asset.jobNumber, asset.assignedUserId ? `Assigned: ${asset.assignedUserId}` : undefined]
                      .filter(Boolean)
                      .join(" - ")}
                    onClick={onNavigateToAssets}
                  />
                ))}
                {notStartedAssets.length > 5 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{notStartedAssets.length - 5} more
                  </Typography>
                )}
              </Stack>
            )}
          </Box>
        </Grid>
      </Grid>
      <DashboardInstallHistorySection
        assets={installHistory}
        loadingAssetId={historyLoadingAssetId}
        isNativePlatform={isNativePlatform}
        onOpenHistory={onOpenHistory}
      />
    </>
  );
}
