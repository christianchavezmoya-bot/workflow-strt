import {
  Box, Typography, Button, Stack, Alert, Paper,
  Divider, Chip,
} from "@mui/material";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useNavigate, useParams } from "react-router-dom";
import { useBomProject } from "../store/BomProjectContext";
import ValidationPanel from "../components/ValidationPanel";
import AssetPreviewCard from "../components/AssetPreviewCard";

export default function BomPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useBomProject();
  const navigate = useNavigate();

  const { draftProject: draft, validationResult } = state;

  if (!draft) {
    return (
      <Box p={4} textAlign="center">
        <Typography color="text.secondary">No draft available.</Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate(-1)}>Back</Button>
      </Box>
    );
  }

  const canPublish = !validationResult?.isBlockingPublish;

  const totalComponents = draft.assets.reduce((s, a) => s + a.components.length, 0);
  const totalShortages = draft.assets.reduce(
    (s, a) => s + a.components.filter((c) => c.differenceQty !== undefined && c.differenceQty < 0).length,
    0
  );

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Preview & Validate</Typography>
          <Typography variant="body2" color="text.secondary">
            Review the final project structure before committing.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => navigate(-1)}>Back</Button>
          <Button
            variant="contained"
            color={canPublish ? "primary" : "error"}
            onClick={() => navigate(`/admin/bom-project/imports/${id}/commit`)}
            disabled={!canPublish && validationResult !== null}
          >
            {canPublish ? "Proceed to Commit →" : "Resolve Errors First"}
          </Button>
        </Stack>
      </Stack>

      {/* Validation summary banner */}
      {validationResult && (
        <Box mb={3}>
          {canPublish ? (
            <Alert icon={<CheckCircleOutlineIcon />} severity="success">
              Validation passed — ready to publish.
            </Alert>
          ) : (
            <Alert icon={<WarningAmberOutlinedIcon />} severity="error">
              {validationResult.errors.length} error(s) must be resolved before publishing.
            </Alert>
          )}
        </Box>
      )}

      {/* Summary KPIs */}
      <Box display="grid" gridTemplateColumns="repeat(4, 1fr)" gap={2} mb={3}>
        {[
          { label: "Assets", value: draft.assets.length },
          { label: "Components", value: totalComponents },
          { label: "Features", value: draft.assets.reduce((s, a) => s + a.features.length, 0) },
          { label: "Shortages", value: totalShortages, highlight: totalShortages > 0 },
        ].map(({ label, value, highlight }) => (
          <Paper key={label} variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h4" fontWeight={700} color={highlight ? "warning.main" : "text.primary"}>
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Asset cards */}
      <Typography variant="subtitle1" fontWeight={600} mb={1}>
        Assets to be Created
      </Typography>
      <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(260px, 1fr))" gap={2} mb={3}>
        {draft.assets.map((asset) => (
          <AssetPreviewCard key={asset.draftAssetId} asset={asset} />
        ))}
      </Box>

      {/* Validation panel */}
      {validationResult && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle1" fontWeight={600} mb={1}>Validation Report</Typography>
          <ValidationPanel result={validationResult} />
        </>
      )}
    </Box>
  );
}
