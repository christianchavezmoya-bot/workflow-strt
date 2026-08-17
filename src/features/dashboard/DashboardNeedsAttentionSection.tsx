import {
  AssignmentLateOutlined,
  ErrorOutlineOutlined,
  OpenInNewOutlined,
  PendingActionsOutlined,
  ReportOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { Box, Button, Chip, CircularProgress, Grid, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import {
  isPendingCustomerSignature,
} from "../../services/assetWorkflowRunService";
import type { OpenIssueRecord, PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import type { Project } from "../../types/project";
import AttentionItemList from "./AttentionItemList";
import DashboardAttentionItemRow from "./DashboardAttentionItemRow";
import { fmtDate, pendingSignatureStageLabel, pendingSignatureStageText } from "./dashboardPageLogic";

type Props = {
  attentionCount: number;
  attentionLoading: boolean;
  blockingIssues: OpenIssueRecord[];
  overdueProjects: Project[];
  visiblePendingSigs: PendingSignatureRecord[];
  highIssues: OpenIssueRecord[];
  isAdmin: boolean;
  assetAttentionLabel: (record: {
    projectId?: string | null;
    jobNumber?: string | null;
    assetTag?: string | null;
    assetName?: string | null;
  }) => string;
  projectAttentionLabel: (
    projectId?: string | null,
    fallbackJobNumber?: string | null,
    fallbackCustomer?: string | null,
  ) => string;
  onOpenIssue: (issue: OpenIssueRecord) => void;
  onOpenSignature: (sig: PendingSignatureRecord) => void;
  onNavigateToProject: (projectId: string) => void;
};

export default function DashboardNeedsAttentionSection({
  attentionCount,
  attentionLoading,
  blockingIssues,
  overdueProjects,
  visiblePendingSigs,
  highIssues,
  isAdmin,
  assetAttentionLabel,
  projectAttentionLabel,
  onOpenIssue,
  onOpenSignature,
  onNavigateToProject,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <WarningAmberOutlined sx={{ color: attentionCount > 0 ? "warning.main" : "success.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Needs Attention</Typography>
        <Box sx={{ display: "inline-flex", alignItems: "center", minWidth: 64, ml: 1 }}>
          {attentionLoading ? (
            <CircularProgress size={14} />
          ) : attentionCount === 0 ? (
            <Chip label="All clear" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
          ) : null}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="text" component={Link} to="/issues"
          endIcon={<OpenInNewOutlined sx={{ fontSize: 13 }} />} sx={{ fontSize: "0.72rem" }}>
          Issues Board
        </Button>
      </Stack>

      <Grid container spacing={2}>

        {/* Blocking Issues */}
        <Grid item xs={6} sm={6} md={3}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: blockingIssues.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
            background:  blockingIssues.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ErrorOutlineOutlined sx={{ fontSize: 18, color: blockingIssues.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>Blocking Issues</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={blockingIssues.length > 0 ? "error.main" : "text.secondary"}>
              {blockingIssues.length}
            </Typography>
            {blockingIssues.length > 0 ? (
              <AttentionItemList
                items={blockingIssues}
                maxCollapsed={4}
                getKey={(iss) => iss.issueId}
                renderItem={(iss) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(iss)}
                    sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "..." : "")}
                    actionLabel="Resolve"
                    onClick={() => onOpenIssue(iss)}
                  />
                )}
              />
            ) : (
              <Typography variant="caption" color="success.main">No blocking issues</Typography>
            )}
          </Box>
        </Grid>

        {/* Overdue Projects */}
        <Grid item xs={6} sm={6} md={3}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: overdueProjects.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
            background:  overdueProjects.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <AssignmentLateOutlined sx={{ fontSize: 18, color: overdueProjects.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>Overdue Projects</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={overdueProjects.length > 0 ? "error.main" : "text.secondary"}>
              {overdueProjects.length}
            </Typography>
            {overdueProjects.length > 0 ? (
              <AttentionItemList
                items={overdueProjects}
                maxCollapsed={4}
                getKey={(p) => p.id}
                renderItem={(p) => (
                  <DashboardAttentionItemRow
                    label={isAdmin
                      ? projectAttentionLabel(p.id, p.jobNumber, p.customerName)
                      : `${p.jobNumber} - ${p.customerName || ""}`}
                    sub={`Due ${fmtDate(p.finishDate)}`}
                    onClick={() => onNavigateToProject(p.id)}
                  />
                )}
              />
            ) : (
              <Typography variant="caption" color="success.main">No overdue projects</Typography>
            )}
          </Box>
        </Grid>

        {/* Pending Signatures */}
        <Grid item xs={6} sm={6} md={3}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: visiblePendingSigs.length > 0 ? "warning.main" : "rgba(255,255,255,0.08)",
            background:  visiblePendingSigs.length > 0 ? "rgba(230,119,0,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <PendingActionsOutlined sx={{ fontSize: 18, color: visiblePendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>Pending Signatures</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={visiblePendingSigs.length > 0 ? "warning.main" : "text.secondary"}>
              {visiblePendingSigs.length}
            </Typography>
            {visiblePendingSigs.length > 0 ? (
              <AttentionItemList
                items={visiblePendingSigs}
                maxCollapsed={4}
                getKey={(s) => s.runId}
                renderItem={(s) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(s)}
                    sub={`${pendingSignatureStageText(s.signatureStatus)} · Field work complete ${fmtDate(s.completedAt)}`}
                    actionLabel={pendingSignatureStageLabel(s.signatureStatus)}
                    {...(isPendingCustomerSignature(s.signatureStatus) && s.customerLinkSentAt
                      ? { customerLinkSentAt: s.customerLinkSentAt, projectTimeZoneId: s.projectTimeZoneId }
                      : {})}
                    onClick={() => { void onOpenSignature(s); }}
                  />
                )}
              />
            ) : (
              <Typography variant="caption" color="success.main">All signatures collected</Typography>
            )}
          </Box>
        </Grid>

        {/* High Observations */}
        <Grid item xs={6} sm={6} md={3}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: highIssues.length > 0 ? "warning.dark" : "rgba(255,255,255,0.08)",
            background:  highIssues.length > 0 ? "rgba(249,168,37,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ReportOutlined sx={{ fontSize: 18, color: highIssues.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>Observations & Scope</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={highIssues.length > 0 ? "warning.main" : "text.secondary"}>
              {highIssues.length}
            </Typography>
            {highIssues.length > 0 ? (
              <AttentionItemList
                items={highIssues}
                maxCollapsed={4}
                getKey={(iss) => iss.issueId}
                renderItem={(iss) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(iss)}
                    sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "..." : "")}
                    actionLabel="Review"
                    onClick={() => onOpenIssue(iss)}
                  />
                )}
              />
            ) : (
              <Typography variant="caption" color="success.main">No observations or scope variations</Typography>
            )}
          </Box>
        </Grid>

      </Grid>
    </Box>
  );
}
