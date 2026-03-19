import {
  Card, CardContent, Typography, Stack, Chip, Box,
  Divider, LinearProgress, Tooltip,
} from "@mui/material";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import InventoryOutlinedIcon from "@mui/icons-material/InventoryOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import type { DraftAsset } from "../types/projectDraft";

interface Props {
  asset: DraftAsset;
  selected?: boolean;
  onClick?: () => void;
}

export default function AssetPreviewCard({ asset, selected, onClick }: Props) {
  const componentCount = asset.components.filter((c) => c.itemType === "component").length;
  const consumableCount = asset.components.filter((c) => c.itemType === "consumable").length;
  const shortageCount = asset.components.filter(
    (c) => c.differenceQty !== undefined && c.differenceQty < 0
  ).length;
  const inventoryCount = asset.components.filter((c) => c.inventoryTracked).length;

  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        cursor: onClick ? "pointer" : "default",
        borderColor: selected ? "primary.main" : undefined,
        borderWidth: selected ? 2 : 1,
        transition: "border-color 0.15s",
        "&:hover": onClick ? { borderColor: "primary.light" } : {},
      }}
    >
      <CardContent sx={{ pb: "12px !important" }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1}>
          <DirectionsCarOutlinedIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" fontWeight={600} noWrap flex={1}>
            {asset.assetName}
          </Typography>
          {asset.inventoryStatus === "shortage" && (
            <Tooltip title="Stock shortage detected">
              <WarningAmberOutlinedIcon fontSize="small" color="warning" />
            </Tooltip>
          )}
        </Stack>

        {asset.assetType && (
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            {asset.assetType} {asset.configType ? `· ${asset.configType}` : ""}
          </Typography>
        )}

        <Stack direction="row" spacing={0.5} flexWrap="wrap" mb={1}>
          {asset.workflowTemplateCandidate && (
            <Chip
              icon={<AccountTreeOutlinedIcon />}
              label={asset.workflowTemplateCandidate}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>

        <Divider sx={{ my: 1 }} />

        <Stack direction="row" spacing={2}>
          <Box textAlign="center">
            <Typography variant="h6" fontWeight={700} lineHeight={1}>{componentCount}</Typography>
            <Typography variant="caption" color="text.secondary">Parts</Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="h6" fontWeight={700} lineHeight={1}>{consumableCount}</Typography>
            <Typography variant="caption" color="text.secondary">Consumables</Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="h6" fontWeight={700} lineHeight={1}>{asset.features.length}</Typography>
            <Typography variant="caption" color="text.secondary">Features</Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="h6" fontWeight={700} lineHeight={1} color={shortageCount > 0 ? "warning.main" : "inherit"}>
              {shortageCount}
            </Typography>
            <Typography variant="caption" color="text.secondary">Shortages</Typography>
          </Box>
        </Stack>

        {inventoryCount > 0 && (
          <Box mt={1}>
            <Stack direction="row" alignItems="center" spacing={0.5} mb={0.25}>
              <InventoryOutlinedIcon fontSize="small" color="action" />
              <Typography variant="caption" color="text.secondary">
                {inventoryCount} inventory-tracked items
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={shortageCount === 0 ? 100 : Math.max(0, ((inventoryCount - shortageCount) / inventoryCount) * 100)}
              color={shortageCount > 0 ? "warning" : "success"}
              sx={{ height: 4, borderRadius: 2 }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
