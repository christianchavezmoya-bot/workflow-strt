import {
  ExpandLessOutlined,
  ExpandMoreOutlined,
  PhotoCameraOutlined,
  ReportProblemOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { AssetIssue, ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { Project } from "../../types/project";
import type { User } from "../../types/user";
import type { WorkflowDisplayState } from "../../utils/workflowDisplayState";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "../../utils/workflowCompleteness";
import { STATUS_LABELS } from "./assetStatusDisplay";

export type MobileCardPrimaryAction =
  | {
      label: string;
      tooltip: string;
      color: "success" | "warning" | "error" | "info" | "inherit";
      icon: React.ReactElement;
      onClick: () => void;
      variant?: "contained" | "outlined" | "text";
    }
  | null;

export type AssetInstallationMobileCardStackProps = {
  assets: ProjectAsset[];
  projectMap: Map<string, Project>;
  userMap: Map<string, User>;
  runsMap: Record<string, AssetWorkflowRun[]>;
  pausedProgress: Record<string, { done: number; total: number }>;
  expandedAssetId: string | null;
  onExpandToggle: (assetId: string, expanding: boolean) => void;
  computeAssetHealth: (asset: ProjectAsset, runs?: AssetWorkflowRun[]) => "green" | "amber" | "red" | null;
  resolveAssetDisplayState: (asset: ProjectAsset, projectWorkflowMode?: string | null) => WorkflowDisplayState;
  getPrimaryAction: (asset: ProjectAsset, projectWorkflowMode?: string | null) => MobileCardPrimaryAction;
  issuesBadge: (asset: ProjectAsset) => ReactNode;
  onOpenStatusMenu: (anchor: HTMLElement, asset: ProjectAsset) => void;
  renderFeatureExpandedRow: (asset: ProjectAsset) => ReactNode;
  renderIssuesPanel: (asset: ProjectAsset) => ReactNode;
  renderTimeTrackingPanel: (asset: ProjectAsset) => ReactNode | null;
  renderWorkflowAssignmentsPanel: (asset: ProjectAsset) => ReactNode;
};

export function AssetInstallationMobileCardSkeleton() {
  return (
    <Stack spacing={0.75}>
      {[0, 1, 2, 3].map((i) => (
        <Paper key={i} className="glass-card" sx={{ overflow: "hidden", borderLeft: "3px solid transparent" }}>
          <Stack direction="row" alignItems="center" sx={{ px: 1.25, py: 1.25 }} spacing={1}>
            <Skeleton variant="circular" width={24} height={24} sx={{ flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton variant="text" width="55%" height={16} sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="80%" height={12} />
            </Box>
            <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
              <Skeleton variant="rounded" width={60} height={20} />
            </Stack>
            <Skeleton variant="rounded" width={72} height={28} sx={{ flexShrink: 0 }} />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

export default function AssetInstallationMobileCardStack({
  assets,
  projectMap,
  userMap,
  runsMap,
  pausedProgress,
  expandedAssetId,
  onExpandToggle,
  computeAssetHealth,
  resolveAssetDisplayState,
  getPrimaryAction,
  issuesBadge,
  onOpenStatusMenu,
  renderFeatureExpandedRow,
  renderIssuesPanel,
  renderTimeTrackingPanel,
  renderWorkflowAssignmentsPanel,
}: AssetInstallationMobileCardStackProps) {
  return (
    <Stack spacing={0.75}>
      {assets.map((asset) => {
        const proj = projectMap.get(asset.projectId);
        const tech = asset.assignedUserId ? userMap.get(asset.assignedUserId) : null;
        const isExpanded = expandedAssetId === asset.id;
        const runs = runsMap[asset.id] ?? [];
        const healthColor = computeAssetHealth(asset, runs);
        const cardDisplayState = resolveAssetDisplayState(asset, proj?.workflowMode);
        const cardWidgets = cardDisplayState.feature.widgets;

        const latestLocked = runs.find((r) => r.isLocked);
        const awaitingCustomerSig =
          asset.status === "Complete" &&
          !!latestLocked &&
          !latestLocked.customerSignedAt &&
          latestLocked.signatureStatus !== "WaivedCustomer";

        const smartChipColor: "default" | "primary" | "success" | "error" | "warning" | "info" =
          asset.status === "Cancelled"
            ? cardDisplayState.status.color
            : healthColor === "red"
              ? "error"
              : healthColor === "amber"
                ? "warning"
                : healthColor === "green"
                  ? "success"
                  : cardDisplayState.status.color;
        const smartChipLabel = cardDisplayState.status.label;

        const latestRun = [...runs].sort(
          (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )[0];
        const paused = Boolean(pausedProgress[asset.id]);
        const hasWorkflow =
          asset.workflowSummary?.hasWorkflow || !!asset.productConfigId || !!asset.workflowTemplateId;
        let subLabel: string | null = null;
        let subColor: "warning" | "success" | "error" | "primary" | "default" = "default";
        if (hasWorkflow || latestRun) {
          if (paused || latestRun?.status === "Paused" || asset.workflowSummary?.evidenceStatus === "Paused") {
            subLabel = "Paused";
            subColor = "warning";
          } else if (
            asset.workflowSummary?.evidenceStatus === "MissingData" ||
            (latestRun && runHasCompletedAllSteps(latestRun) && countMissingWorkflowItems(latestRun) > 0)
          ) {
            subLabel = "Missing";
            subColor = "error";
          } else if (
            !awaitingCustomerSig &&
            (asset.workflowSummary?.evidenceStatus === "Running" || (latestRun && !latestRun.isLocked))
          ) {
            subLabel = "Running";
            subColor = "primary";
          }
        }

        const smartDesc = (() => {
          let issues: AssetIssue[] = [];
          try {
            issues = JSON.parse(asset.issuesJson || "[]");
          } catch {
            /* ignore */
          }
          const open = issues.filter((i) => !i.resolved);
          const blockingCount = open.filter((i) => i.isBlocking).length;
          const issueNote =
            blockingCount > 0
              ? `${blockingCount} blocking issue${blockingCount > 1 ? "s" : ""}`
              : open.some((i) => i.severity === "high")
                ? "high severity issue"
                : open.length > 0
                  ? `${open.length} open issue${open.length > 1 ? "s" : ""}`
                  : null;
          const st = asset.status as ProjectAssetStatus;
          let cond = "";
          if (st === "Complete") {
            if (awaitingCustomerSig) cond = "complete · awaiting customer sign-off";
            else if (subLabel === "Missing") cond = "complete · missing data";
            else cond = issueNote ? `complete · ${issueNote}` : "complete";
          } else if (st === "Closed") {
            cond = issueNote ? `closed · ${issueNote}` : "closed";
          } else if (st === "InProgress") {
            const base = subLabel === "Paused" ? "paused" : "in progress · running";
            cond = issueNote ? `${base} · ${issueNote}` : base;
          } else if (st === "NotStarted") {
            cond = !hasWorkflow && !latestRun ? "no workflow" : issueNote ? `not started · ${issueNote}` : "not started";
          } else if (st === "Issue") {
            cond = issueNote ? `issue · ${issueNote}` : "issue";
          } else if (st === "Paused") {
            cond = issueNote ? `paused · ${issueNote}` : "paused";
          } else if (st === "Pending") {
            cond = issueNote ? `pending · ${issueNote}` : "pending";
          } else {
            cond = (STATUS_LABELS[st as ProjectAssetStatus] ?? (st as string)).toLowerCase();
          }
          const prefix = tech?.fullName ? `${tech.fullName} · ` : "";
          return `${prefix}${cond}`;
        })();

        const borderLeftColor =
          healthColor === "red"
            ? "error.main"
            : healthColor === "amber"
              ? "warning.main"
              : subColor === "error"
                ? "error.main"
                : awaitingCustomerSig
                  ? "info.main"
                  : "transparent";

        const primaryAction = getPrimaryAction(asset, proj?.workflowMode);
        const quickAction = primaryAction ? (
          <Tooltip title={primaryAction.tooltip}>
            <Button
              size="small"
              variant={primaryAction.variant === "text" ? "outlined" : primaryAction.variant ?? "outlined"}
              color={primaryAction.color === "inherit" ? "inherit" : primaryAction.color}
              startIcon={primaryAction.icon}
              onClick={(e) => {
                e.stopPropagation();
                primaryAction.onClick();
              }}
              sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 0 }}
            >
              {primaryAction.label}
            </Button>
          </Tooltip>
        ) : null;

        return (
          <Paper
            key={asset.id}
            className="glass-card"
            sx={{
              overflow: "hidden",
              borderLeft: "3px solid",
              borderLeftColor,
              transition: "transform 0.18s ease-out, box-shadow 0.18s ease-out",
              "&:active": {
                transform: "scale(0.982)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                transition: "transform 0.07s, box-shadow 0.07s",
              },
            }}
          >
            <Stack direction="row" alignItems="center" sx={{ px: 1.25, py: 1.25 }} spacing={1}>
              <IconButton
                size="small"
                sx={{ p: 0.25, flexShrink: 0 }}
                onClick={() => onExpandToggle(asset.id, !isExpanded)}
              >
                {isExpanded ? (
                  <ExpandLessOutlined sx={{ fontSize: 18 }} />
                ) : (
                  <ExpandMoreOutlined sx={{ fontSize: 18 }} />
                )}
              </IconButton>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>
                    {asset.assetTag}
                  </Typography>
                  {asset.assetName && (
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ fontWeight: 400, minWidth: 0 }}>
                      {asset.assetName}
                    </Typography>
                  )}
                  {issuesBadge(asset)}
                </Stack>
                <Typography
                  noWrap
                  sx={{ display: "block", fontSize: "0.68rem", color: "text.secondary", lineHeight: 1.3, mt: 0.15 }}
                >
                  {smartDesc}
                </Typography>
              </Box>

              <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                {cardWidgets.length > 0 && (
                  <Stack direction="row" spacing={0.25} alignItems="center">
                    {cardWidgets.map((w) => {
                      const totalCount = w.openCount + w.resolvedCount;
                      const allResolved = w.openCount === 0 && w.resolvedCount > 0;
                      const Icon = w.icon === "camera" ? PhotoCameraOutlined : ReportProblemOutlined;
                      const hex =
                        w.color === "yellow"
                          ? "#d79b24"
                          : w.color === "grey"
                            ? "#8a9ba8"
                            : w.color === "red"
                              ? "#d32f2f"
                              : "#e8833a";
                      return (
                        <Box
                          key={w.kind}
                          sx={{ display: "inline-flex", alignItems: "center", gap: 0.15, opacity: allResolved ? 0.4 : 1 }}
                        >
                          <Icon sx={{ fontSize: 14, color: hex }} />
                          {totalCount > 1 && (
                            <Typography component="span" sx={{ fontSize: 9, fontWeight: 700, color: hex }}>
                              {totalCount}
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                )}
                {subLabel && (
                  <Chip
                    size="small"
                    label={subLabel}
                    color={subColor}
                    variant="outlined"
                    sx={{ height: 18, fontSize: "0.65rem", "& .MuiChip-label": { px: 0.75 } }}
                  />
                )}
                <Chip
                  size="small"
                  label={smartChipLabel}
                  color={smartChipColor}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenStatusMenu(e.currentTarget as HTMLElement, asset);
                  }}
                  sx={{ cursor: "pointer", fontWeight: 600, fontSize: "0.7rem" }}
                />
              </Stack>

              {quickAction}
            </Stack>

            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
              <Box
                sx={{
                  px: 2,
                  py: 2,
                  bgcolor: "rgba(45,212,191,0.05)",
                  borderTop: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography
                  variant="caption"
                  fontWeight={700}
                  color="text.secondary"
                  sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1.5 }}
                >
                  Feature Values &amp; Sub-Dependencies
                </Typography>
                {renderFeatureExpandedRow(asset)}
                {asset.notes && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      Notes:{" "}
                    </Typography>
                    <Typography variant="caption">{asset.notes}</Typography>
                  </Box>
                )}
                <Divider sx={{ my: 1.5 }} />
                {renderIssuesPanel(asset)}
                {(() => {
                  const timePanel = renderTimeTrackingPanel(asset);
                  return timePanel ? (
                    <>
                      <Divider sx={{ my: 1.5 }} />
                      {timePanel}
                    </>
                  ) : null;
                })()}
                <Divider sx={{ my: 1.5 }} />
                {renderWorkflowAssignmentsPanel(asset)}
              </Box>
            </Collapse>
          </Paper>
        );
      })}
    </Stack>
  );
}
