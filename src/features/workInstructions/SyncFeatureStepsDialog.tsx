import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { SyncOutlined } from "@mui/icons-material";
import type { WorkflowStep } from "../../types/workflow";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { SyncFeatureStepItem, SyncFeatureStepsResult } from "../../types/syncFeatureSteps";
import { workflowConfigService } from "../../services/workflowConfigService";

export interface SyncFeatureStepsDialogProps {
  open: boolean;
  onClose: () => void;
  configId: string;
  /** Current Builder workflow steps — used only to resolve already-existing field ids to
   *  human-readable labels for display. The preview/diff itself is always computed server-side;
   *  there is no client-side reconciliation engine. */
  steps: WorkflowStep[];
  /** Called once, after a successful sync, with the freshly re-fetched config — the caller should
   *  use this (not any client-side rebuild) to refresh Builder state. Never called on error or
   *  cancel. */
  onSynced: (config: WorkflowConfig) => void;
}

type Phase = "loading" | "preview" | "syncing" | "result" | "error";

const SECTION_ORDER: { key: keyof SyncFeatureStepsResult; label: string; color: "success" | "info" | "error" | "default" }[] = [
  { key: "added", label: "Added", color: "success" },
  { key: "updated", label: "Updated", color: "info" },
  { key: "removed", label: "Removed", color: "error" },
  { key: "blocked", label: "Blocked", color: "error" },
  { key: "unchanged", label: "Unchanged", color: "default" },
];

function extractErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return msg ?? fallback;
}

function buildFieldLabelMap(steps: WorkflowStep[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const step of steps) {
    for (const cf of step.captureFields ?? []) map[cf.id] = cf.label;
    for (const inp of step.inputs ?? []) map[inp.id] = inp.label;
  }
  return map;
}

/** Resolves field ids to labels where known; ids the caller can't yet resolve (e.g. a field the
 *  preview proposes adding, which doesn't exist anywhere yet) collapse into a trailing count
 *  rather than showing a raw internal id. */
function describeFields(ids: string[] | null | undefined, labelById: Record<string, string>): string | null {
  if (!ids || ids.length === 0) return null;
  const resolved: string[] = [];
  let unresolvedCount = 0;
  for (const id of ids) {
    const label = labelById[id];
    if (label) resolved.push(label);
    else unresolvedCount += 1;
  }
  const parts = [...resolved];
  if (unresolvedCount > 0) parts.push(`${unresolvedCount} more field${unresolvedCount > 1 ? "s" : ""}`);
  return parts.join(", ");
}

/**
 * WF-5 Builder UI for WF-4's Sync Feature Steps. Deliberately separate from "Regenerate Workflow"
 * (buildAutoSteps), which remains untouched: that action fully replaces all steps client-side from
 * the legacy FeatureSelection[] model, whereas this one surgically reconciles only
 * stepOrigin: "feature-generated" content, and the server is the ONLY place that diff is computed
 * — both the preview shown here and the real apply call POST_the server's
 * /sync-feature-steps/preview and /sync-feature-steps actions respectively, sharing one
 * reconciliation implementation server-side. There is no client-side reconciliation engine: a
 * second diff implementation in the frontend could drift from the server's, and the frontend has
 * no way to evaluate run-safety (AssetWorkflowRun data) on its own.
 *
 * Flow: on open, call the preview endpoint (read-only, zero persistence) and render its
 * authoritative response. On confirm, call the real apply endpoint exactly once — which
 * recomputes the diff from scratch server-side rather than trusting the earlier preview, since
 * run/config state can change in between — then re-fetch the config to resolve any newly-added
 * field ids to labels and hand the caller the authoritative refreshed config via onSynced.
 */
export function SyncFeatureStepsDialog({ open, onClose, configId, steps, onSynced }: SyncFeatureStepsDialogProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<SyncFeatureStepsResult | null>(null);
  const [result, setResult] = useState<SyncFeatureStepsResult | null>(null);
  const [fieldLabelById, setFieldLabelById] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("loading");
    setResult(null);
    setErrorMessage(null);
    setFieldLabelById(buildFieldLabelMap(steps));

    workflowConfigService.previewSyncFeatureSteps(configId)
      .then((res) => {
        if (cancelled) return;
        setPreview(res);
        setPhase("preview");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(extractErrorMessage(err, "Could not load the sync preview. Please try again."));
        setPhase("error");
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, configId]);

  async function handleConfirm() {
    setPhase("syncing");
    try {
      // The one real apply call — the server recomputes the diff independently here, it does not
      // reuse `preview`.
      const syncResult = await workflowConfigService.syncFeatureSteps(configId);
      setResult(syncResult);

      // Refresh from the server — resolves any newly-added field ids to labels for this view, and
      // hands the caller the authoritative post-sync config. Never rebuilt client-side.
      const freshConfig = await workflowConfigService.getById(configId);
      if (freshConfig) {
        try {
          const parsed = JSON.parse(freshConfig.stepsJson);
          const freshSteps: WorkflowStep[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.steps) ? parsed.steps : [];
          setFieldLabelById(buildFieldLabelMap(freshSteps));
        } catch { /* keep existing labels if stepsJson is unexpectedly malformed */ }
        onSynced(freshConfig);
      }

      setPhase("result");
    } catch (err) {
      // Existing workflow state is untouched — onSynced is never called on this path.
      setErrorMessage(extractErrorMessage(err, "Sync failed. Please try again."));
      setPhase("error");
    }
  }

  const counts = preview && {
    add: preview.added.length,
    update: preview.updated.length,
    remove: preview.removed.length,
    unchanged: preview.unchanged.length,
  };

  return (
    <Dialog open={open} onClose={phase === "syncing" ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SyncOutlined color="primary" />
          <span>Sync Feature Steps</span>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {phase === "loading" && (
          <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
            <CircularProgress size={22} />
          </Stack>
        )}

        {phase === "error" && <Alert severity="error">{errorMessage}</Alert>}

        {phase === "preview" && preview && counts && (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              This reconciles feature-generated steps (from Feature quantities/dependencies) only.
              Preparation, test &amp; acceptance, inspection, return-to-service and other custom steps
              are never affected. This preview is computed by the server and reflects run-safety
              blocking as of right now — confirming re-checks it again at that moment.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" color="success" label={`${counts.add} to add`} />
              <Chip size="small" color="info" label={`${counts.update} to update`} />
              <Chip size="small" color="error" label={`${counts.remove} to remove`} />
              <Chip size="small" label={`${counts.unchanged} unchanged`} />
            </Stack>
            <SyncResultSections result={preview} fieldLabelById={fieldLabelById} />
          </Stack>
        )}

        {phase === "syncing" && (
          <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">Syncing…</Typography>
          </Stack>
        )}

        {phase === "result" && result && <SyncResultSections result={result} fieldLabelById={fieldLabelById} />}
      </DialogContent>
      <DialogActions>
        {phase === "preview" && (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" startIcon={<SyncOutlined />} onClick={handleConfirm}>
              Confirm &amp; Sync
            </Button>
          </>
        )}
        {phase === "error" && <Button onClick={onClose}>Close</Button>}
        {phase === "result" && (
          <Button variant="contained" onClick={onClose}>Done</Button>
        )}
        {(phase === "loading" || phase === "syncing") && (
          <Button disabled>Please wait…</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function SyncResultSections({ result, fieldLabelById }: { result: SyncFeatureStepsResult; fieldLabelById: Record<string, string> }) {
  const anyItems = SECTION_ORDER.some((s) => result[s.key].length > 0);
  if (!anyItems) {
    return <Typography variant="body2" color="text.secondary">Nothing to reconcile — no changes.</Typography>;
  }

  return (
    <Stack spacing={2}>
      {SECTION_ORDER.map((section) => {
        const items = result[section.key];
        if (items.length === 0) return null;

        // Collapsed by default — a large unit count should read as one line, not a wall of rows.
        if (section.key === "unchanged") {
          return (
            <Stack key={section.key} direction="row" alignItems="center" spacing={1}>
              <Chip size="small" color={section.color} label={items.length} sx={{ height: 18, fontSize: 10 }} />
              <Typography variant="body2" color="text.secondary">
                {items.length} generated step{items.length === 1 ? "" : "s"} unchanged
              </Typography>
            </Stack>
          );
        }

        return (
          <Stack key={section.key} spacing={0.75}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2">{section.label}</Typography>
              <Chip size="small" color={section.color} label={items.length} sx={{ height: 18, fontSize: 10 }} />
            </Stack>
            <Stack spacing={1} divider={<Divider flexItem />}>
              {items.map((item) => (
                <SyncResultRow key={item.stepId} item={item} fieldLabelById={fieldLabelById} />
              ))}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}

function SyncResultRow({ item, fieldLabelById }: { item: SyncFeatureStepItem; fieldLabelById: Record<string, string> }) {
  const applied = describeFields(item.appliedFieldIds, fieldLabelById);
  const blocked = describeFields(item.blockedFieldIds, fieldLabelById);
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">{item.title}</Typography>
      {applied && <Typography variant="caption" color="success.main">Added: {applied}</Typography>}
      {blocked && <Typography variant="caption" color="error.main">Blocked removal: {blocked}</Typography>}
      {item.blockingRuns && item.blockingRuns.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          Reason: active run {item.blockingRuns.map((r) => r.runId).join(", ")}
        </Typography>
      )}
    </Stack>
  );
}

export default SyncFeatureStepsDialog;
