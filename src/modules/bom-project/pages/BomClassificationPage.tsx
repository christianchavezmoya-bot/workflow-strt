import { useEffect, useRef, useState } from "react";
import {
  Box, Button, Stack, Alert, Paper, Table, TableBody,
  TableCell, TableHead, TableRow, Chip, Select, MenuItem,
  FormControl, CircularProgress, Typography, Tooltip, TextField,
  InputAdornment,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { useNavigate, useParams } from "react-router-dom";
import BomStepHeader from "../components/BomStepHeader";
import { useBomProject } from "../store/BomProjectContext";
import { classifyAllRows } from "../services/bomClassifier";
import { generateDraftProject } from "../services/bomProjectGenerator";
import type { CanonicalBomRow } from "../types/canonicalBom";
import type { ItemType } from "../types/classification";

const ITEM_TYPES: ItemType[] = ["asset", "component", "consumable", "ignore"];

const TYPE_COLOR: Record<string, "success" | "primary" | "warning" | "default"> = {
  asset: "success",
  component: "primary",
  consumable: "warning",
  ignore: "default",
  reference: "default",
};

const TYPE_LABEL: Record<string, string> = {
  asset: "Asset",
  component: "Component",
  consumable: "Consumable",
  ignore: "Ignore",
};

// ── Inline editable cell ─────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  onCommit: (val: string) => void;
  placeholder?: string;
  numeric?: boolean;
  width?: number;
}

function EditableCell({ value, onCommit, placeholder, numeric, width = 140 }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft.trim());
  };

  if (editing) {
    return (
      <TextField
        inputRef={inputRef}
        value={draft}
        size="small"
        type={numeric ? "number" : "text"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        sx={{ width, "& .MuiInputBase-input": { fontSize: "0.8rem", py: 0.5, px: 0.75 } }}
        autoFocus
      />
    );
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      onClick={start}
      sx={{
        cursor: "text", minWidth: width * 0.6, maxWidth: width,
        px: 0.5, py: 0.25, borderRadius: 1,
        "&:hover": { background: "rgba(255,255,255,0.06)" },
        "&:hover .edit-icon": { opacity: 1 },
      }}
    >
      <Typography
        variant="body2"
        noWrap
        sx={{ flex: 1, fontSize: "0.8rem", color: value ? "text.primary" : "text.disabled" }}
      >
        {value || placeholder || "—"}
      </Typography>
      <EditOutlinedIcon
        className="edit-icon"
        sx={{ fontSize: 12, opacity: 0, color: "text.disabled", flexShrink: 0 }}
      />
    </Stack>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BomClassificationPage() {
  const { id } = useParams<{ id: string }>();
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Auto-classify on mount
  useEffect(() => {
    if (state.normalizedRows.length > 0 && state.classifications.length === 0) {
      const cls = classifyAllRows(state.normalizedRows, [], id ?? "");
      dispatch({ type: "SET_CLASSIFICATIONS", payload: cls });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.normalizedRows, state.classifications.length, dispatch, id]);

  if (state.normalizedRows.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Alert severity="warning" sx={{ mb: 2, maxWidth: 480, mx: "auto" }}>
          Session data not found. Please complete column mapping first.
        </Alert>
        <Button variant="outlined" onClick={() => navigate("/admin/bom-project")}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  const classMap = new Map(state.classifications.map((c) => [c.sourceRowId, c]));

  const updateRow = (sourceRowId: string, patch: Partial<CanonicalBomRow>) => {
    dispatch({ type: "UPDATE_NORMALIZED_ROW", payload: { sourceRowId, ...patch } });
  };

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
      navigate(`/admin/bom-project/imports/${id}/commit`);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const assetCount     = state.classifications.filter((c) => c.itemType === "asset").length;
  const componentCount = state.classifications.filter((c) => c.itemType === "component").length;
  const ignoredCount   = state.classifications.filter((c) => c.itemType === "ignore" || c.itemType === "reference").length;
  const editedCount    = state.classifications.filter((c) => c.isManualOverride).length;

  return (
    <Box>
      <BomStepHeader
        activeStep={2}
        title="Review items"
        subtitle="Check types and edit any field — click a cell to change it."
      />

      {/* Summary chips */}
      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
        <Chip label={`${assetCount} assets`} color="success" size="small" />
        <Chip label={`${componentCount} components`} color="primary" size="small" variant="outlined" />
        {ignoredCount > 0 && <Chip label={`${ignoredCount} ignored`} size="small" variant="outlined" />}
        {editedCount > 0 && <Chip label={`${editedCount} overrides`} color="warning" size="small" variant="outlined" />}
        <Chip
          label="Click any cell to edit"
          size="small"
          variant="outlined"
          icon={<EditOutlinedIcon sx={{ fontSize: "12px !important" }} />}
          sx={{ color: "text.disabled", borderColor: "divider" }}
        />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell><Typography variant="caption" fontWeight={700}>Part Number</Typography></TableCell>
              <TableCell><Typography variant="caption" fontWeight={700}>Description</Typography></TableCell>
              <TableCell><Typography variant="caption" fontWeight={700}>Group / Machine ID</Typography></TableCell>
              <TableCell align="right"><Typography variant="caption" fontWeight={700}>Qty</Typography></TableCell>
              <TableCell align="right"><Typography variant="caption" fontWeight={700}>Unit Price</Typography></TableCell>
              <TableCell><Typography variant="caption" fontWeight={700}>Type</Typography></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.normalizedRows.map((row) => {
              const cl = classMap.get(row.sourceRowId);
              const itemType = cl?.itemType ?? "component";
              return (
                <TableRow key={row.sourceRowId} hover>
                  <TableCell>
                    <EditableCell
                      value={row.partNumber ?? ""}
                      placeholder="add part no."
                      onCommit={(v) => updateRow(row.sourceRowId, { partNumber: v })}
                      width={130}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Click to edit" placement="top-start">
                      <Box>
                        <EditableCell
                          value={row.description}
                          placeholder="add description"
                          onCommit={(v) => updateRow(row.sourceRowId, { description: v })}
                          width={260}
                        />
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      value={row.groupName ?? ""}
                      placeholder="add machine ID / group"
                      onCommit={(v) => updateRow(row.sourceRowId, { groupName: v })}
                      width={160}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <EditableCell
                      value={row.qty != null ? String(row.qty) : ""}
                      placeholder="—"
                      numeric
                      onCommit={(v) => updateRow(row.sourceRowId, { qty: v ? Number(v) : undefined })}
                      width={60}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <EditableCell
                      value={row.costUnit != null ? String(row.costUnit) : ""}
                      placeholder="—"
                      numeric
                      onCommit={(v) => updateRow(row.sourceRowId, { costUnit: v ? Number(v) : undefined })}
                      width={80}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <FormControl size="small">
                        <Select
                          value={itemType}
                          onChange={(e) => overrideType(row.sourceRowId, e.target.value as ItemType)}
                          sx={{ fontSize: "0.75rem", minWidth: 120 }}
                          renderValue={(val) => (
                            <Chip
                              label={TYPE_LABEL[val] ?? val}
                              size="small"
                              color={TYPE_COLOR[val] ?? "default"}
                              sx={{ height: 20, fontSize: "0.68rem" }}
                            />
                          )}
                        >
                          {ITEM_TYPES.map((t) => (
                            <MenuItem key={t} value={t}>
                              <Chip label={TYPE_LABEL[t]} size="small" color={TYPE_COLOR[t]} sx={{ height: 20, fontSize: "0.68rem" }} />
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      {cl?.isManualOverride && (
                        <Tooltip title="Type manually overridden">
                          <Chip label="edited" size="small" color="warning" variant="outlined" sx={{ height: 16, fontSize: "0.6rem" }} />
                        </Tooltip>
                      )}
                    </Stack>
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
          disabled={generating || assetCount === 0}
          startIcon={generating ? <CircularProgress size={16} /> : undefined}
        >
          {generating ? "Building project…" : "Next: Create Project →"}
        </Button>
      </Stack>
      {assetCount === 0 && state.classifications.length > 0 && (
        <Typography variant="caption" color="warning.main" display="block" textAlign="right" mt={0.5}>
          At least one row must be classified as "Asset" to continue.
        </Typography>
      )}
    </Box>
  );
}
