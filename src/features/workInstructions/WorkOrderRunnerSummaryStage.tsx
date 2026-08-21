import {
  CheckCircleOutlined,
  CommentOutlined,
  DeleteOutlineOutlined,
  EditOutlined,
  LockOutlined,
  PhotoCameraOutlined,
  ReportProblemOutlined,
  SyncOutlined,
} from "@mui/icons-material";
import RunnerLiveDuration from "./RunnerLiveDuration";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { RunIssue } from "../../types/assetWorkflowRun";
import type { WorkflowStep } from "../../types/workflow";
import RunTimeline from "../../components/ui/RunTimeline";
import { formatInstant } from "../../utils/datetime";
import { formatPayloadSize } from "../../utils/syncDiagnostics";
import { isMobileNativePlatform } from "../../utils/platform";
import { nativeSelectMenuProps } from "../../utils/nativeDialogInsets";
import {
  formatSummaryInputValue,
  parseRunTimeEntries,
  renderAssetIdentifier,
  runnerSummaryDialogActionsSx,
} from "./workOrderRunnerUi";

export interface SummaryStepCapture {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
  iterationIndex?: number;
}

export interface SummaryQtyModification {
  stepId: string;
  featureId: string;
  featureName: string;
  expectedQty: number;
  actualQty: number;
  reason: string;
  modifiedAt: string;
}

export interface SummaryMissingCaptureTarget {
  stepId: string;
  iterationIndex?: number;
}

export interface WorkOrderRunnerSummaryStageProps {
  isPreviewWalkthrough: boolean;
  stepsCount: number;
  assetTag?: string;
  stepsData: SummaryStepCapture[];
  stepsSorted: WorkflowStep[];
  issues: RunIssue[];
  blockingIssues: RunIssue[];
  hasBlockingIssues: boolean;
  primaryBlockingIssue: RunIssue | null;
  qtyModifications: Record<string, SummaryQtyModification>;
  qtyModificationCount: number;
  showLargePayloadWarning: boolean;
  payloadBytes: number;
  missingCaptureTargets: SummaryMissingCaptureTarget[];
  missingCaptureCount: number;
  hasMissingCaptures: boolean;
  isRealRun: boolean;
  productiveSecondsBase: number;
  downtimeSecondsBase: number;
  trackingCategory: "productive" | "downtime" | null;
  trackingStartedAt: string | null;
  timeTrackingJson?: string | null;
  timeZoneId?: string;
  showSummaryIssues: boolean;
  onToggleSummaryIssues: () => void;
  showSummaryQtyMods: boolean;
  onToggleSummaryQtyMods: () => void;
  showSummaryCapturedData: boolean;
  onToggleSummaryCapturedData: () => void;
  editingIssueId: string | null;
  editIssueDesc: string;
  editIssueSeverity: "low" | "medium" | "high";
  onEditIssueDescChange: (value: string) => void;
  onEditIssueSeverityChange: (value: "low" | "medium" | "high") => void;
  onStartEditIssue: (issue: RunIssue) => void;
  onSaveEditIssue: () => void;
  onCancelEditIssue: () => void;
  onDeleteIssue: (id: string) => void;
  onOpenIssueDetail: (id: string) => void;
  blockingError: string | null;
  saveError: string | null;
  saved: boolean;
  activeRunId: string | null;
  signoffReviewMode: boolean;
  signatureStatus?: string;
  runEditPerms: { data: boolean; time: boolean };
  saving: boolean;
  discarding: boolean;
  onClose: () => void;
  onBackToRunning: () => void;
  onDiscardRequest: () => void;
  onOpenTimeEditor: () => void;
  onContinueToInstallerSign: () => void;
  onResolveBlockingIssue: () => void;
  onJumpToMissingCapture: () => void;
  onSaveAndClose: () => void;
  onLockRun: () => void;
  onPreviewClose: () => void;
  onPreviewBack: () => void;
}

export default function WorkOrderRunnerSummaryStage({
  isPreviewWalkthrough,
  stepsCount,
  assetTag,
  stepsData,
  stepsSorted,
  issues,
  blockingIssues,
  hasBlockingIssues,
  primaryBlockingIssue,
  qtyModifications,
  qtyModificationCount,
  showLargePayloadWarning,
  payloadBytes,
  missingCaptureCount,
  hasMissingCaptures,
  isRealRun,
  productiveSecondsBase,
  downtimeSecondsBase,
  trackingCategory,
  trackingStartedAt,
  timeTrackingJson,
  timeZoneId,
  showSummaryIssues,
  onToggleSummaryIssues,
  showSummaryQtyMods,
  onToggleSummaryQtyMods,
  showSummaryCapturedData,
  onToggleSummaryCapturedData,
  editingIssueId,
  editIssueDesc,
  editIssueSeverity,
  onEditIssueDescChange,
  onEditIssueSeverityChange,
  onStartEditIssue,
  onSaveEditIssue,
  onCancelEditIssue,
  onDeleteIssue,
  onOpenIssueDetail,
  blockingError,
  saveError,
  saved,
  activeRunId,
  signoffReviewMode,
  signatureStatus,
  runEditPerms,
  saving,
  discarding,
  onBackToRunning,
  onDiscardRequest,
  onOpenTimeEditor,
  onContinueToInstallerSign,
  onResolveBlockingIssue,
  onJumpToMissingCapture,
  onSaveAndClose,
  onLockRun,
  onPreviewClose,
  onPreviewBack,
}: WorkOrderRunnerSummaryStageProps) {
  if (isPreviewWalkthrough) {
    return (
      <>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleOutlined color="success" />
            <Typography variant="subtitle1" fontWeight={600}>Workflow preview complete</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ overflowX: "hidden" }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="h6" fontWeight={700}>
                  Previewed all workflow steps
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This was a preview walkthrough only. No run was created, no asset data was loaded, and no validation was enforced.
                </Typography>
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  label={`${stepsCount} step${stepsCount === 1 ? "" : "s"} previewed`}
                  sx={{ alignSelf: "flex-start" }}
                />
              </Stack>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}>
          <Button onClick={onPreviewBack} variant="outlined" size="small">
            Back to steps
          </Button>
          <Button onClick={onPreviewClose} variant="contained" size="small">
            Close preview
          </Button>
        </DialogActions>
      </>
    );
  }

  return (
    <>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CheckCircleOutlined color="success" />
          <Typography variant="subtitle1" fontWeight={600}>Workflow complete</Typography>
        </Stack>
        {renderAssetIdentifier(assetTag)}
      </DialogTitle>
      <DialogContent dividers sx={{ overflowX: "hidden" }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={700}>
                Great job - all workflow steps are complete
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stepsCount} step{stepsCount === 1 ? "" : "s"} completed.
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                <Chip size="small" color="success" variant="outlined" label={`${stepsCount} steps completed`} />
                <Chip
                  size="small"
                  color={hasMissingCaptures ? "warning" : "success"}
                  variant="outlined"
                  label={hasMissingCaptures ? `${missingCaptureCount} missing capture${missingCaptureCount === 1 ? "" : "s"}` : "No missing captures"}
                />
                <Chip
                  size="small"
                  color={hasBlockingIssues ? "error" : issues.length > 0 ? "warning" : "default"}
                  variant="outlined"
                  label={
                    hasBlockingIssues
                      ? `${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? "" : "s"}`
                      : `${issues.length} issue${issues.length === 1 ? "" : "s"} flagged`
                  }
                />
                {qtyModificationCount > 0 && (
                  <Chip size="small" color="warning" variant="outlined" label={`${qtyModificationCount} qty change${qtyModificationCount === 1 ? "" : "s"}`} />
                )}
              </Stack>
              {isRealRun && (
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={(
                      <>
                        Productive{" "}
                        <RunnerLiveDuration
                          baseSeconds={productiveSecondsBase}
                          trackingCategory={trackingCategory}
                          activeCategory="productive"
                          trackingStartedAt={trackingStartedAt}
                        />
                      </>
                    )}
                  />
                  <Chip
                    size="small"
                    color={downtimeSecondsBase > 0 ? "warning" : "default"}
                    variant="outlined"
                    label={(
                      <>
                        Downtime{" "}
                        <RunnerLiveDuration
                          baseSeconds={downtimeSecondsBase}
                          trackingCategory={trackingCategory}
                          activeCategory="downtime"
                          trackingStartedAt={trackingStartedAt}
                        />
                      </>
                    )}
                  />
                </Stack>
              )}
              {timeTrackingJson && (
                <Box sx={{ mt: 0.5 }}>
                  <RunTimeline entries={parseRunTimeEntries(timeTrackingJson)} timeZoneId={timeZoneId} />
                </Box>
              )}
            </Stack>
          </Paper>

          {hasMissingCaptures && (
            <Alert severity="warning" icon={<PhotoCameraOutlined />}>
              {missingCaptureCount} capture{missingCaptureCount === 1 ? "" : "s"} still missing. Add the missing photos before locking the run.
            </Alert>
          )}

          {showLargePayloadWarning && (
            <Alert severity="info" icon={<SyncOutlined />}>
              This run is carrying about {formatPayloadSize(payloadBytes)} of step-result data. Large photo payloads can take longer to sync on the phone.
            </Alert>
          )}

          {issues.length > 0 && (
            <Stack spacing={1}>
              <Divider />
              <Button
                size="small"
                variant="outlined"
                onClick={onToggleSummaryIssues}
                sx={{ alignSelf: "flex-start" }}
              >
                {showSummaryIssues ? "Hide issues" : `Show issues (${issues.length})`}
              </Button>
              <Collapse in={showSummaryIssues}>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {issues.map((issue) => (
                    <Paper key={issue.id} variant="outlined" sx={{ p: 1.25, borderColor: issue.isBlocking ? "error.main" : undefined }}>
                      {editingIssueId === issue.id ? (
                        <Stack spacing={0.75}>
                          <TextField size="small" fullWidth multiline rows={2} label="Description"
                            value={editIssueDesc} onChange={(e) => onEditIssueDescChange(e.target.value)} />
                          <FormControl size="small" sx={{ maxWidth: 220 }}>
                            <InputLabel shrink>Severity</InputLabel>
                            <Select
                              label="Severity"
                              value={editIssueSeverity}
                              onChange={(e) => onEditIssueSeverityChange(e.target.value as "low" | "medium" | "high")}
                              MenuProps={nativeSelectMenuProps()}
                            >
                              <MenuItem value="low">Low - observation only</MenuItem>
                              <MenuItem value="medium">Medium - attention needed</MenuItem>
                              <MenuItem value="high">High - blocks completion</MenuItem>
                            </Select>
                          </FormControl>
                          <Stack direction="row" spacing={0.75}>
                            <Button size="small" variant="contained" color="primary" disabled={!editIssueDesc.trim()} onClick={onSaveEditIssue}>Save</Button>
                            <Button size="small" onClick={onCancelEditIssue}>Cancel</Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Stack spacing={0.5}>
                          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {issue.resolved
                                ? <Chip size="small" label="Resolved" color="success" sx={{ flexShrink: 0 }} />
                                : <Chip size="small"
                                    label={issue.issueType === "scope-deviation" ? "Scope Var." : issue.isBlocking ? "Blocking" : "Observation"}
                                    color={issue.issueType === "scope-deviation" ? "warning" : issue.isBlocking ? "error" : "default"}
                                    sx={{ flexShrink: 0 }} />
                              }
                              {issue.issueType !== "scope-deviation" && (
                                <Chip size="small" label={issue.severity} variant="outlined" sx={{ flexShrink: 0 }} />
                              )}
                              {issue.issueType === "scope-deviation" && (issue.extraHours != null || issue.costImpact) && (
                                <Chip size="small" variant="outlined" color="warning"
                                  label={[issue.extraHours != null ? `+${issue.extraHours}h` : null, issue.costImpact].filter(Boolean).join(" - ")}
                                  sx={{ flexShrink: 0 }} />
                              )}
                              {issue.stepTitle && <Chip size="small" label={issue.stepTitle} variant="outlined" sx={{ flexShrink: 0 }} />}
                            </Stack>
                            <Stack direction="row" spacing={0}>
                              <Tooltip title="Add comments or close issue">
                                <IconButton size="small" onClick={() => onOpenIssueDetail(issue.id)} sx={{ p: 0.25 }}>
                                  <CommentOutlined sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit issue"><IconButton size="small" onClick={() => onStartEditIssue(issue)} sx={{ p: 0.25 }}><EditOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                              <Tooltip title="Delete issue"><IconButton size="small" color="error" onClick={() => onDeleteIssue(issue.id)} sx={{ p: 0.25 }}><DeleteOutlineOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                            </Stack>
                          </Stack>
                          <Typography variant="caption" sx={issue.resolved ? { textDecoration: "line-through", color: "text.disabled" } : undefined}>{issue.description}</Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                            {issue.createdBy ? `${issue.createdBy} - ` : ""}{formatInstant(issue.reportedAt, timeZoneId, { withZone: false })}
                          </Typography>
                        </Stack>
                      )}
                    </Paper>
                  ))}
                </Stack>
              </Collapse>
            </Stack>
          )}

          {qtyModificationCount > 0 && (
            <Stack spacing={1}>
              <Divider />
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={onToggleSummaryQtyMods}
                sx={{ alignSelf: "flex-start" }}
              >
                {showSummaryQtyMods ? "Hide qty changes" : `Show qty changes (${qtyModificationCount})`}
              </Button>
              <Collapse in={showSummaryQtyMods}>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {Object.values(qtyModifications).map((mod) => (
                    <Paper key={mod.stepId} variant="outlined" sx={{ p: 1.25, borderColor: "warning.main" }}>
                      <Stack spacing={0.25}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Chip size="small" color="warning" label="Qty Modified" />
                          <Typography variant="caption" fontWeight={600}>{mod.featureName}</Typography>
                        </Stack>
                        <Typography variant="caption">
                          Expected: <strong>{mod.expectedQty}</strong>{" -> "}Installed: <strong>{mod.actualQty}</strong>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Reason: {mod.reason}</Typography>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Collapse>
            </Stack>
          )}

          {hasBlockingIssues && !blockingError && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              {blockingIssues.length} blocking issue{blockingIssues.length === 1 ? "" : "s"} must be closed before locking this run.
              {activeRunId
                ? " Click the comment icon on each blocking issue to add notes and close it."
                : " (Preview mode: not enforced)"}
            </Alert>
          )}

          {stepsData.length > 0 && (
            <Stack spacing={1.5}>
              <Divider />
              <Button
                size="small"
                variant="outlined"
                onClick={onToggleSummaryCapturedData}
                sx={{ alignSelf: "flex-start" }}
              >
                {showSummaryCapturedData ? "Hide captured data" : "Show captured data"}
              </Button>
              <Collapse in={showSummaryCapturedData}>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {stepsData.map((sc, index) => {
                    const step = stepsSorted.find((s) => s.id === sc.stepId);
                    if (!step) return null;
                    return (
                      <Paper key={`${sc.stepId}-${index}`} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="caption" fontWeight={600} display="block" mb={0.75}>
                          {String(step.order).padStart(2, "0")} - {step.title || "(Untitled step)"}
                        </Typography>
                        <Stack spacing={0.5}>
                          {(step.inputs ?? []).map((inp) => {
                            const val = sc.values[inp.id];
                            if (!val) return null;
                            return (
                              <Stack key={inp.id} direction="row" spacing={1} alignItems="flex-start">
                                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>{inp.label}:</Typography>
                                <Typography variant="caption" sx={{ wordBreak: "break-word" }}>{formatSummaryInputValue(inp, val)}</Typography>
                              </Stack>
                            );
                          })}
                          {(step.captureFields ?? []).map((field) => {
                            const val = sc.values[field.id];
                            if (!val) return null;
                            return (
                              <Stack key={field.id} direction="row" spacing={1} alignItems="flex-start">
                                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>{field.label}:</Typography>
                                <Typography variant="caption" sx={{ wordBreak: "break-word" }}>{val}</Typography>
                              </Stack>
                            );
                          })}
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Collapse>
            </Stack>
          )}

          {blockingError && <Alert severity="error" sx={{ fontSize: 12 }}>{blockingError}</Alert>}
          {saveError && <Alert severity="error" sx={{ fontSize: 12 }}>{saveError}</Alert>}
          {!saved && activeRunId && (
            <Alert severity="warning" sx={{ fontSize: 12 }}>
              Review recorded time and captured fields before locking. Use <strong>Adjust time</strong> or <strong>Back to steps</strong> if anything needs correction. After you sign as installer, you will not be able to edit time or field captures (Project Managers and Admins may still correct data until customer sign-off).
            </Alert>
          )}
          {saved && signoffReviewMode && signatureStatus === "PendingInstaller" && (
            <Alert severity="info" sx={{ fontSize: 12 }}>
              Review recorded time and captured fields, then continue to installer sign-off.
            </Alert>
          )}
          {saved && !signoffReviewMode && (
            <Alert severity="success" sx={{ fontSize: 12 }} icon={<LockOutlined fontSize="small" />}>
              Run locked and saved successfully.
            </Alert>
          )}
          {saved && signoffReviewMode && signatureStatus !== "PendingInstaller" && (
            <Alert severity="success" sx={{ fontSize: 12 }} icon={<LockOutlined fontSize="small" />}>
              Run locked and saved successfully.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={runnerSummaryDialogActionsSx}>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size={isMobileNativePlatform() ? "small" : "medium"} onClick={onDiscardRequest} disabled={saving || discarding}>
            {saved ? "Close" : "Discard"}
          </Button>
          {!saved && runEditPerms.data && (
            <Button
              variant="outlined"
              size="small"
              onClick={onBackToRunning}
            >
              {isMobileNativePlatform() ? "Back" : "Back to steps"}
            </Button>
          )}
          {!saved && runEditPerms.time && (
            <Button
              variant="outlined"
              size="small"
              onClick={onOpenTimeEditor}
            >
              Adjust time
            </Button>
          )}
          {saved && signoffReviewMode && signatureStatus === "PendingInstaller" && runEditPerms.time && (
            <Button
              variant="outlined"
              size="small"
              onClick={onOpenTimeEditor}
            >
              Adjust time
            </Button>
          )}
        </Stack>
        {saved && signoffReviewMode && signatureStatus === "PendingInstaller" ? (
          <Button
            variant="contained"
            size={isMobileNativePlatform() ? "small" : "medium"}
            onClick={onContinueToInstallerSign}
          >
            Continue to sign-off
          </Button>
        ) : !saved && (
          <>
            {(primaryBlockingIssue || hasMissingCaptures) && (
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {primaryBlockingIssue && (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    disabled={saving}
                    startIcon={<ReportProblemOutlined sx={{ fontSize: 16 }} />}
                    sx={{ minWidth: 0, flex: isMobileNativePlatform() ? "1 1 auto" : undefined, fontSize: "0.75rem", px: 1 }}
                    onClick={onResolveBlockingIssue}
                  >
                    {isMobileNativePlatform()
                      ? (blockingIssues.length === 1 ? "Resolve Issue" : "Resolve Issues")
                      : (blockingIssues.length === 1 ? "Resolve Blocking Issue" : "Resolve Blocking Issues")}
                  </Button>
                )}
                {hasMissingCaptures && (
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    disabled={saving}
                    startIcon={<PhotoCameraOutlined sx={{ fontSize: 16 }} />}
                    sx={{ minWidth: 0, flex: isMobileNativePlatform() ? "1 1 auto" : undefined, fontSize: "0.75rem", px: 1 }}
                    onClick={onJumpToMissingCapture}
                  >
                    {isMobileNativePlatform() ? "Add Photos" : "Add Missing Photos"}
                  </Button>
                )}
              </Stack>
            )}
            <Stack
              direction="row"
              spacing={0.75}
              justifyContent={isMobileNativePlatform() ? "stretch" : "flex-end"}
              sx={{ width: "100%" }}
            >
              {(hasBlockingIssues || hasMissingCaptures) && Boolean(activeRunId) && (
                <Button
                  variant="outlined"
                  color="warning"
                  size={isMobileNativePlatform() ? "small" : "medium"}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={14} /> : undefined}
                  sx={{ flex: isMobileNativePlatform() ? 1 : undefined, minWidth: 0, fontSize: isMobileNativePlatform() ? "0.75rem" : undefined }}
                  onClick={onSaveAndClose}
                >
                  Save & close
                </Button>
              )}
              <Button
                variant="contained"
                size={isMobileNativePlatform() ? "small" : "medium"}
                sx={{ flex: isMobileNativePlatform() ? 1 : undefined, minWidth: 0, fontSize: isMobileNativePlatform() ? "0.75rem" : undefined }}
                onClick={onLockRun}
                disabled={saving || (Boolean(activeRunId) && (hasBlockingIssues || hasMissingCaptures))}
                startIcon={saving ? <CircularProgress size={14} /> : undefined}
              >
                {saving ? "Saving..." : activeRunId ? "Lock run" : "Done (preview)"}
              </Button>
            </Stack>
          </>
        )}
      </DialogActions>
    </>
  );
}
