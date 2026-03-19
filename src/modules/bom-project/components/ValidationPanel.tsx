import {
  Box, Typography, Accordion, AccordionSummary, AccordionDetails,
  Alert, AlertTitle, Chip, Stack,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import type { ValidationResult, ValidationIssue } from "../types/validation";

interface Props {
  result: ValidationResult;
  onQuickAction?: (issueId: string, action: string) => void;
}

function IssueList({ issues, severity }: { issues: ValidationIssue[]; severity: "error" | "warning" | "info" }) {
  if (!issues.length) return null;
  return (
    <Stack spacing={0.5}>
      {issues.map((issue) => (
        <Alert key={issue.id} severity={severity} sx={{ py: 0.5 }}>
          <AlertTitle sx={{ mb: 0, fontSize: "0.8rem" }}>{issue.code}</AlertTitle>
          <Typography variant="caption">{issue.message}</Typography>
          {issue.suggestion && (
            <Typography variant="caption" display="block" color="text.secondary">
              💡 {issue.suggestion}
            </Typography>
          )}
        </Alert>
      ))}
    </Stack>
  );
}

export default function ValidationPanel({ result, onQuickAction }: Props) {
  if (!result.isBlockingPublish && result.warnings.length === 0 && result.errors.length === 0) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 2, bgcolor: "success.lighter", borderRadius: 1 }}>
        <CheckCircleOutlineIcon color="success" />
        <Typography color="success.dark" fontWeight={500}>All validation checks passed — ready to publish.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
        {result.errors.length > 0 && <Chip label={`${result.errors.length} Errors`} color="error" size="small" />}
        {result.warnings.length > 0 && <Chip label={`${result.warnings.length} Warnings`} color="warning" size="small" />}
        {result.infos.length > 0 && <Chip label={`${result.infos.length} Info`} size="small" />}
        {result.isBlockingPublish && <Chip label="Publish Blocked" color="error" variant="outlined" size="small" />}
      </Stack>

      {result.errors.length > 0 && (
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600} color="error.main">Errors — must be resolved before publish</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <IssueList issues={result.errors} severity="error" />
          </AccordionDetails>
        </Accordion>
      )}

      {result.warnings.length > 0 && (
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600} color="warning.dark">Warnings — can proceed with acknowledgement</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <IssueList issues={result.warnings} severity="warning" />
          </AccordionDetails>
        </Accordion>
      )}

      {result.infos.length > 0 && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600} color="text.secondary">Info</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <IssueList issues={result.infos} severity="info" />
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
}
