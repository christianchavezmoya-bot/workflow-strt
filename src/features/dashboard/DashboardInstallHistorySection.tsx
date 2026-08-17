import { CheckCircleOutlineOutlined, PrintOutlined } from "@mui/icons-material";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";
import DashboardInstallHistoryCard from "./DashboardInstallHistoryCard";

type Props = {
  title?: string;
  description?: string;
  assets: DashboardWorkspaceAssetItem[];
  loadingAssetId?: string | null;
  isNativePlatform: boolean;
  showPrint?: boolean;
  onOpenHistory: (asset: DashboardWorkspaceAssetItem) => void;
};

export default function DashboardInstallHistorySection({
  title = "Install History",
  description,
  assets,
  loadingAssetId,
  isNativePlatform,
  showPrint = true,
  onOpenHistory,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: description ? 0.5 : 1 }}>
        <CheckCircleOutlineOutlined sx={{ fontSize: 18, color: assets.length > 0 ? "success.main" : "text.disabled" }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
          {title}
        </Typography>
        {assets.length > 0 && showPrint && !isNativePlatform && (
          <Button size="small" variant="outlined" startIcon={<PrintOutlined fontSize="small" />} onClick={() => window.print()}>
            Print All
          </Button>
        )}
        <Chip
          label={assets.length}
          size="small"
          color={assets.length > 0 ? "success" : "default"}
          variant="outlined"
          sx={{ height: 20, fontSize: "0.7rem" }}
        />
      </Stack>
      {description && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          {description}
        </Typography>
      )}
      {assets.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No install history yet
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {assets.slice(0, 6).map((asset) => (
            <DashboardInstallHistoryCard
              key={asset.id}
              asset={asset}
              loading={loadingAssetId === asset.id}
              onClick={() => onOpenHistory(asset)}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
