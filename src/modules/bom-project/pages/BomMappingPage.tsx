import { useState } from "react";
import {
  Box, Typography, Button, Stack, Alert, Divider,
  TextField, Chip, CircularProgress,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { useNavigate, useParams } from "react-router-dom";
import ColumnMapper from "../components/ColumnMapper";
import { useBomProject } from "../store/BomProjectContext";
import { normalizeAllRows } from "../services/bomNormalizer";
import { bomApiService } from "../services/bomApiService";

export default function BomMappingPage() {
  const { id } = useParams<{ id: string }>();
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");

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

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    try {
      await bomApiService.saveMappingProfile({
        name: profileName.trim(),
        mappings: state.activeMappings,
      });
      setProfileName("");
    } catch (e) {
      setError(String(e));
    }
  };

  const mappedCount = state.activeMappings.filter((m) => m.canonicalField).length;
  const totalCount = state.activeMappings.length;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Column Mapping</Typography>
          <Typography variant="body2" color="text.secondary">
            Map your spreadsheet columns to the canonical BOM fields.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={`${mappedCount} / ${totalCount} mapped`}
            color={mappedCount === totalCount ? "success" : "default"}
            size="small"
          />
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <ColumnMapper
        mappings={state.activeMappings}
        sampleRows={sampleRows}
        onChange={(m) => dispatch({ type: "SET_MAPPINGS", payload: m })}
      />

      <Divider sx={{ my: 3 }} />

      {/* Save profile */}
      <Stack direction="row" spacing={1} alignItems="center" mb={3}>
        <TextField
          size="small"
          label="Save as profile"
          placeholder="Profile name…"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<SaveOutlinedIcon />}
          onClick={handleSaveProfile}
          disabled={!profileName.trim()}
        >
          Save Profile
        </Button>
      </Stack>

      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button onClick={() => navigate(-1)}>Back</Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={saving || mappedCount === 0}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? "Normalizing…" : "Normalize & Classify →"}
        </Button>
      </Stack>
    </Box>
  );
}
