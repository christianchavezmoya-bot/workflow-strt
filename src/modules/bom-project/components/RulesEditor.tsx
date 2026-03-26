/**
 * RulesEditor.tsx
 * Visual dialog for building and managing BOM classification rules.
 * Rules are saved as RuleProfiles via the API and can be applied on classification.
 */
import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import type { ClassificationRule, ItemType, RuleCondition } from "../types/classification";
import type { CanonicalBomRow } from "../types/canonicalBom";

type ConditionField = keyof CanonicalBomRow;

const CONDITION_FIELDS: { value: ConditionField; label: string }[] = [
  { value: "partNumber",   label: "Part Number"  },
  { value: "description",  label: "Description"  },
  { value: "groupName",    label: "Group Name"   },
  { value: "vehicleType",  label: "Vehicle Type" },
  { value: "unit",         label: "Unit of Measure" },
];

const OPERATORS: { value: RuleCondition["operator"]; label: string }[] = [
  { value: "contains",    label: "contains"     },
  { value: "startsWith",  label: "starts with"  },
  { value: "endsWith",    label: "ends with"    },
  { value: "equals",      label: "equals"       },
  { value: "notEquals",   label: "not equals"   },
  { value: "isNull",      label: "is empty"     },
  { value: "isNotNull",   label: "is not empty" },
];

const ITEM_TYPES: ItemType[] = ["asset", "component", "consumable", "reference", "ignore"];

const TYPE_COLOR: Record<ItemType, "success" | "primary" | "warning" | "default" | "error"> = {
  asset: "success",
  component: "primary",
  consumable: "warning",
  reference: "default",
  ignore: "default",
};

function emptyCondition(): RuleCondition {
  return { field: "description", operator: "contains", value: "" };
}

function emptyRule(): ClassificationRule {
  return {
    id: `rule-${Date.now()}`,
    priority: 10,
    description: "",
    conditions: [emptyCondition()],
    result: { itemType: "component", inventoryTracked: false, serialRequired: false },
  };
}

interface Props {
  open: boolean;
  initialRules: ClassificationRule[];
  onClose: () => void;
  onApply: (rules: ClassificationRule[]) => void;
  onSaveProfile: (name: string, rules: ClassificationRule[]) => Promise<void>;
}

export default function RulesEditor({ open, initialRules, onClose, onApply, onSaveProfile }: Props) {
  const [rules, setRules] = useState<ClassificationRule[]>(initialRules);
  const [profileName, setProfileName] = useState("");
  const [saving, setSaving] = useState(false);

  const addRule = () => setRules((prev) => [...prev, emptyRule()]);

  const removeRule = (id: string) =>
    setRules((prev) => prev.filter((r) => r.id !== id));

  const updateRule = (id: string, patch: Partial<ClassificationRule>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const updateCondition = (ruleId: string, idx: number, patch: Partial<RuleCondition>) =>
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, conditions: r.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }
          : r
      )
    );

  const addCondition = (ruleId: string) =>
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId ? { ...r, conditions: [...r.conditions, emptyCondition()] } : r
      )
    );

  const removeCondition = (ruleId: string, idx: number) =>
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId ? { ...r, conditions: r.conditions.filter((_, i) => i !== idx) } : r
      )
    );

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    setSaving(true);
    try {
      await onSaveProfile(profileName.trim(), rules);
      setProfileName("");
    } finally {
      setSaving(false);
    }
  };

  const needsValue = (op: RuleCondition["operator"]) =>
    op !== "isNull" && op !== "isNotNull";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h6">Classification Rules Editor</Typography>
            <Typography variant="caption" color="text.secondary">
              Rules are evaluated top-to-bottom. Higher priority (lower number) wins.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddOutlinedIcon />}
            onClick={addRule}
          >
            Add rule
          </Button>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {rules.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <Typography color="text.disabled">
              No rules yet. Click "Add rule" to create one.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {rules
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((rule) => (
                <Box
                  key={rule.id}
                  sx={{
                    p: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  {/* Rule header */}
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                    <TextField
                      size="small"
                      label="Priority"
                      type="number"
                      value={rule.priority}
                      onChange={(e) =>
                        updateRule(rule.id, { priority: Number(e.target.value) || 0 })
                      }
                      sx={{ width: 80 }}
                      inputProps={{ min: 1, max: 999 }}
                    />
                    <TextField
                      size="small"
                      label="Rule description"
                      fullWidth
                      value={rule.description}
                      onChange={(e) => updateRule(rule.id, { description: e.target.value })}
                      placeholder="e.g. Classify modules as assets"
                    />
                    <Tooltip title="Remove rule">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeRule(rule.id)}
                      >
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>

                  {/* Conditions */}
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                    IF (all conditions match):
                  </Typography>
                  <Stack spacing={1} sx={{ mb: 1.5, pl: 1 }}>
                    {rule.conditions.map((cond, idx) => (
                      <Stack key={idx} direction="row" spacing={1} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                          <InputLabel shrink>Field</InputLabel>
                          <Select
                            label="Field"
                            value={cond.field}
                            onChange={(e) =>
                              updateCondition(rule.id, idx, {
                                field: e.target.value as ConditionField,
                              })
                            }
                          >
                            {CONDITION_FIELDS.map((f) => (
                              <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 130 }}>
                          <InputLabel shrink>Operator</InputLabel>
                          <Select
                            label="Operator"
                            value={cond.operator}
                            onChange={(e) =>
                              updateCondition(rule.id, idx, {
                                operator: e.target.value as RuleCondition["operator"],
                              })
                            }
                          >
                            {OPERATORS.map((op) => (
                              <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {needsValue(cond.operator) && (
                          <TextField
                            size="small"
                            label="Value"
                            sx={{ flex: 1 }}
                            value={String(cond.value ?? "")}
                            onChange={(e) =>
                              updateCondition(rule.id, idx, { value: e.target.value })
                            }
                            placeholder="e.g. MOD, Cable, ..."
                          />
                        )}

                        {rule.conditions.length > 1 && (
                          <Tooltip title="Remove condition">
                            <IconButton
                              size="small"
                              onClick={() => removeCondition(rule.id, idx)}
                            >
                              <DeleteOutlineOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}

                        {idx === rule.conditions.length - 1 && (
                          <Button size="small" onClick={() => addCondition(rule.id)}>
                            + AND
                          </Button>
                        )}
                      </Stack>
                    ))}
                  </Stack>

                  {/* Result */}
                  <Divider sx={{ mb: 1.5 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                    THEN classify as:
                  </Typography>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ pl: 1 }}>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel shrink>Item type</InputLabel>
                      <Select
                        label="Item type"
                        value={rule.result.itemType ?? "component"}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            result: { ...rule.result, itemType: e.target.value as ItemType },
                          })
                        }
                      >
                        {ITEM_TYPES.map((t) => (
                          <MenuItem key={t} value={t}>
                            <Chip
                              label={t}
                              size="small"
                              color={TYPE_COLOR[t]}
                              variant="outlined"
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel shrink>Inventory</InputLabel>
                      <Select
                        label="Inventory"
                        value={rule.result.inventoryTracked ? "yes" : "no"}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            result: { ...rule.result, inventoryTracked: e.target.value === "yes" },
                          })
                        }
                      >
                        <MenuItem value="yes">Tracked</MenuItem>
                        <MenuItem value="no">Not tracked</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel shrink>Serial</InputLabel>
                      <Select
                        label="Serial"
                        value={rule.result.serialRequired ? "yes" : "no"}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            result: { ...rule.result, serialRequired: e.target.value === "yes" },
                          })
                        }
                      >
                        <MenuItem value="yes">Required</MenuItem>
                        <MenuItem value="no">Not required</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                </Box>
              ))}
          </Stack>
        )}
      </DialogContent>

      {/* Save as profile */}
      <Box sx={{ px: 3, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            label="Save as profile"
            placeholder="Profile name…"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={saving ? undefined : <SaveOutlinedIcon />}
            disabled={saving || !profileName.trim() || rules.length === 0}
            onClick={handleSaveProfile}
          >
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </Stack>
      </Box>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => { onApply(rules); onClose(); }}
          disabled={rules.length === 0}
        >
          Apply rules & re-classify
        </Button>
      </DialogActions>
    </Dialog>
  );
}
