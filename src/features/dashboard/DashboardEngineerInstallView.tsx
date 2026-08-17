import { FactCheckOutlined, PendingActionsOutlined } from "@mui/icons-material";
import { Box, Chip, Grid, Stack, Typography } from "@mui/material";
import { isPendingCustomerSignature } from "../../services/assetWorkflowRunService";
import type { PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import AttentionItemList from "./AttentionItemList";
import DashboardAttentionItemRow from "./DashboardAttentionItemRow";
import { fmtDate, pendingSignatureStageLabel, pendingSignatureStageText } from "./dashboardPageLogic";

type DraftConfig = { id: string; name: string; updatedAt?: string };

type Props = {
  needsAttentionSection: React.ReactNode;
  pendingSignatures: PendingSignatureRecord[];
  draftConfigs: DraftConfig[];
  assetAttentionLabel: (item: PendingSignatureRecord) => string;
  onOpenSignatureRepair: (item: PendingSignatureRecord) => void;
  onNavigateToWorkInstructions: () => void;
};

export default function DashboardEngineerInstallView({
  needsAttentionSection,
  pendingSignatures,
  draftConfigs,
  assetAttentionLabel,
  onOpenSignatureRepair,
  onNavigateToWorkInstructions,
}: Props) {
  return (
    <>
      {needsAttentionSection}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <PendingActionsOutlined sx={{ fontSize: 18, color: pendingSignatures.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                Sign-offs Waiting on Me
              </Typography>
              <Chip
                label={pendingSignatures.length}
                size="small"
                color={pendingSignatures.length > 0 ? "warning" : "default"}
                variant="outlined"
                sx={{ height: 20, fontSize: "0.7rem" }}
              />
            </Stack>
            {pendingSignatures.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No pending sign-offs
              </Typography>
            ) : (
              <AttentionItemList
                items={pendingSignatures}
                maxCollapsed={5}
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
            )}
          </Box>
        </Grid>
        <Grid item xs={12} md={6}>
          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <FactCheckOutlined sx={{ fontSize: 18, color: draftConfigs.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                Workflow Configs in Draft
              </Typography>
              <Chip
                label={draftConfigs.length}
                size="small"
                color={draftConfigs.length > 0 ? "warning" : "default"}
                variant="outlined"
                sx={{ height: 20, fontSize: "0.7rem" }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Not yet published {"\u2014"} review and publish
            </Typography>
            {draftConfigs.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No draft configs
              </Typography>
            ) : (
              <Stack spacing={0.25}>
                {draftConfigs.slice(0, 5).map((config) => (
                  <DashboardAttentionItemRow
                    key={config.id}
                    label={config.name}
                    sub={config.updatedAt ? `Updated ${fmtDate(config.updatedAt)}` : undefined}
                    onClick={onNavigateToWorkInstructions}
                  />
                ))}
                {draftConfigs.length > 5 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{draftConfigs.length - 5} more
                  </Typography>
                )}
              </Stack>
            )}
          </Box>
        </Grid>
      </Grid>
    </>
  );
}
