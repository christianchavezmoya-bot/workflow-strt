import {
  AssessmentOutlined,
  FactCheckOutlined,
  TrendingDownOutlined,
  TrendingFlatOutlined,
  TrendingUpOutlined,
} from "@mui/icons-material";
import { Box, Chip, Grid, LinearProgress, MenuItem, Select, Stack, Tooltip, Typography } from "@mui/material";
import type { RefCallback } from "react";
import type { EvidenceCompleteness, WorkflowHealth } from "../../services/dashboardService";
import DashboardGaugeCircle from "./DashboardGaugeCircle";

const WINDOW_OPTIONS = [30, 60, 90, 180];

type Props = {
  sectionRef?: RefCallback<HTMLDivElement>;
  evidenceWindow: number;
  onEvidenceWindowChange: (days: number) => void;
  evidenceLoading: boolean;
  evidenceData: EvidenceCompleteness | null;
  evidenceError: boolean;
  healthWindow: number;
  onHealthWindowChange: (days: number) => void;
  healthLoading: boolean;
  healthData: WorkflowHealth | null;
  healthError: boolean;
  onNavigateToProject: (projectId: string) => void;
};

export default function DashboardEvidenceHealthGrid({
  sectionRef,
  evidenceWindow,
  onEvidenceWindowChange,
  evidenceLoading,
  evidenceData,
  evidenceError,
  healthWindow,
  onHealthWindowChange,
  healthLoading,
  healthData,
  healthError,
  onNavigateToProject,
}: Props) {
  return (
    <Box ref={sectionRef}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Box className="glass-card" sx={{ p: 2.5, height: "100%" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <FactCheckOutlined sx={{ fontSize: 18, color: "primary.main" }} />
              <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", flex: 1 }}>
                Evidence Completeness
              </Typography>
              <Select
                size="small"
                value={evidenceWindow}
                onChange={(e) => onEvidenceWindowChange(Number(e.target.value))}
                sx={{ fontSize: "0.75rem", height: 28 }}
              >
                {WINDOW_OPTIONS.map((d) => (
                  <MenuItem key={d} value={d}>
                    {d}d
                  </MenuItem>
                ))}
              </Select>
            </Stack>

            {evidenceLoading ? (
              <LinearProgress />
            ) : evidenceData ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={3} alignItems="center">
                  <DashboardGaugeCircle value={evidenceData.overallScore} size={90} />
                  <Stack spacing={1} sx={{ flex: 1 }}>
                    {[
                      { label: "Signed", pct: evidenceData.signedPct, n: evidenceData.signed },
                      { label: "Steps Complete", pct: evidenceData.allStepsCompletePct, n: evidenceData.allStepsComplete },
                      { label: "Has Media", pct: evidenceData.hasMediaPct, n: evidenceData.hasMedia },
                      { label: "No Open Issues", pct: evidenceData.noOpenIssuesPct, n: evidenceData.noOpenIssues },
                    ].map(({ label, pct, n }) => (
                      <Stack key={label} direction="row" alignItems="center" spacing={1}>
                        <Typography variant="caption" sx={{ minWidth: 100 }}>
                          {label}
                        </Typography>
                        <Box sx={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <Box
                            sx={{
                              height: "100%",
                              borderRadius: 3,
                              width: `${pct}%`,
                              background: pct >= 80 ? "#2e7d32" : pct >= 60 ? "#ed6c02" : "#d32f2f",
                            }}
                          />
                        </Box>
                        <Typography variant="caption" fontWeight={700} sx={{ minWidth: 36, textAlign: "right" }}>
                          {pct}%
                        </Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ minWidth: 28 }}>
                          ({n})
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
                {evidenceData.byProject.filter((p) => p.score < 70).length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      Projects below 70%
                    </Typography>
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {evidenceData.byProject
                        .filter((p) => p.score < 70)
                        .slice(0, 4)
                        .map((p) => (
                          <Stack
                            key={p.projectId}
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            onClick={() => onNavigateToProject(p.projectId)}
                            sx={{
                              cursor: "pointer",
                              px: 1,
                              py: 0.25,
                              borderRadius: 1,
                              "&:hover": { background: "rgba(255,255,255,0.05)" },
                            }}
                          >
                            <Typography variant="caption" sx={{ flex: 1 }} noWrap>
                              {p.jobNumber}
                            </Typography>
                            <Chip
                              label={`${p.score}%`}
                              size="small"
                              color={p.score < 50 ? "error" : "warning"}
                              variant="outlined"
                              sx={{ height: 16, fontSize: "0.6rem" }}
                            />
                          </Stack>
                        ))}
                    </Stack>
                  </Box>
                )}
                <Typography variant="caption" color="text.disabled">
                  {evidenceData.totalRuns} completed runs in last {evidenceWindow} days
                </Typography>
              </Stack>
            ) : (
              <Typography variant="caption" color={evidenceError ? "error.main" : "text.disabled"}>
                {evidenceError
                  ? "Couldn't load evidence completeness. Check your connection and retry."
                  : "No data available for selected window."}
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box className="glass-card" sx={{ p: 2.5, height: "100%" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <AssessmentOutlined sx={{ fontSize: 18, color: "primary.main" }} />
              <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", flex: 1 }}>
                Workflow Health
              </Typography>
              <Select
                size="small"
                value={healthWindow}
                onChange={(e) => onHealthWindowChange(Number(e.target.value))}
                sx={{ fontSize: "0.75rem", height: 28 }}
              >
                {WINDOW_OPTIONS.map((d) => (
                  <MenuItem key={d} value={d}>
                    {d}d
                  </MenuItem>
                ))}
              </Select>
            </Stack>

            {healthLoading ? (
              <LinearProgress />
            ) : healthData ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={3} alignItems="center">
                  <Box sx={{ position: "relative" }}>
                    <DashboardGaugeCircle
                      value={healthData.overallScore}
                      size={90}
                      color={
                        healthData.overallScore >= 80 ? "#2e7d32" : healthData.overallScore >= 60 ? "#ed6c02" : "#d32f2f"
                      }
                    />
                    <Tooltip
                      title={`vs previous ${healthWindow}d: ${healthData.scoreDelta > 0 ? "+" : ""}${healthData.scoreDelta}%`}
                    >
                      <Box sx={{ position: "absolute", bottom: -4, right: -4 }}>
                        {healthData.scoreDelta > 0 ? (
                          <TrendingUpOutlined sx={{ fontSize: 16, color: "success.main" }} />
                        ) : healthData.scoreDelta < 0 ? (
                          <TrendingDownOutlined sx={{ fontSize: 16, color: "error.main" }} />
                        ) : (
                          <TrendingFlatOutlined sx={{ fontSize: 16, color: "text.disabled" }} />
                        )}
                      </Box>
                    </Tooltip>
                  </Box>
                  <Stack spacing={1} sx={{ flex: 1 }}>
                    {[
                      { label: "Completion", pct: healthData.completionRate },
                      { label: "1st-Run Success", pct: healthData.firstRunSuccessRate },
                      { label: "Step Pass Rate", pct: healthData.stepPassRate },
                      { label: "Clean Closure", pct: healthData.cleanClosureRate },
                    ].map(({ label, pct }) => (
                      <Stack key={label} direction="row" alignItems="center" spacing={1}>
                        <Typography variant="caption" sx={{ minWidth: 108 }}>
                          {label}
                        </Typography>
                        <Box sx={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <Box
                            sx={{
                              height: "100%",
                              borderRadius: 3,
                              width: `${pct}%`,
                              background: pct >= 80 ? "#2e7d32" : pct >= 60 ? "#ed6c02" : "#d32f2f",
                            }}
                          />
                        </Box>
                        <Typography variant="caption" fontWeight={700} sx={{ minWidth: 36, textAlign: "right" }}>
                          {pct}%
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
                {healthData.byType.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      By workflow type
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
                      {healthData.byType.map((t) => (
                        <Chip
                          key={t.typeName}
                          label={`${t.typeName}: ${t.score}%`}
                          size="small"
                          color={t.score >= 80 ? "success" : t.score >= 60 ? "warning" : "error"}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.68rem" }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
                <Typography variant="caption" color="text.disabled">
                  {healthData.totalRuns} runs in last {healthWindow} days - prev score {healthData.previousScore}%
                </Typography>
              </Stack>
            ) : (
              <Typography variant="caption" color={healthError ? "error.main" : "text.disabled"}>
                {healthError
                  ? "Couldn't load workflow health. Check your connection and retry."
                  : "No data available for selected window."}
              </Typography>
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
