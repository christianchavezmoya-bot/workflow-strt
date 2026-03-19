/**
 * BomComparisonPage.tsx
 * The central 3-panel review screen:
 *   Left  — Uploaded BOM source rows
 *   Center — Generated app output (tabbed)
 *   Right — Classification / schema rules for the selected row
 */
import { useState } from "react";
import {
  Box, Typography, Button, Stack, Paper, Alert, Divider,
  CircularProgress,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import SourceBomGrid from "../components/SourceBomGrid";
import GeneratedOutputPanel from "../components/GeneratedOutputPanel";
import SchemaRulesPanel from "../components/SchemaRulesPanel";
import ComparisonFilters from "../components/ComparisonFilters";
import ValidationPanel from "../components/ValidationPanel";
import { useBomProject } from "../store/BomProjectContext";
import { validateImport } from "../services/bomValidationService";
import { bomApiService } from "../services/bomApiService";
import type { CenterTab } from "../store/comparisonState";

export default function BomComparisonPage() {
  const { id } = useParams<{ id: string }>();
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classMap = new Map(state.classifications.map((c) => [c.sourceRowId, c]));

  const selectedClassification = state.comparison.selectedSourceRowId
    ? classMap.get(state.comparison.selectedSourceRowId)
    : undefined;

  const handleRowClick = (rowId: string) => {
    dispatch({
      type: "SET_COMPARISON",
      payload: { selectedSourceRowId: rowId },
    });
    // In the center panel, highlight assets that produced this row
    if (state.draftProject) {
      const matchingAsset = state.draftProject.assets.find((a) =>
        a.sourceRowIds.includes(rowId)
      );
      if (matchingAsset) {
        dispatch({
          type: "SET_COMPARISON",
          payload: { selectedGeneratedNodeId: matchingAsset.draftAssetId, activeCenterTab: "assets" },
        });
      }
    }
  };

  const handleValidateAndNext = async () => {
    if (!state.draftProject) return;
    setValidating(true);
    setError(null);
    try {
      const result = validateImport(
        id ?? "",
        state.normalizedRows,
        state.classifications,
        state.draftProject
      );
      dispatch({ type: "SET_VALIDATION", payload: result });

      // Persist validation server-side
      await bomApiService.saveValidationResult(id ?? "", result);
      await bomApiService.saveDraft(id ?? "", state.draftProject);

      navigate(`/admin/bom-project/imports/${id}/preview`);
    } catch (e) {
      setError(String(e));
    } finally {
      setValidating(false);
    }
  };

  if (!state.draftProject) {
    return (
      <Box p={4} textAlign="center">
        <Typography color="text.secondary">No draft generated yet. Go back to classification.</Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate(-1)}>Back</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 180px)" }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>BOM Comparison Review</Typography>
          <Typography variant="body2" color="text.secondary">
            Compare uploaded BOM rows with the generated output before publish.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => navigate(-1)}>Back</Button>
          <Button
            variant="contained"
            onClick={handleValidateAndNext}
            disabled={validating}
            startIcon={validating ? <CircularProgress size={16} /> : undefined}
          >
            {validating ? "Validating…" : "Validate & Preview →"}
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {/* Filter bar */}
      <ComparisonFilters
        state={state.comparison}
        onChange={(patch) => dispatch({ type: "SET_COMPARISON", payload: patch })}
      />

      {/* 3-panel layout */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", gap: 1, flex: 1, mt: 1, overflow: "hidden" }}>
        {/* LEFT — Source BOM */}
        <Paper variant="outlined" sx={{ overflow: "hidden", display: "flex", flexDirection: "column", p: 1 }}>
          <SourceBomGrid
            rows={state.normalizedRows}
            classifications={classMap}
            selectedRowId={state.comparison.selectedSourceRowId}
            onRowClick={handleRowClick}
            showUnmatchedOnly={state.comparison.showUnmatchedOnly}
          />
        </Paper>

        {/* CENTER — Generated Output */}
        <Paper variant="outlined" sx={{ overflow: "hidden", display: "flex", flexDirection: "column", p: 1 }}>
          <GeneratedOutputPanel
            draft={state.draftProject}
            validationResult={state.validationResult ?? undefined}
            activeTab={state.comparison.activeCenterTab}
            onTabChange={(tab: CenterTab) => dispatch({ type: "SET_COMPARISON", payload: { activeCenterTab: tab } })}
            selectedGeneratedNodeId={state.comparison.selectedGeneratedNodeId}
            onNodeClick={(nodeId) => dispatch({ type: "SET_COMPARISON", payload: { selectedGeneratedNodeId: nodeId } })}
          />
        </Paper>

        {/* RIGHT — Schema Rules */}
        <Paper variant="outlined" sx={{ overflow: "auto", p: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} mb={1}>
            Classification Rules
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <SchemaRulesPanel
            classification={selectedClassification}
            selectedRuleId={state.comparison.selectedRuleId}
            allClassifications={state.classifications}
            onRuleClick={(ruleId) => dispatch({ type: "SET_COMPARISON", payload: { selectedRuleId: ruleId } })}
          />
        </Paper>
      </Box>
    </Box>
  );
}
