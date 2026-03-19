import { Box, Paper, Typography, Stack, Chip, Divider, Alert } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import type { CommitResult } from "../services/bomCommitService";

interface Props {
  result: CommitResult;
}

export default function CommitSummary({ result }: Props) {
  const isPublish = result.mode === "publish";
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} mb={2}>
        <CheckCircleOutlineIcon color="success" />
        <Typography variant="h6" fontWeight={600}>
          {isPublish ? "Published Successfully" : result.mode === "draft" ? "Draft Saved" : "Preview Complete"}
        </Typography>
        <Chip label={result.mode.toUpperCase()} color={isPublish ? "success" : "default"} size="small" />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1}>
          <Row label="Assets Created" value={result.assetsCreated} />
          <Row label="Components Allocated" value={result.componentsAllocated} />
          <Row label="Workflows Assigned" value={result.workflowsAssigned} />
          <Row label="Inventory Reserved" value={result.inventoryReserved} />
          <Row label="Shortage Records" value={result.shortagesCreated} highlight={result.shortagesCreated > 0} />
          {result.publishedProjectId && (
            <>
              <Divider />
              <Row label="Project ID" value={result.publishedProjectId} />
            </>
          )}
        </Stack>
      </Paper>

      {result.warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          <Typography variant="subtitle2">Warnings</Typography>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {result.warnings.map((w, i) => (
              <li key={i}><Typography variant="caption">{w}</Typography></li>
            ))}
          </ul>
        </Alert>
      )}

      {result.errors.length > 0 && (
        <Alert severity="error">
          <Typography variant="subtitle2">Errors</Typography>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {result.errors.map((e, i) => (
              <li key={i}><Typography variant="caption">{e}</Typography></li>
            ))}
          </ul>
        </Alert>
      )}
    </Box>
  );
}

function Row({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600} color={highlight ? "warning.main" : "text.primary"}>
        {value}
      </Typography>
    </Stack>
  );
}
