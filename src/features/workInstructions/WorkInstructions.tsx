import { useEffect, useMemo, useState } from "react";
import {
  AddOutlined,
  ArrowBackOutlined,
  BuildOutlined,
  DeleteOutline,
  EditOutlined,
  FormatListBulletedOutlined,
  LinkOutlined,
  SettingsOutlined,
  TuneOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Rating,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import TableConfigDialog from "../../components/TableConfigDialog";
import { useTableConfig } from "../../hooks/useTableConfig";
import { demoProducts } from "../../data/demo";
import { workInstructionService } from "../../services/workInstructionService";
import { productConfigService, type FeatureSelection, type ProductConfig } from "../../services/productConfigService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import type { WorkInstruction, WorkInstructionInput, WorkInstructionStatus } from "../../types/workInstruction";
import WorkflowBuilder from "./WorkflowBuilder";

// ------------------------------------------------------------------
// Work Instructions Settings (localStorage-backed preferences)
// ------------------------------------------------------------------

const WI_SETTINGS_KEY = "wi_settings_v1";

interface WiSettings {
  defaultStatus: WorkInstructionStatus;
  showFeatureTargeting: boolean;
}

function loadWiSettings(): WiSettings {
  try {
    const raw = localStorage.getItem(WI_SETTINGS_KEY);
    if (raw) return { defaultStatus: "Draft", showFeatureTargeting: true, ...JSON.parse(raw) };
  } catch {}
  return { defaultStatus: "Draft", showFeatureTargeting: true };
}

function saveWiSettings(s: WiSettings) {
  try { localStorage.setItem(WI_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// ------------------------------------------------------------------
// Table config field definitions for the instruction card view
// ------------------------------------------------------------------

const WI_TABLE_FIELDS = [
  { id: "title", name: "Title", fieldType: "text" },
  { id: "status", name: "Status", fieldType: "text" },
  { id: "steps", name: "Step count", fieldType: "number" },
  { id: "summary", name: "Summary", fieldType: "text" },
  { id: "updatedAt", name: "Last updated", fieldType: "date" },
] as const;

const emptyForm: WorkInstructionInput = {
  title: "",
  summary: "",
  steps: [""],
  status: "Draft",
  featureValues: {}
};

// ------------------------------------------------------------------
// Config form state
// ------------------------------------------------------------------

interface ConfigFormState {
  name: string;
  status: string;
  notes: string;
  featureSelections: FeatureSelection[];
}

const emptyConfigForm = (): ConfigFormState => ({
  name: "",
  status: "Draft",
  notes: "",
  featureSelections: [],
});

// ------------------------------------------------------------------
// WorkInstructions component
// ------------------------------------------------------------------

const WorkInstructions = () => {
  const dispatch = useAppDispatch();
  const productsState = useAppSelector((state) => state.products);
  const [tab, setTab] = useState(0);
  const [settingsMenu, setSettingsMenu] = useState<HTMLElement | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const [wiSettingsOpen, setWiSettingsOpen] = useState(false);
  const [wiSettings, setWiSettings] = useState<WiSettings>(loadWiSettings);
  const [wiSettingsDraft, setWiSettingsDraft] = useState<WiSettings>(loadWiSettings);
  const [instructions, setInstructions] = useState<WorkInstruction[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkInstructionInput>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkInstructionStatus | "All">("All");
  const [error, setError] = useState<string | null>(null);

  // View mode — now 3 modes
  const [viewMode, setViewMode] = useState<"instructions" | "configurations" | "builder">("instructions");

  // Configurations state
  const [configs, setConfigs] = useState<ProductConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ProductConfig | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(emptyConfigForm());
  const [configError, setConfigError] = useState<string | null>(null);

  const { config: tableConfig, setConfig: setTableConfig } = useTableConfig(
    "work_instructions_v1",
    WI_TABLE_FIELDS as unknown as Parameters<typeof useTableConfig>[1]
  );
  const isHidden = (fieldId: string) => tableConfig.hidden.includes(fieldId);

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items]
  );

  useEffect(() => {
    if (tab >= products.length) {
      setTab(Math.max(0, products.length - 1));
    }
  }, [tab, products.length]);

  const activeProduct = products[tab];
  const activeFeatures = activeProduct?.features || [];

  // Reset view when switching product tabs
  useEffect(() => {
    setViewMode("instructions");
    setSelectedConfigId(null);
  }, [activeProduct?.id]);

  // Load instructions
  const loadInstructions = async (productId?: string) => {
    if (!productId) { setInstructions([]); return; }
    const data = await workInstructionService.listByProduct(productId);
    setInstructions(data);
  };

  useEffect(() => {
    loadInstructions(activeProduct?.id);
  }, [activeProduct?.id]);

  // Load configs
  useEffect(() => {
    if (!activeProduct?.id) { setConfigs([]); return; }
    productConfigService.listByProduct(activeProduct.id).then(setConfigs);
  }, [activeProduct?.id]);

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === selectedConfigId) ?? null,
    [configs, selectedConfigId]
  );

  // ------------------------------------------------------------------
  // Instruction CRUD
  // ------------------------------------------------------------------

  const visibleInstructions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return instructions.filter((item) => {
      if (statusFilter !== "All" && item.status !== statusFilter) return false;
      if (!query) return true;
      return (
        item.title.toLowerCase().includes(query) ||
        (item.summary || "").toLowerCase().includes(query) ||
        item.steps.some((step) => step.toLowerCase().includes(query))
      );
    });
  }, [instructions, search, statusFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      status: wiSettings.defaultStatus,
      featureValues: Object.fromEntries(activeFeatures.map((f) => [f.id, ""]))
    });
    setDialogOpen(true);
  };

  const openEdit = (item: WorkInstruction) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      summary: item.summary || "",
      steps: item.steps.length ? item.steps : [""],
      status: item.status,
      featureValues: {
        ...Object.fromEntries(activeFeatures.map((f) => [f.id, ""])),
        ...item.featureValues
      }
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  };

  const saveInstruction = async () => {
    if (!activeProduct) return;
    const title = form.title.trim();
    const steps = form.steps.map((s) => s.trim()).filter(Boolean);
    if (!title) { setError("Title is required."); return; }
    if (!steps.length) { setError("Add at least one step."); return; }
    const payload: WorkInstructionInput = {
      title, summary: form.summary?.trim() || undefined,
      steps, status: form.status, featureValues: form.featureValues
    };
    if (editingId) {
      await workInstructionService.update(editingId, payload);
    } else {
      await workInstructionService.create(activeProduct.id, payload);
    }
    await loadInstructions(activeProduct.id);
    closeDialog();
  };

  const deleteInstruction = async (id: string) => {
    if (!activeProduct) return;
    await workInstructionService.remove(id);
    await loadInstructions(activeProduct.id);
  };

  // ------------------------------------------------------------------
  // Config CRUD
  // ------------------------------------------------------------------

  const openCreateConfig = () => {
    setEditingConfig(null);
    setConfigForm({
      name: "",
      status: "Draft",
      notes: "",
      featureSelections: activeFeatures.map((f) => ({ featureId: f.id, included: false, activeCount: 0 })),
    });
    setConfigError(null);
    setConfigDialogOpen(true);
  };

  const openEditConfig = (cfg: ProductConfig) => {
    setEditingConfig(cfg);
    // Merge existing selections with current product features
    const selMap = new Map(cfg.featureSelections.map((s) => [s.featureId, s]));
    setConfigForm({
      name: cfg.name,
      status: cfg.status,
      notes: cfg.notes ?? "",
      featureSelections: activeFeatures.map((f) => selMap.get(f.id) ?? { featureId: f.id, included: false, activeCount: 0 }),
    });
    setConfigError(null);
    setConfigDialogOpen(true);
  };

  const closeConfigDialog = () => {
    setConfigDialogOpen(false);
    setEditingConfig(null);
    setConfigError(null);
  };

  const saveConfig = async () => {
    if (!activeProduct) return;
    const name = configForm.name.trim();
    if (!name) { setConfigError("Name is required."); return; }
    try {
      if (editingConfig) {
        const updated = await productConfigService.update(editingConfig.id, {
          name,
          productId: activeProduct.id,
          status: configForm.status,
          notes: configForm.notes.trim() || undefined,
          featureSelections: configForm.featureSelections,
        });
        setConfigs((prev) => prev.map((c) => (c.id === editingConfig.id ? updated : c)));
      } else {
        const created = await productConfigService.create({
          name,
          productId: activeProduct.id,
          status: configForm.status,
          notes: configForm.notes.trim() || undefined,
          featureSelections: configForm.featureSelections,
        });
        setConfigs((prev) => [created, ...prev]);
      }
      closeConfigDialog();
    } catch {
      setConfigError("Failed to save configuration.");
    }
  };

  const deleteConfig = async (cfg: ProductConfig) => {
    if (!activeProduct) return;
    if (!confirm(`Delete configuration "${cfg.name}"? This cannot be undone.`)) return;
    await productConfigService.remove(cfg.id, activeProduct.id);
    setConfigs((prev) => prev.filter((c) => c.id !== cfg.id));
    if (selectedConfigId === cfg.id) setSelectedConfigId(null);
  };

  // Called by WorkflowBuilder when a brand-new template is first persisted
  const handleTemplateSaved = async (templateId: string) => {
    if (!selectedConfigId) return;
    try {
      const updated = await productConfigService.update(selectedConfigId, { workflowTemplateId: templateId });
      setConfigs((prev) => prev.map((c) => (c.id === selectedConfigId ? updated : c)));
    } catch {
      // non-fatal — the template was saved, the config link just didn't update
      console.warn("[WorkInstructions] failed to link template to config");
    }
  };

  const openBuilder = (cfg: ProductConfig) => {
    setSelectedConfigId(cfg.id);
    setViewMode("builder");
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Work Instructions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create and manage work instructions by product.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            onChange={(_, next) => { if (next) setViewMode(next); }}
          >
            <ToggleButton value="instructions">
              <FormatListBulletedOutlined fontSize="small" sx={{ mr: 0.75 }} />
              Instructions
            </ToggleButton>
            <ToggleButton value="configurations">
              <TuneOutlined fontSize="small" sx={{ mr: 0.75 }} />
              Configurations
            </ToggleButton>
            <ToggleButton value="builder">
              <BuildOutlined fontSize="small" sx={{ mr: 0.75 }} />
              Builder
            </ToggleButton>
          </ToggleButtonGroup>
          {viewMode === "instructions" && (
            <Button variant="contained" startIcon={<AddOutlined />} onClick={openCreate} disabled={!activeProduct}>
              Create work instruction
            </Button>
          )}
          {viewMode === "configurations" && (
            <Button variant="contained" startIcon={<AddOutlined />} onClick={openCreateConfig} disabled={!activeProduct}>
              New configuration
            </Button>
          )}
          <IconButton
            size="small"
            onMouseEnter={(event) => { setSettingsMenu(event.currentTarget); setSettingsMenuOpen(true); }}
            onClick={(event) => { setSettingsMenu(event.currentTarget); setSettingsMenuOpen(true); }}
          >
            <SettingsOutlined fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {/* Product tabs */}
      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="scrollable" allowScrollButtonsMobile scrollButtons="auto">
          {products.map((product) => (
            <Tab key={product.id} label={product.name} />
          ))}
        </Tabs>
      </Paper>

      {/* ── Configurations view ── */}
      {viewMode === "configurations" && (
        <Paper className="glass-card" sx={{ p: 2.5 }}>
          {!activeProduct ? (
            <Typography color="text.secondary">No products found.</Typography>
          ) : configs.length === 0 ? (
            <Alert severity="info">
              No configurations yet. Click "New configuration" to create the first asset type for {activeProduct.name}.
            </Alert>
          ) : (
            <Stack spacing={1.5}>
              {configs.map((cfg) => {
                const includedCount = cfg.featureSelections.filter((s) => s.included).length;
                return (
                  <Paper key={cfg.id} variant="outlined" sx={{ p: 2 }}>
                    <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" spacing={1.5}>
                      <Stack spacing={0.5}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="subtitle2">{cfg.name}</Typography>
                          <Chip
                            size="small"
                            label={cfg.status}
                            color={cfg.status === "Active" ? "success" : cfg.status === "Archived" ? "default" : "warning"}
                          />
                          {includedCount > 0 && (
                            <Chip size="small" variant="outlined" label={`${includedCount} feature${includedCount === 1 ? "" : "s"}`} />
                          )}
                          {cfg.workflowTemplateId && (
                            <Chip size="small" icon={<LinkOutlined sx={{ fontSize: 12 }} />} label="Workflow linked" color="primary" variant="outlined" />
                          )}
                        </Stack>
                        {cfg.notes && (
                          <Typography variant="caption" color="text.secondary">{cfg.notes}</Typography>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={0.75} flexShrink={0}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<BuildOutlined />}
                          onClick={() => openBuilder(cfg)}
                        >
                          Open Builder
                        </Button>
                        <IconButton size="small" onClick={() => openEditConfig(cfg)}>
                          <EditOutlined fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => deleteConfig(cfg)}>
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Paper>
      )}

      {/* ── Builder view ── */}
      {viewMode === "builder" && activeProduct && (
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Button
              size="small"
              startIcon={<ArrowBackOutlined />}
              onClick={() => setViewMode(selectedConfig ? "configurations" : "instructions")}
            >
              {selectedConfig ? "Back to Configurations" : "Back to Instructions"}
            </Button>
            {selectedConfig && (
              <Typography variant="body2" color="text.secondary">
                / {selectedConfig.name}
              </Typography>
            )}
          </Stack>
          <WorkflowBuilder
            productId={activeProduct.id}
            productName={activeProduct.name}
            productFeatures={activeFeatures}
            initialTemplateId={selectedConfig?.workflowTemplateId ?? undefined}
            configName={selectedConfig?.name}
            onTemplateSaved={handleTemplateSaved}
          />
        </Stack>
      )}

      {/* ── Instructions view ── */}
      <Paper
        className="glass-card"
        sx={{ p: 2.5, display: viewMode !== "instructions" ? "none" : undefined }}
      >
        {!activeProduct ? (
          <Typography color="text.secondary">No products found. Create a product in Admin to generate tabs here.</Typography>
        ) : (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <TextField
                size="small"
                label="Search instructions"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                sx={{ minWidth: 280 }}
              />
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <Select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as WorkInstructionStatus | "All")}
                >
                  <MenuItem value="All">All statuses</MenuItem>
                  <MenuItem value="Draft">Draft</MenuItem>
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Archived">Archived</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Stack spacing={1.25}>
              {visibleInstructions.map((item) => (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    alignItems={{ xs: "flex-start", md: "center" }}
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="subtitle2">{item.title}</Typography>
                        {!isHidden("status") && (
                          <Chip size="small" label={item.status} color={item.status === "Active" ? "success" : "default"} />
                        )}
                      </Stack>
                      {!isHidden("summary") && item.summary && (
                        <Typography variant="body2" color="text.secondary">{item.summary}</Typography>
                      )}
                      {(!isHidden("steps") || !isHidden("updatedAt")) && (
                        <Typography variant="caption" color="text.secondary">
                          {!isHidden("steps") && `${item.steps.length} step${item.steps.length === 1 ? "" : "s"}`}
                          {!isHidden("steps") && !isHidden("updatedAt") && " - "}
                          {!isHidden("updatedAt") && `Updated ${new Date(item.updatedAt).toLocaleString()}`}
                        </Typography>
                      )}
                    </Stack>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton size="small" onClick={() => openEdit(item)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => deleteInstruction(item.id)}>
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Paper>
              ))}
              {visibleInstructions.length === 0 && (
                <Alert severity="info">No work instructions match the current filter.</Alert>
              )}
            </Stack>
          </Stack>
        )}
      </Paper>

      {/* Settings menu */}
      <Menu anchorEl={settingsMenu} open={settingsMenuOpen} onClose={() => setSettingsMenuOpen(false)}>
        <MenuItem onClick={() => { setSettingsMenuOpen(false); setTableConfigOpen(true); }}>
          Table configuration
        </MenuItem>
        <MenuItem onClick={() => { setSettingsMenuOpen(false); setWiSettingsDraft(wiSettings); setWiSettingsOpen(true); }}>
          Work instructions settings
        </MenuItem>
      </Menu>

      {/* Table configuration dialog */}
      <TableConfigDialog
        open={tableConfigOpen}
        onClose={() => setTableConfigOpen(false)}
        title="Work Instructions — Card Fields"
        fields={WI_TABLE_FIELDS as unknown as Parameters<typeof TableConfigDialog>[0]["fields"]}
        config={tableConfig}
        onChange={setTableConfig}
        builtInColumns={WI_TABLE_FIELDS.map((f) => ({ id: f.id, name: f.name, type: f.fieldType }))}
      />

      {/* WI settings dialog */}
      <Dialog open={wiSettingsOpen} onClose={() => setWiSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Work instructions settings</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Default status for new instructions</InputLabel>
              <Select
                label="Default status for new instructions"
                value={wiSettingsDraft.defaultStatus}
                onChange={(event) => setWiSettingsDraft((prev) => ({ ...prev, defaultStatus: event.target.value as WorkInstructionStatus }))}
              >
                <MenuItem value="Draft">Draft</MenuItem>
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Archived">Archived</MenuItem>
              </Select>
            </FormControl>
            <Divider />
            <FormControlLabel
              control={
                <Switch
                  checked={wiSettingsDraft.showFeatureTargeting}
                  onChange={(event) => setWiSettingsDraft((prev) => ({ ...prev, showFeatureTargeting: event.target.checked }))}
                />
              }
              label={
                <Stack>
                  <Typography variant="body2">Show feature targeting</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Show product feature fields in the create / edit dialog
                  </Typography>
                </Stack>
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWiSettingsOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => { saveWiSettings(wiSettingsDraft); setWiSettings(wiSettingsDraft); setWiSettingsOpen(false); }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Config create/edit dialog */}
      <Dialog open={configDialogOpen} onClose={closeConfigDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingConfig ? "Edit configuration" : "New configuration"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={configForm.name}
              onChange={(e) => setConfigForm((p) => ({ ...p, name: e.target.value }))}
              fullWidth
              required
              placeholder="e.g. AIM-100 1 Camera Front"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={configForm.status}
                onChange={(e) => setConfigForm((p) => ({ ...p, status: e.target.value }))}
              >
                <MenuItem value="Draft">Draft</MenuItem>
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Archived">Archived</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Notes"
              value={configForm.notes}
              onChange={(e) => setConfigForm((p) => ({ ...p, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
              placeholder="Optional description or notes"
            />
            {activeFeatures.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Feature inclusions</Typography>
                <Typography variant="caption" color="text.secondary">
                  Specify which features are active for this configuration and how many are installed.
                </Typography>
                {activeFeatures.map((feat) => {
                  const sel = configForm.featureSelections.find((s) => s.featureId === feat.id);
                  const included = sel?.included ?? false;
                  const count = sel?.activeCount ?? 0;
                  const update = (patch: Partial<FeatureSelection>) =>
                    setConfigForm((p) => ({
                      ...p,
                      featureSelections: p.featureSelections.map((s) =>
                        s.featureId === feat.id ? { ...s, ...patch } : s
                      ),
                    }));
                  return (
                    <Paper key={feat.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={included}
                              onChange={(e) => update({ included: e.target.checked })}
                            />
                          }
                          label={<Typography variant="body2">{feat.name}</Typography>}
                          sx={{ flexGrow: 1, m: 0 }}
                        />
                        {included && (
                          <TextField
                            label="Qty"
                            type="number"
                            size="small"
                            value={count}
                            onChange={(e) => update({ activeCount: Math.max(0, parseInt(e.target.value) || 0) })}
                            inputProps={{ min: 0 }}
                            sx={{ width: 80 }}
                          />
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
            {configError && <Typography variant="body2" color="error">{configError}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfigDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveConfig}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Instruction create/edit dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? "Edit work instruction" : "Create work instruction"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Summary"
              value={form.summary || ""}
              onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
            <FormControl size="small" sx={{ maxWidth: 220 }}>
              <Select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as WorkInstructionStatus }))}
              >
                <MenuItem value="Draft">Draft</MenuItem>
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Archived">Archived</MenuItem>
              </Select>
            </FormControl>
            <Stack spacing={1}>
              <Typography variant="subtitle2">Steps</Typography>
              {form.steps.map((step, index) => (
                <Stack key={`step-${index}`} direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    label={`Step ${index + 1}`}
                    value={step}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        steps: prev.steps.map((item, i) => (i === index ? event.target.value : item))
                      }))
                    }
                  />
                  <Button
                    color="error"
                    onClick={() => setForm((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }))}
                    disabled={form.steps.length === 1}
                  >
                    Remove
                  </Button>
                </Stack>
              ))}
              <Box>
                <Button onClick={() => setForm((prev) => ({ ...prev, steps: [...prev.steps, ""] }))}>Add step</Button>
              </Box>
            </Stack>
            {activeFeatures.length > 0 && wiSettings.showFeatureTargeting && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Product feature targeting</Typography>
                {activeFeatures.map((feature) => {
                  const value = form.featureValues[feature.id] || "";
                  const setVal = (v: string) =>
                    setForm((prev) => ({ ...prev, featureValues: { ...prev.featureValues, [feature.id]: v } }));

                  if (feature.valueType === "tri-state") {
                    return (
                      <Stack key={feature.id} spacing={0.5}>
                        <Typography variant="caption" color="text.secondary">{feature.name}</Typography>
                        <ToggleButtonGroup value={value || null} exclusive onChange={(_, next) => { if (next !== null) setVal(next); }} size="small">
                          <ToggleButton value="yes">Yes</ToggleButton>
                          <ToggleButton value="no">No</ToggleButton>
                          <ToggleButton value="na">N/A</ToggleButton>
                        </ToggleButtonGroup>
                      </Stack>
                    );
                  }
                  if (feature.valueType === "single-select") {
                    return (
                      <FormControl key={feature.id} fullWidth size="small">
                        <InputLabel>{feature.name}</InputLabel>
                        <Select label={feature.name} value={value} onChange={(event) => setVal(event.target.value)}>
                          {(feature.options || []).map((option) => (
                            <MenuItem key={option} value={option}>{option}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    );
                  }
                  if (feature.valueType === "multi-select") {
                    const selected = value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
                    return (
                      <FormControl key={feature.id} fullWidth size="small">
                        <Typography variant="caption" color="text.secondary">{feature.name}</Typography>
                        <Select
                          multiple value={selected}
                          onChange={(event) => {
                            const next = Array.isArray(event.target.value) ? event.target.value : [];
                            setVal(next.join(","));
                          }}
                          renderValue={(selectedValues) => Array.isArray(selectedValues) ? selectedValues.join(", ") : ""}
                        >
                          {(feature.options || []).map((option) => (
                            <MenuItem key={option} value={option}>{option}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    );
                  }
                  if (feature.valueType === "rating") {
                    return (
                      <Stack key={feature.id} spacing={0.5}>
                        <Typography variant="caption" color="text.secondary">{feature.name}</Typography>
                        <Rating value={parseInt(value) || 0} onChange={(_, next) => setVal(next ? String(next) : "")} />
                      </Stack>
                    );
                  }
                  if (feature.valueType === "percentage") {
                    return (
                      <TextField
                        key={feature.id} label={`${feature.name} (%)`} fullWidth type="number"
                        inputProps={{ min: 0, max: 100 }} value={value}
                        onChange={(event) => setVal(event.target.value)}
                      />
                    );
                  }
                  if (feature.valueType === "date") {
                    return (
                      <TextField
                        key={feature.id} label={feature.name} fullWidth type="date"
                        value={value} onChange={(event) => setVal(event.target.value)} InputLabelProps={{ shrink: true }}
                      />
                    );
                  }
                  if (feature.valueType === "rich-text") {
                    return (
                      <TextField
                        key={feature.id} label={feature.name} fullWidth multiline rows={3}
                        value={value} onChange={(event) => setVal(event.target.value)}
                      />
                    );
                  }
                  if (feature.valueType === "link") {
                    return (
                      <TextField
                        key={feature.id} label={feature.name} fullWidth type="url" placeholder="https://"
                        value={value} onChange={(event) => setVal(event.target.value)}
                      />
                    );
                  }
                  if (feature.valueType === "file") {
                    return (
                      <TextField
                        key={feature.id} label={feature.name} fullWidth placeholder="File URL or path"
                        value={value} onChange={(event) => setVal(event.target.value)}
                      />
                    );
                  }
                  return (
                    <TextField
                      key={feature.id} label={feature.name} fullWidth
                      type={feature.valueType === "number" ? "number" : "text"}
                      value={value} onChange={(event) => setVal(event.target.value)}
                    />
                  );
                })}
              </Stack>
            )}
            {error && <Typography variant="body2" color="error">{error}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveInstruction}>Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default WorkInstructions;
