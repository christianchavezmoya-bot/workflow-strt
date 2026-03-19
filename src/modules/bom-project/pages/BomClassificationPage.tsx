import { useEffect, useState } from "react";
import {
  Box, Typography, Button, Stack, Alert, Paper, Table, TableBody,
  TableCell, TableHead, TableRow, Chip, Select, MenuItem, FormControl,
  CircularProgress, Tooltip,
} from "@mui/material";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { useNavigate, useParams } from "react-router-dom";
import { useBomProject } from "../store/BomProjectContext";
import { classifyAllRows } from "../services/bomClassifier";
import { generateDraftProject } from "../services/bomProjectGenerator";
import { bomApiService } from "../services/bomApiService";
import type { ClassificationRule, ItemType } from "../types/classification";
import RulesEditor from "../components/RulesEditor";

const ITEM_TYPES: ItemType[] = ["asset", "component", "consumable", "reference", "ignore"];

const TYPE_COLOR: Record<ItemType, "success" | "primary" | "warning" | "default" | "error"> = {
  asset: "success",
  component: "primary",
  consumable: "warning",
  reference: "default",
  ignore: "default",
};

export default function BomClassificationPage() {
  const { id } = useParams<{ id: string }>();
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [customRules, setCustomRules] = useState<ClassificationRule[]>([]);

  // Auto-classify on mount if not yet classified
  useEffect(() => {
    if (state.normalizedRows.length > 0 && state.classifications.length === 0) {
      const cls = classifyAllRows(state.normalizedRows, customRules, id ?? "");
      dispatch({ type: "SET_CLASSIFICATIONS", payload: cls });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.normalizedRows, state.classifications.length, dispatch, id]);

  const handleApplyRules = (rules: ClassificationRule[]) => {
    setCustomRules(rules);
    const cls = classifyAllRows(state.normalizedRows, rules, id ?? "");
    dispatch({ type: "SET_CLASSIFICATIONS", payload: cls });
  };

  const handleSaveRuleProfile = async (name: string, rules: ClassificationRule[]) => {
    await bomApiService.saveRuleProfile({ name, rules });
  };

  const classMap = new Map(state.classifications.map((c) => [c.sourceRowId, c]));

  const overrideType = (sourceRowId: string, itemType: ItemType) => {
    const existing = classMap.get(sourceRowId);
    if (!existing) return;
    dispatch({
      type: "OVERRIDE_CLASSIFICATION",
      payload: { ...existing, itemType, isManualOverride: true },
    });
  };

  const handleNext = async () => {
    setGenerating(true);
    setError(null);
    try {
      const draft = generateDraftProject({
        importRunId: id ?? "",
        projectName: state.activeRun?.fileName.replace(/\.[^.]+$/, "") ?? "New Project",
        rows: state.normalizedRows,
        classifications: state.classifications,
      });
      dispatch({ type: "SET_DRAFT", payload: draft });
      navigate(`/admin/bom-project/imports/${id}/compare`);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const counts = ITEM_TYPES.reduce((acc, t) => {
    acc[t] = state.classifications.filter((c) => c.itemType === t).length;
    return acc;
  }, {} as Record<ItemType, number>);

  if (state.normalizedRows.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Alert severity="warning" sx={{ mb: 2, maxWidth: 480, mx: "auto" }}>
          Session data not found. Please start from the dashboard and complete column mapping first.
        </Alert>
        <Button variant="outlined" onClick={() => navigate("/admin/bom-project")}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Classification</Typography>
          <Typography variant="body2" color="text.secondary">
            Review and override how each BOM row is classified before generating assets.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          {ITEM_TYPES.map((t) => (
            <Chip key={t} label={`${counts[t]} ${t}`} size="small" color={TYPE_COLOR[t]} variant="outlined" />
          ))}
          <Button
            size="small"
            variant="outlined"
            startIcon={<TuneOutlinedIcon />}
            onClick={() => setRulesOpen(true)}
          >
            Rules{customRules.length > 0 ? ` (${customRules.length})` : ""}
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Part No.</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell>Group</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Inventory</TableCell>
              <TableCell>Serial</TableCell>
              <TableCell>Confidence</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.normalizedRows.map((row) => {
              const cl = classMap.get(row.sourceRowId);
              return (
                <TableRow key={row.sourceRowId} hover>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{row.rowIndex}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">{row.partNumber ?? "—"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={row.description}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{row.description}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right"><Typography variant="caption">{row.qty ?? "—"}</Typography></TableCell>
                  <TableCell><Typography variant="caption">{row.groupName ?? "—"}</Typography></TableCell>
                  <TableCell>
                    <FormControl size="small">
                      <Select
                        value={cl?.itemType ?? "component"}
                        onChange={(e) => overrideType(row.sourceRowId, e.target.value as ItemType)}
                        sx={{ fontSize: "0.75rem", minWidth: 110 }}
                      >
                        {ITEM_TYPES.map((t) => (
                          <MenuItem key={t} value={t}>{t}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {cl?.isManualOverride && (
                      <Chip label="Override" color="warning" size="small" sx={{ ml: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={cl?.inventoryTracked ? "Yes" : "No"}
                      size="small"
                      color={cl?.inventoryTracked ? "success" : "default"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={cl?.serialRequired ? "Yes" : "No"}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      color={
                        (cl?.confidenceScore ?? 0) >= 0.8
                          ? "success.main"
                          : (cl?.confidenceScore ?? 0) >= 0.5
                          ? "warning.main"
                          : "error.main"
                      }
                    >
                      {cl ? `${Math.round(cl.confidenceScore * 100)}%` : "—"}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Stack direction="row" justifyContent="flex-end" spacing={1} mt={2}>
        <Button onClick={() => navigate(-1)}>Back</Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={generating || state.classifications.length === 0}
          startIcon={generating ? <CircularProgress size={16} /> : undefined}
        >
          {generating ? "Generating…" : "Generate Draft & Compare →"}
        </Button>
      </Stack>

      <RulesEditor
        open={rulesOpen}
        initialRules={customRules}
        onClose={() => setRulesOpen(false)}
        onApply={handleApplyRules}
        onSaveProfile={handleSaveRuleProfile}
      />
    </Box>
  );
}
