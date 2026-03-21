import { useState } from "react";
import {
  Box, Button, Stack, Alert, Chip, CircularProgress,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import BomStepHeader from "../components/BomStepHeader";
import ColumnMapper from "../components/ColumnMapper";
import { useBomProject } from "../store/BomProjectContext";
import { normalizeAllRows } from "../services/bomNormalizer";

export default function BomMappingPage() {
  const { id } = useParams<{ id: string }>();
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstSheet = state.parsedWorkbook?.sheets[0];
  const sampleRows = firstSheet?.sampleRows ?? [];

  if (state.rawRows.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Alert severity="warning" sx={{ mb: 2, maxWidth: 480, mx: "auto" }}>
          Session data not found. Please start from the dashboard and re-upload your file.
        </Alert>
        <Button variant="outlined" onClick={() => navigate("/admin/bom-project")}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  const mappedCount = state.activeMappings.filter((m) => m.canonicalField).length;
  const totalCount = state.activeMappings.length;
  const allMapped = mappedCount === totalCount;

  const handleNext = async () => {
    setSaving(true);
    setError(null);
    try {
      const normalized = normalizeAllRows(state.rawRows, state.activeMappings);
      dispatch({ type: "SET_NORMALIZED_ROWS", payload: normalized });
      navigate(`/admin/bom-project/imports/${id}/classification`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <BomStepHeader
        activeStep={1}
        title="Map your columns"
        subtitle="Tell us which column in your file matches each field. Auto-detected matches are shown below."
      />

      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <Chip
          label={allMapped ? "All columns matched" : `${mappedCount} of ${totalCount} matched`}
          color={allMapped ? "success" : "default"}
          size="small"
        />
        {!allMapped && (
          <Chip
            label={`${totalCount - mappedCount} unmatched — you can skip these`}
            size="small"
            variant="outlined"
            color="warning"
          />
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <ColumnMapper
        mappings={state.activeMappings}
        sampleRows={sampleRows}
        onChange={(m) => dispatch({ type: "SET_MAPPINGS", payload: m })}
      />

      <Stack direction="row" justifyContent="flex-end" spacing={1} mt={3}>
        <Button onClick={() => navigate(-1)}>Back</Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={saving || mappedCount === 0}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? "Processing…" : "Next: Review Items →"}
        </Button>
      </Stack>
    </Box>
  );
}
