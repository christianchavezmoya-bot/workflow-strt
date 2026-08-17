import {
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
  isPendingInstallerSignature,
  type OpenIssueRecord,
  type PendingSignatureRecord,
} from "../../services/assetWorkflowRunService";
import AttentionItemList from "./AttentionItemList";
import DashboardAttentionItemRow from "./DashboardAttentionItemRow";
import { fmtDate, pendingSignatureStageLabel, pendingSignatureStageText } from "./dashboardPageLogic";

type Props = {
  myInspectionAttentionCount: number;
  attentionLoading: boolean;
  myInspectionBlocking: OpenIssueRecord[];
  myInspectionPendingSigs: PendingSignatureRecord[];
  myInspectionHighObservations: OpenIssueRecord[];
  resolvingDashboardIssueId: string | null;
  isManager: boolean;
  installerReminderSentByRunId: Record<string, boolean>;
  assetAttentionLabel: (record: {
    projectId?: string | null;
    jobNumber?: string | null;
    assetTag?: string | null;
    assetName?: string | null;
  }) => string;
  onOpenIssue: (issue: OpenIssueRecord) => void;
  onOpenSignature: (sig: PendingSignatureRecord) => void;
};

export default function DashboardInspectionAttentionSection({
  myInspectionAttentionCount,
  attentionLoading,
  myInspectionBlocking,
  myInspectionPendingSigs,
  myInspectionHighObservations,
  resolvingDashboardIssueId,
  isManager,
  installerReminderSentByRunId,
  assetAttentionLabel,
  onOpenIssue,
  onOpenSignature,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <WarningAmberOutlined sx={{ color: myInspectionAttentionCount > 0 ? "warning.main" : "success.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Needs Attention</Typography>
        <Box sx={{ display: "inline-flex", alignItems: "center", minWidth: 64, ml: 1 }}>
          {attentionLoading ? (
            <CircularProgress size={14} />
          ) : myInspectionAttentionCount === 0 ? (
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

        {/* My Blocking Issues (inspections) */}
        <Grid item xs={12} sm={6} md={4}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: myInspectionBlocking.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
            background:  myInspectionBlocking.length > 0
              ? "linear-gradient(180deg, rgba(64,15,17,0.78) 0%, rgba(33,13,14,0.56) 100%)"
              : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ErrorOutlineOutlined sx={{ fontSize: 18, color: myInspectionBlocking.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My Blocking Issues</Typography>
              {resolvingDashboardIssueId && (
                <Chip
                  label="Updating"
                  size="small"
                  color="error"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.62rem", fontWeight: 700 }}
                />
              )}
            </Stack>
            <Typography variant="h5" fontWeight={700} color={myInspectionBlocking.length > 0 ? "error.main" : "text.secondary"}>
              {myInspectionBlocking.length}
            </Typography>
            {myInspectionBlocking.length > 0 ? (
              <AttentionItemList
                items={myInspectionBlocking}
                maxCollapsed={3}
                getKey={(iss) => iss.issueId}
                renderItem={(iss) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(iss)}
                    sub={iss.description.slice(0, 40) + (iss.description.length > 40 ? "..." : "")}
                    actionLabel="Resolve now"
                    onClick={() => onOpenIssue(iss)}
                  />
                )}
              />
            ) : (
              <Typography variant="caption" color="success.main">
                {resolvingDashboardIssueId ? "Refreshing blocking issues..." : "No blocking issues"}
              </Typography>
            )}
          </Box>
        </Grid>

        {/* My Pending Signatures (inspections) */}
        <Grid item xs={12} sm={6} md={4}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: myInspectionPendingSigs.length > 0 ? "warning.main" : "rgba(255,255,255,0.08)",
            background:  myInspectionPendingSigs.length > 0 ? "rgba(230,119,0,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <PendingActionsOutlined sx={{ fontSize: 18, color: myInspectionPendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My Pending Signatures</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={myInspectionPendingSigs.length > 0 ? "warning.main" : "text.secondary"}>
              {myInspectionPendingSigs.length}
            </Typography>
            {myInspectionPendingSigs.length > 0 ? (
              <AttentionItemList
                items={myInspectionPendingSigs}
                maxCollapsed={3}
                getKey={(s) => s.runId}
                renderItem={(s) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(s)}
                    sub={`${pendingSignatureStageText(s.signatureStatus)} · Field work complete ${fmtDate(s.completedAt)}`}
                    actionLabel={pendingSignatureStageLabel(s.signatureStatus)}
                    requestSent={Boolean(isManager && isPendingInstallerSignature(s.signatureStatus) && installerReminderSentByRunId[s.runId])}
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

        {/* My High Observations (inspections) */}
        <Grid item xs={12} sm={6} md={4}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: myInspectionHighObservations.length > 0 ? "warning.dark" : "rgba(255,255,255,0.08)",
            background:  myInspectionHighObservations.length > 0 ? "rgba(249,168,37,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ReportOutlined sx={{ fontSize: 18, color: myInspectionHighObservations.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My Observations & Scope</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={myInspectionHighObservations.length > 0 ? "warning.main" : "text.secondary"}>
              {myInspectionHighObservations.length}
            </Typography>
            {myInspectionHighObservations.length > 0 ? (
              <AttentionItemList
                items={myInspectionHighObservations}
                maxCollapsed={3}
                getKey={(iss) => iss.issueId}
                renderItem={(iss) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(iss)}
                    sub={iss.description.slice(0, 40) + (iss.description.length > 40 ? "..." : "")}
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
