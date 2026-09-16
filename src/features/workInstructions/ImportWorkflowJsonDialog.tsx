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
import { UploadOutlined } from "@mui/icons-material";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowExportDocument } from "../../types/workflowExportSchema";
import type { WorkflowImportValidation } from "../../types/workflowImportValidation";
import type { WorkflowImportBlocked } from "../../types/syncFeatureSteps";
import type { ProductFeatureDefinition } from "../../types/product";
import type { FeatureSelection } from "../../services/productConfigService";
import { workflowConfigService } from "../../services/workflowConfigService";

export interface ImportWorkflowJsonDialogProps {
  /** The parsed candidate import document — dialog is open whenever this is non-null. */
  doc: WorkflowExportDocument | null;
  onClose: () => void;
  configId: string;
  /** For rendering feature names (the import file only carries featureId) in the Current vs
   *  Imported quantity comparison. Optional — omitting it just skips that table. */
  productFeatures?: ProductFeatureDefinition[];
  /** This Draft's quantities BEFORE the import, for the same comparison. */
  currentFeatureSelections?: FeatureSelection[];
  /** Called once, after a successful import, with the freshly re-fetched config. */
  onImported: (config: WorkflowConfig) => void;
}

type Phase = "validating" | "summary" | "importing" | "error" | "blocked";

function extractErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return msg ?? fallback;
}

/** A blocked-import (409) response carries {message, blockedSteps} rather than the plain
 *  {message} shape every other error uses — distinguish it so the dialog can show which
 *  step(s)/run(s) are actually blocking, not just a generic message. */
function extractBlocked(err: unknown): WorkflowImportBlocked | null {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (response?.status !== 409) return null;
  const data = response.data as Partial<WorkflowImportBlocked> | undefined;
  if (!data || !Array.isArray(data.blockedSteps)) return null;
  return { message: data.message ?? "Import cannot proceed.", blockedSteps: data.blockedSteps };
}

/**
 * WF-6C Builder UI for importing a reusable workflow JSON (WF-1 schema). Server-authoritative,
 * mirroring WF-5's preview/apply pattern: validation is read-only and never persists; the real
 * import call re-validates independently rather than trusting this dialog's cached validation.
 * Does not silently accept a cross-product file — a product mismatch renders as invalid and the
 * Import button stays disabled.
 */
export function ImportWorkflowJsonDialog({ doc, onClose, configId, productFeatures = [], currentFeatureSelections = [], onImported }: ImportWorkflowJsonDialogProps) {
  const [phase, setPhase] = useState<Phase>("validating");
  const [validation, setValidation] = useState<WorkflowImportValidation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<WorkflowImportBlocked | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    setPhase("validating");
    setErrorMessage(null);

    workflowConfigService.validateImportWorkflow(configId, doc)
      .then((res) => {
        if (cancelled) return;
        setValidation(res);
        setPhase("summary");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(extractErrorMessage(err, "Could not validate the import file. Please try again."));
        setPhase("error");
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, configId]);

  async function handleImport() {
    if (!doc) return;
    setPhase("importing");
    try {
      // The server re-validates from scratch here — this dialog's earlier validation is never
      // passed along or trusted as sufficient on its own. Import is all-or-nothing: either this
      // succeeds and config is the fully-applied result, or nothing was persisted at all.
      const config = await workflowConfigService.importWorkflow(configId, doc);
      onImported(config);
      onClose();
    } catch (err) {
      const blockedResult = extractBlocked(err);
      if (blockedResult) {
        setBlocked(blockedResult);
        setPhase("blocked");
        return;
      }
      setErrorMessage(extractErrorMessage(err, "Import failed. Please try again."));
      setPhase("error");
    }
  }

  return (
    <Dialog open={!!doc} onClose={phase === "importing" ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <UploadOutlined color="primary" />
          <span>Import Workflow JSON</span>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {phase === "validating" && (
          <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
            <CircularProgress size={22} />
          </Stack>
        )}

        {phase === "error" && <Alert severity="error">{errorMessage}</Alert>}

        {phase === "blocked" && blocked && (
          <Stack spacing={1.5}>
            <Alert severity="error">{blocked.message}</Alert>
            <Typography variant="body2" color="text.secondary">
              Nothing was imported — this file's changes were rejected in full, not partially applied.
            </Typography>
            <Stack spacing={1} divider={<Divider flexItem />}>
              {blocked.blockedSteps.map((step) => (
                <Stack key={step.stepId} spacing={0.25}>
                  <Typography variant="body2">{step.title}</Typography>
                  {step.blockingRuns && step.blockingRuns.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Reason: active run {step.blockingRuns.map((r) => r.runId).join(", ")}
                    </Typography>
                  )}
                </Stack>
              ))}
            </Stack>
          </Stack>
        )}

        {phase === "importing" && (
          <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">Importing…</Typography>
          </Stack>
        )}

        {phase === "summary" && validation && doc && (
          <Stack spacing={1.5}>
            <QuantityComparisonTable
              productFeatures={productFeatures}
              current={currentFeatureSelections}
              imported={doc.featureSelections}
            />
            <Alert severity="info" sx={{ fontSize: 12 }}>
              Importing this reusable workflow will replace this Draft's Feature quantities with the quantities contained in the imported workflow.
            </Alert>
            {!validation.valid && (
              <Alert severity="warning">
                {!validation.schemaVersionSupported
                  ? "Unsupported file version."
                  : !validation.productMatches
                    ? "This file is for a different product and cannot be imported here."
                    : validation.duplicateFeatureIds.length > 0
                      ? "This file selects the same feature more than once."
                      : "Some feature or dependency references in this file are unknown."}
              </Alert>
            )}
            <Row label="Product" value={validation.productName || validation.productId} />
            <Row label="Feature references" value={`${validation.featureReferencesMatched}/${validation.featureReferencesTotal} matched`} />
            <Row label="Dependency references" value={`${validation.dependencyReferencesMatched}/${validation.dependencyReferencesTotal} matched`} />
            <Row label="Custom steps" value={String(validation.customStepCount)} />
            <Row label="Generated steps to reconstruct" value={String(validation.generatedStepsToReconstruct)} />
            <Row label="Unknown features" value={String(validation.unknownFeatureIds.length)} error={validation.unknownFeatureIds.length > 0} />
            <Row label="Unknown dependencies" value={String(validation.unknownDependencyIds.length)} error={validation.unknownDependencyIds.length > 0} />
            <Row label="Duplicate feature selections" value={String(validation.duplicateFeatureIds.length)} error={validation.duplicateFeatureIds.length > 0} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {phase === "summary" && (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" startIcon={<UploadOutlined />} onClick={handleImport} disabled={!validation?.valid}>
              Import
            </Button>
          </>
        )}
        {(phase === "error" || phase === "blocked") && <Button onClick={onClose}>Close</Button>}
        {(phase === "validating" || phase === "importing") && <Button disabled>Please wait…</Button>}
      </DialogActions>
    </Dialog>
  );
}

/** IMPORT UX CLARITY: a plain Current-vs-Imported Feature quantity table, shown before the user
 *  confirms — so a quantity change is always seen, never silently applied. Features present in
 *  either side (current or imported) are listed; a Feature untouched by the import (same quantity
 *  on both sides) still shows, so "nothing changes for X" is visible too, not just the diffs. */
function QuantityComparisonTable({
  productFeatures,
  current,
  imported,
}: {
  productFeatures: ProductFeatureDefinition[];
  current: FeatureSelection[];
  imported: { featureId: string; quantity: number }[];
}) {
  const nameFor = (featureId: string) => productFeatures.find((f) => f.id === featureId)?.name ?? featureId;
  const currentQty = new Map(current.map((s) => [s.featureId, s.activeCount]));
  const importedQty = new Map(imported.map((s) => [s.featureId, s.quantity]));
  const featureIds = Array.from(new Set([...currentQty.keys(), ...importedQty.keys()]))
    .sort((a, b) => nameFor(a).localeCompare(nameFor(b)));

  if (featureIds.length === 0) return null;

  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        Import Workflow
      </Typography>
      <Stack spacing={0.25}>
        <Stack direction="row" sx={{ px: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>Feature</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ width: 64, textAlign: "right" }}>Current</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ width: 64, textAlign: "right" }}>Imported</Typography>
        </Stack>
        {featureIds.map((featureId) => {
          const cur = currentQty.get(featureId) ?? 0;
          const imp = importedQty.get(featureId) ?? 0;
          const changed = cur !== imp;
          return (
            <Stack key={featureId} direction="row" sx={{ px: 0.5, py: 0.25, bgcolor: changed ? "action.hover" : undefined, borderRadius: 0.5 }}>
              <Typography variant="body2" sx={{ flexGrow: 1, fontSize: 13 }}>{nameFor(featureId)}</Typography>
              <Typography variant="body2" sx={{ width: 64, textAlign: "right", fontSize: 13, color: "text.secondary" }}>{cur}</Typography>
              <Typography variant="body2" sx={{ width: 64, textAlign: "right", fontSize: 13, fontWeight: changed ? 700 : 400 }}>{imp}</Typography>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}

function Row({ label, value, error }: { label: string; value: string; error?: boolean }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Chip size="small" color={error ? "error" : "default"} label={value} />
    </Stack>
  );
}

export default ImportWorkflowJsonDialog;
