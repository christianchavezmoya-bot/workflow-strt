import {
  Box, Typography, Stack, Chip, Paper, Divider,
  LinearProgress, Tooltip,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import type { ClassificationResult } from "../types/classification";

interface Props {
  classification?: ClassificationResult;
  selectedRuleId?: string;
  allClassifications: ClassificationResult[];
  onRuleClick?: (ruleId: string) => void;
}

function Flag({ label, value }: { label: string; value: boolean }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      {value ? (
        <CheckCircleOutlineIcon fontSize="small" color="success" />
      ) : (
        <CancelOutlinedIcon fontSize="small" color="disabled" />
      )}
      <Typography variant="caption" color={value ? "text.primary" : "text.disabled"}>
        {label}
      </Typography>
    </Stack>
  );
}

export default function SchemaRulesPanel({ classification, selectedRuleId, allClassifications, onRuleClick }: Props) {
  if (!classification) {
    return (
      <Box p={2} color="text.secondary">
        <Typography variant="body2">Select a row to see classification details.</Typography>
      </Box>
    );
  }

  const sameRuleCount = allClassifications.filter(
    (c) => c.ruleSource === classification.ruleSource
  ).length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 1 }}>
      {/* Item type */}
      <Box>
        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
          Classification
        </Typography>
        <Chip
          label={classification.itemType.toUpperCase()}
          color={classification.itemType === "asset" ? "success" : classification.itemType === "ignore" ? "default" : "primary"}
          size="small"
        />
        {classification.isManualOverride && (
          <Chip label="Manual Override" color="warning" size="small" sx={{ ml: 0.5 }} />
        )}
      </Box>

      {/* Confidence */}
      <Box>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Confidence: {Math.round(classification.confidenceScore * 100)}%
        </Typography>
        <LinearProgress
          variant="determinate"
          value={classification.confidenceScore * 100}
          color={
            classification.confidenceScore >= 0.8
              ? "success"
              : classification.confidenceScore >= 0.5
              ? "warning"
              : "error"
          }
          sx={{ height: 6, borderRadius: 3 }}
        />
      </Box>

      {/* Flags */}
      <Box>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          Behavior Flags
        </Typography>
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack spacing={0.5}>
            <Flag label="Inventory Tracked" value={classification.inventoryTracked} />
            <Flag label="Serial Required" value={classification.serialRequired} />
            <Flag label="Configurable" value={classification.configurable} />
            <Flag label="Install Required" value={classification.installRequired} />
            <Flag label="Test Required" value={classification.testRequired} />
            <Flag label="Photo Required" value={classification.photoRequired} />
          </Stack>
        </Paper>
      </Box>

      {/* Rule source */}
      {classification.ruleSource && (
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
            Rule Source
          </Typography>
          <Tooltip title={`${sameRuleCount} rows use this rule`}>
            <Chip
              label={classification.ruleSource}
              variant="outlined"
              size="small"
              onClick={() => onRuleClick?.(classification.ruleSource!)}
              sx={{ cursor: onRuleClick ? "pointer" : "default" }}
            />
          </Tooltip>
          <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
            Affects {sameRuleCount} rows
          </Typography>
        </Box>
      )}

      {/* Grouping */}
      {(classification.workflowGroup || classification.parentPartNumber) && (
        <Box>
          <Divider sx={{ mb: 1 }} />
          {classification.workflowGroup && (
            <Typography variant="caption" display="block">
              Workflow Group: <strong>{classification.workflowGroup}</strong>
            </Typography>
          )}
          {classification.parentPartNumber && (
            <Typography variant="caption" display="block">
              Parent Part: <strong>{classification.parentPartNumber}</strong>
            </Typography>
          )}
          {classification.dependencySource && (
            <Typography variant="caption" display="block">
              Dependency Source: <strong>{classification.dependencySource}</strong>
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
