import { WorkOutlineOutlined } from "@mui/icons-material";
import { ErrorOutlineOutlined, PhotoCameraOutlined } from "@mui/icons-material";
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
import {
  formatMyJobsStepCompletionLabel,
  type MyJobsCardAction,
} from "./dashboardPageLogic";

type Props = {
  assets: DashboardWorkspaceAssetItem[];
  workspaceLoading: boolean;
  runnerLoadingAssetId: string | null;
  getCardAction: (asset: DashboardWorkspaceAssetItem) => MyJobsCardAction;
  onAssetTap: (asset: DashboardWorkspaceAssetItem, cardAction?: MyJobsCardAction) => void;
  onViewAll: () => void;
};

export default function DashboardMyInspectionJobsToday({
  assets,
  workspaceLoading,
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
      {assets.length === 0 && !workspaceLoading ? (
        <Typography variant="caption" color="text.disabled">
          No inspection jobs assigned to you.
        </Typography>
      ) : (
        <>
          <Grid container spacing={1.5}>
            {assets.slice(0, 6).map((a) => {
              const cardAction = getCardAction(a);
              return (
                <Grid item xs={12} sm={6} md={4} key={a.id}>
                  <Paper
                    elevation={0}
                    onClick={() => {
                      void onAssetTap(a, cardAction);
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
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
                            <Typography variant="caption" fontWeight={600} noWrap display="block">
                              {a.assetTag || a.assetName}
                            </Typography>
                            {a.totalSteps > 0 && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                sx={{ fontSize: "0.62rem", flexShrink: 0 }}
                              >
                                {formatMyJobsStepCompletionLabel(a.completedSteps, a.totalSteps)}
                              </Typography>
                            )}
                          </Stack>
                          <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                            {a.jobNumber}
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
                          {cardAction.widgets.map((w, wi) => (
                            <Chip
                              key={`${w.kind}-${wi}`}
                              size="small"
                              variant="outlined"
                              color={w.color}
                              icon={
                                w.kind === "missing-photo" ? (
                                  <PhotoCameraOutlined sx={{ fontSize: 12 }} />
                                ) : (
                                  <ErrorOutlineOutlined sx={{ fontSize: 12 }} />
                                )
                              }
                              label={w.kind === "missing-photo" ? (w.count > 0 ? String(w.count) : "\u2013") : "Issue"}
                              sx={{ height: 16, fontSize: "0.55rem", "& .MuiChip-icon": { fontSize: 12, ml: 0.25 } }}
                            />
                          ))}
                        </Stack>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        color={cardAction.buttonColor}
                        startIcon={
                          runnerLoadingAssetId === a.id ? <CircularProgress size={12} color="inherit" /> : undefined
                        }
                        disabled={runnerLoadingAssetId === a.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onAssetTap(a, cardAction);
                        }}
                        sx={{ alignSelf: "flex-start", height: 22, fontSize: "0.68rem", py: 0 }}
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
