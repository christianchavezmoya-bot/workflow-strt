import {
  ErrorOutlineOutlined,
  OpenInNewOutlined,
  PendingActionsOutlined,
  ReportOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { Box, Button, Chip, CircularProgress, Grid, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import { isPendingCustomerSignature } from "../../services/assetWorkflowRunService";
import type { OpenIssueRecord, PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import AttentionItemList from "./AttentionItemList";
import DashboardAttentionItemRow from "./DashboardAttentionItemRow";
import { fmtDate, pendingSignatureStageLabel, pendingSignatureStageText } from "./dashboardPageLogic";

type Props = {
  attentionLoading: boolean;
  attentionCount: number;
  blockingIssues: OpenIssueRecord[];
  pendingSignatures: PendingSignatureRecord[];
  highObservations: OpenIssueRecord[];
  resolvingIssueId: string | null;
  assetAttentionLabel: (item: OpenIssueRecord | PendingSignatureRecord) => string;
  onOpenIssueRepair: (issue: OpenIssueRecord) => void;
  onOpenSignatureRepair: (signature: PendingSignatureRecord) => void;
};

export default function DashboardInstallerAttentionPanel({
  attentionLoading,
  attentionCount,
  blockingIssues,
  pendingSignatures,
  highObservations,
  resolvingIssueId,
  assetAttentionLabel,
  onOpenIssueRepair,
  onOpenSignatureRepair,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <WarningAmberOutlined sx={{ color: attentionCount > 0 ? "warning.main" : "success.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
          Needs Attention
        </Typography>
        <Box sx={{ display: "inline-flex", alignItems: "center", minWidth: 64, ml: 1 }}>
          {attentionLoading ? (
            <CircularProgress size={14} />
          ) : attentionCount === 0 ? (
            <Chip label="All clear" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
          ) : null}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="text"
          component={Link}
          to="/issues"
          endIcon={<OpenInNewOutlined sx={{ fontSize: 13 }} />}
          sx={{ fontSize: "0.72rem" }}
        >
          Issues Board
        </Button>
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <Box
            sx={{
              p: { xs: 1.5, sm: 2 },
              borderRadius: 2,
              height: "100%",
              border: "1px solid",
              transition: "all 0.2s",
              borderColor: blockingIssues.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
              background:
                blockingIssues.length > 0
                  ? "linear-gradient(180deg, rgba(64,15,17,0.78) 0%, rgba(33,13,14,0.56) 100%)"
                  : "rgba(255,255,255,0.03)",
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ErrorOutlineOutlined sx={{ fontSize: 18, color: blockingIssues.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                My Blocking Issues
              </Typography>
              {resolvingIssueId && (
                <Chip label="Updating" size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: "0.62rem", fontWeight: 700 }} />
              )}
            </Stack>
            <Typography variant="h5" fontWeight={700} color={blockingIssues.length > 0 ? "error.main" : "text.secondary"}>
              {blockingIssues.length}
            </Typography>
            {blockingIssues.length > 0 ? (
              <AttentionItemList
                items={blockingIssues}
                maxCollapsed={3}
                getKey={(issue) => issue.issueId}
                renderItem={(issue) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(issue)}
                    sub={issue.description.slice(0, 40) + (issue.description.length > 40 ? "..." : "")}
                    actionLabel="Resolve now"
                    onClick={() => onOpenIssueRepair(issue)}
                  />
                )}
              />
            ) : (
              <Typography variant="caption" color="success.main">
                {resolvingIssueId ? "Refreshing blocking issues..." : "No blocking issues"}
              </Typography>
            )}
          </Box>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Box
            sx={{
              p: { xs: 1.5, sm: 2 },
              borderRadius: 2,
              height: "100%",
              border: "1px solid",
              transition: "all 0.2s",
              borderColor: pendingSignatures.length > 0 ? "warning.main" : "rgba(255,255,255,0.08)",
              background: pendingSignatures.length > 0 ? "rgba(230,119,0,0.07)" : "rgba(255,255,255,0.03)",
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <PendingActionsOutlined sx={{ fontSize: 18, color: pendingSignatures.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                My Pending Signatures
              </Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={pendingSignatures.length > 0 ? "warning.main" : "text.secondary"}>
              {pendingSignatures.length}
            </Typography>
            {pendingSignatures.length > 0 ? (
              <AttentionItemList
                items={pendingSignatures}
                maxCollapsed={3}
                getKey={(signature) => signature.runId}
                renderItem={(signature) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(signature)}
                    sub={`${pendingSignatureStageText(signature.signatureStatus)} · Field work complete ${fmtDate(signature.completedAt)}`}
                    actionLabel={pendingSignatureStageLabel(signature.signatureStatus)}
                    {...(isPendingCustomerSignature(signature.signatureStatus) && signature.customerLinkSentAt
                      ? { customerLinkSentAt: signature.customerLinkSentAt, projectTimeZoneId: signature.projectTimeZoneId }
                      : {})}
                    onClick={() => { void onOpenSignatureRepair(signature); }}
                  />
                )}
              />
            ) : (
              <Typography variant="caption" color="success.main">
                All signatures collected
              </Typography>
            )}
          </Box>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Box
            sx={{
              p: { xs: 1.5, sm: 2 },
              borderRadius: 2,
              height: "100%",
              border: "1px solid",
              transition: "all 0.2s",
              borderColor: highObservations.length > 0 ? "warning.dark" : "rgba(255,255,255,0.08)",
              background: highObservations.length > 0 ? "rgba(249,168,37,0.07)" : "rgba(255,255,255,0.03)",
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ReportOutlined sx={{ fontSize: 18, color: highObservations.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                My Observations & Scope
              </Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={highObservations.length > 0 ? "warning.main" : "text.secondary"}>
              {highObservations.length}
            </Typography>
            {highObservations.length > 0 ? (
              <AttentionItemList
                items={highObservations}
                maxCollapsed={3}
                getKey={(issue) => issue.issueId}
                renderItem={(issue) => (
                  <DashboardAttentionItemRow
                    label={assetAttentionLabel(issue)}
                    sub={issue.description.slice(0, 40) + (issue.description.length > 40 ? "..." : "")}
                    actionLabel="Review"
                    onClick={() => onOpenIssueRepair(issue)}
                  />
                )}
              />
            ) : (
              <Typography variant="caption" color="success.main">
                No observations or scope variations
              </Typography>
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
