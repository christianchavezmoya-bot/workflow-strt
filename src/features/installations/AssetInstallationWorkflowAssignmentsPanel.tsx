import {
  AssignmentOutlined,
  DeleteOutline,
  HistoryOutlined,
  PlayArrowOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { WorkflowAssignment } from "../../types/workflowType";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import type { BomActualItem } from "../../types/workflow";

function formatRunDur(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type Props = {
  asset: ProjectAsset;
  assignments: WorkflowAssignment[];
  runs: AssetWorkflowRun[];
  runLoading: boolean;
  canModifyData: boolean;
  expandedBomAsgnId: string | null;
  onOpenInspections: (asset: ProjectAsset) => void;
  onOpenAssignDialog: (asset: ProjectAsset) => void;
  onToggleBomExpanded: (assignmentId: string | null) => void;
  onOpenRunHistory: (asset: ProjectAsset, workflowConfigId: string, workflowConfigName?: string) => void;
  onStartAssignment: (asset: ProjectAsset, assignment: WorkflowAssignment) => void;
  onAssignmentContextMenu: (
    anchor: HTMLElement,
    asset: ProjectAsset,
    assignment: WorkflowAssignment,
  ) => void;
  onRemoveAssignment: (assetId: string, assignmentId: string) => void;
};

export default function AssetInstallationWorkflowAssignmentsPanel({
  asset,
  assignments,
  runs,
  runLoading,
  canModifyData,
  expandedBomAsgnId,
  onOpenInspections,
  onOpenAssignDialog,
  onToggleBomExpanded,
  onOpenRunHistory,
  onStartAssignment,
  onAssignmentContextMenu,
  onRemoveAssignment,
}: Props) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
        <Typography
          variant="caption"
          fontWeight={700}
          color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Workflow Assignments {assignments.length > 0 && `(${assignments.length})`}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            sx={{ fontSize: 11, py: 0.25 }}
            onClick={() => onOpenInspections(asset)}
          >
            Inspections
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="primary"
            startIcon={<AssignmentOutlined fontSize="small" />}
            sx={{ fontSize: 11, py: 0.25 }}
            onClick={() => onOpenAssignDialog(asset)}
          >
            Assign workflow
          </Button>
        </Stack>
      </Stack>
      {assignments.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          No workflow assignments. Click &quot;Assign workflow&quot; to add one.
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          {assignments.map((asgn) => {
            const configRuns = runs.filter((r) => r.workflowConfigId === asgn.workflowConfigId);
            const latestRun = configRuns.sort(
              (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
            )[0];
            const totalProductive = configRuns.reduce((s, r) => s + (r.productiveSeconds ?? 0), 0);
            const totalDowntime = configRuns.reduce((s, r) => s + (r.downtimeSeconds ?? 0), 0);
            const bomKey = `${asgn.id}`;

            return (
              <Stack
                key={asgn.id}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{
                  p: 0.75,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "rgba(255,255,255,0.02)",
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" fontWeight={600}>
                    {asgn.workflowTypeName || "Workflow"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" noWrap>
                    {asgn.workflowConfigName || asgn.workflowConfigId}
                  </Typography>
                  {configRuns.length > 0 && (
                    <Stack direction="row" spacing={0.5} mt={0.25} useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        label={`Productive ${formatRunDur(totalProductive)}`}
                        color="success"
                        variant="outlined"
                        sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.5 } }}
                      />
                      {totalDowntime > 0 && (
                        <Chip
                          size="small"
                          label={`Downtime ${formatRunDur(totalDowntime)}`}
                          color="warning"
                          variant="outlined"
                          sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.5 } }}
                        />
                      )}
                      {configRuns.length > 1 && (
                        <Chip
                          size="small"
                          label={`${configRuns.length} runs`}
                          variant="outlined"
                          sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.5 } }}
                        />
                      )}
                      {(() => {
                        const allBom: BomActualItem[] = [];
                        for (const r of configRuns) {
                          if (!r.bomActualJson) continue;
                          try {
                            allBom.push(...JSON.parse(r.bomActualJson));
                          } catch {
                            /* ignore */
                          }
                        }
                        if (allBom.length === 0) return null;
                        const invCount = allBom.filter((b) => b.isInventory).reduce((s, b) => s + b.actualQty, 0);
                        const isBomOpen = expandedBomAsgnId === bomKey;
                        return (
                          <Chip
                            size="small"
                            label={`${allBom.length} part${allBom.length !== 1 ? "s" : ""}${invCount > 0 ? ` | ${invCount} inventory` : ""}`}
                            color="info"
                            variant="outlined"
                            clickable
                            sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.5 } }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleBomExpanded(isBomOpen ? null : bomKey);
                            }}
                          />
                        );
                      })()}
                    </Stack>
                  )}
                  {expandedBomAsgnId === asgn.id &&
                    (() => {
                      const allBom: BomActualItem[] = [];
                      for (const r of configRuns) {
                        if (!r.bomActualJson) continue;
                        try {
                          allBom.push(...JSON.parse(r.bomActualJson));
                        } catch {
                          /* ignore */
                        }
                      }
                      return allBom.length === 0 ? null : (
                        <Stack
                          spacing={0.5}
                          sx={{ mt: 0.5, pl: 0.5, borderLeft: "2px solid", borderColor: "info.main" }}
                        >
                          {allBom.map((item, idx) => (
                            <Box key={idx}>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <Typography variant="caption" fontWeight={600}>
                                  {item.description}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  x {item.actualQty} {item.unitOfMeasure}
                                </Typography>
                              </Stack>
                              {item.isInventory &&
                                (item.unitCaptures ?? []).map((fields, i) => (
                                  <Typography
                                    key={i}
                                    variant="caption"
                                    color="text.secondary"
                                    display="block"
                                    sx={{ pl: 1 }}
                                  >
                                    u{i + 1}:{" "}
                                    {Object.entries(fields)
                                      .filter(([, v]) => v)
                                      .map(([k, v]) => `${k}: ${v}`)
                                      .join(" | ") || "-"}
                                  </Typography>
                                ))}
                            </Box>
                          ))}
                        </Stack>
                      );
                    })()}
                </Box>
                {latestRun && (
                  <Chip
                    size="small"
                    label={latestRun.status}
                    color={
                      latestRun.status === "Complete"
                        ? "success"
                        : latestRun.status === "Issue"
                          ? "error"
                          : "primary"
                    }
                    variant={latestRun.isLocked ? "filled" : "outlined"}
                    sx={{ fontSize: 10, height: 18 }}
                  />
                )}
                {canModifyData && (
                  <Tooltip
                    title={
                      latestRun?.status === "Complete"
                        ? "View run history, download report, or re-run workflow"
                        : latestRun?.status === "Issue"
                          ? "Open run to review and resolve open issues"
                          : ""
                    }
                  >
                    <Button
                      size="small"
                      variant={latestRun?.status === "InProgress" ? "contained" : "outlined"}
                      color={
                        latestRun?.status === "Issue"
                          ? "error"
                          : latestRun?.status === "Complete"
                            ? "inherit"
                            : "success"
                      }
                      disabled={runLoading}
                      startIcon={
                        runLoading ? (
                          <CircularProgress size={12} />
                        ) : latestRun?.status === "Complete" ? (
                          <HistoryOutlined />
                        ) : (
                          <PlayArrowOutlined />
                        )
                      }
                      onClick={() =>
                        latestRun?.status === "Complete" || latestRun?.status === "Issue"
                          ? onOpenRunHistory(asset, asgn.workflowConfigId, asgn.workflowConfigName)
                          : onStartAssignment(asset, asgn)
                      }
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onAssignmentContextMenu(e.currentTarget, asset, asgn);
                      }}
                      sx={{ fontSize: 11, py: 0.25 }}
                    >
                      {!latestRun
                        ? "Start"
                        : latestRun.status === "InProgress"
                          ? "Continue"
                          : latestRun.status === "Complete"
                            ? "View/Edit"
                            : "Review"}
                    </Button>
                  </Tooltip>
                )}
                {canModifyData && (
                  <Tooltip title="Remove assignment">
                    <IconButton size="small" onClick={() => onRemoveAssignment(asset.id, asgn.id)}>
                      <DeleteOutline sx={{ fontSize: "0.9rem" }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
