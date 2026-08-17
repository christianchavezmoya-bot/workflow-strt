import { ErrorOutlineOutlined, PhotoCameraOutlined, WorkOutlineOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";
import { formatMyJobsStepCompletionLabel, type MyJobsCardAction } from "./dashboardPageLogic";

type Props = {
  assets: DashboardWorkspaceAssetItem[];
  isNativePlatform: boolean;
  runnerLoadingAssetId: string | null;
  getCardAction: (asset: DashboardWorkspaceAssetItem) => MyJobsCardAction;
  onAssetTap: (asset: DashboardWorkspaceAssetItem, cardAction?: MyJobsCardAction) => void;
  onViewAll: () => void;
};

export default function DashboardMyInstallJobsTodaySection({
  assets,
  isNativePlatform,
  runnerLoadingAssetId,
  getCardAction,
  onAssetTap,
  onViewAll,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <WorkOutlineOutlined sx={{ color: "primary.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
          My Jobs Today
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Sorted by activity {"\u2014"} tap to open quick actions
      </Typography>
      {assets.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          No field jobs assigned to you.
        </Typography>
      ) : (
        <>
          <Grid container spacing={1.5}>
            {assets.slice(0, 6).map((asset) => {
              const cardAction = getCardAction(asset);
              return (
                <Grid item xs={12} sm={6} md={4} key={asset.id}>
                  <Paper
                    elevation={0}
                    onClick={() => { void onAssetTap(asset, cardAction); }}
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
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
                            <Typography variant="caption" fontWeight={600} noWrap display="block">
                              {asset.assetTag || asset.assetName}
                            </Typography>
                            {asset.totalSteps > 0 && (
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.62rem", flexShrink: 0 }}>
                                {formatMyJobsStepCompletionLabel(asset.completedSteps, asset.totalSteps)}
                              </Typography>
                            )}
                          </Stack>
                          <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                            {asset.jobNumber}
                          </Typography>
                        </Box>
                        <Chip
                          label={cardAction.chipLabel}
                          size="small"
                          color={cardAction.chipColor}
                          variant="outlined"
                          sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }}
                        />
                      </Stack>
                      {cardAction.widgets.length > 0 && (
                        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                          {cardAction.widgets.map((widget, index) => (
                            <Chip
                              key={`${widget.kind}-${index}`}
                              size="small"
                              variant="outlined"
                              color={widget.color}
                              icon={
                                widget.kind === "missing-photo" ? (
                                  <PhotoCameraOutlined sx={{ fontSize: 12 }} />
                                ) : (
                                  <ErrorOutlineOutlined sx={{ fontSize: 12 }} />
                                )
                              }
                              label={widget.kind === "missing-photo" ? (widget.count > 0 ? String(widget.count) : "\u2013") : "Issue"}
                              sx={{ height: 16, fontSize: "0.55rem", "& .MuiChip-icon": { fontSize: 12, ml: 0.25 } }}
                            />
                          ))}
                        </Stack>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        color={cardAction.buttonColor}
                        startIcon={runnerLoadingAssetId === asset.id ? <CircularProgress size={12} color="inherit" /> : undefined}
                        disabled={runnerLoadingAssetId === asset.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onAssetTap(asset, cardAction);
                        }}
                        sx={{
                          alignSelf: "flex-start",
                          height: 22,
                          fontSize: "0.68rem",
                          py: 0,
                          maxWidth: isNativePlatform ? "100%" : undefined,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {cardAction.buttonLabel}
                      </Button>
                    </Stack>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
          {assets.length > 6 && (
            <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>
              +{assets.length - 6} more {"\u2014"}{" "}
              <Box component="span" sx={{ cursor: "pointer", color: "primary.main" }} onClick={onViewAll}>
                view all
              </Box>
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
