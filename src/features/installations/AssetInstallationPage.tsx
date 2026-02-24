import { useEffect, useMemo, useState } from "react";
import {
  AddOutlined,
  CheckCircleOutlined,
  ErrorOutlined,
  HourglassEmptyOutlined,
  PlayArrowOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import { fetchProjects } from "../../store/projectSlice";
import { fetchUsers } from "../../store/usersSlice";
import { demoProducts } from "../../data/demo";
import { projectAssetService } from "../../services/projectAssetService";
import { productConfigService, type ProductConfig } from "../../services/productConfigService";
import { workflowTemplateService } from "../../services/workflowTemplateService";
import type { ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { StepInput, Workflow } from "../../types/workflow";
import WorkOrderRunner from "../workInstructions/WorkOrderRunner";

// ------------------------------------------------------------------
// Status helpers
// ------------------------------------------------------------------

const STATUS_COLORS: Record<ProjectAssetStatus, "default" | "primary" | "success" | "error" | "warning"> = {
  NotStarted: "default",
  InProgress: "primary",
  Complete: "success",
  Issue: "error",
};

const STATUS_LABELS: Record<ProjectAssetStatus, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Complete: "Complete",
  Issue: "Issue",
};

// ------------------------------------------------------------------
// Add-asset form state
// ------------------------------------------------------------------

interface AddAssetForm {
  projectId: string;
  configId: string;
  assetTag: string;
  serialNumber: string;
  location: string;
  assignedUserId: string;
  notes: string;
  /** featureId → raw value string (component type = JSON string of sub-field values) */
  featureValues: Record<string, string>;
}

const emptyForm = (): AddAssetForm => ({
  projectId: "",
  configId: "",
  assetTag: "",
  serialNumber: "",
  location: "",
  assignedUserId: "",
  notes: "",
  featureValues: {},
});

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

const AssetInstallationPage = () => {
  const dispatch = useAppDispatch();
  const productsState = useAppSelector((s) => s.products);
  const projects = useAppSelector((s) => s.projects.items);
  const users = useAppSelector((s) => s.users.items);

  // Product tabs
  const [tab, setTab] = useState(0);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectAssetStatus | "All">("All");
  const [search, setSearch] = useState("");

  // Data
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [configs, setConfigs] = useState<ProductConfig[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddAssetForm>(emptyForm());
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  // Work order runner
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runnerAsset, setRunnerAsset] = useState<ProjectAsset | null>(null);
  const [runnerWorkflow, setRunnerWorkflow] = useState<Workflow | null>(null);
  const [runnerLoading, setRunnerLoading] = useState<string | null>(null); // assetId being loaded

  // Feature inputs derived from selected config's workflow template
  const [configFeatureInputs, setConfigFeatureInputs] = useState<StepInput[]>([]);

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(fetchProjects());
    dispatch(fetchUsers());
  }, [dispatch]);

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items]
  );

  useEffect(() => {
    if (tab >= products.length) setTab(Math.max(0, products.length - 1));
  }, [tab, products.length]);

  const activeProduct = products[tab];

  // Load assets + configs when active product changes
  useEffect(() => {
    if (!activeProduct?.id) { setAssets([]); setConfigs([]); return; }
    setLoadingAssets(true);
    Promise.all([
      projectAssetService.listByProduct(activeProduct.id),
      productConfigService.listByProduct(activeProduct.id),
    ]).then(([a, c]) => {
      setAssets(a);
      setConfigs(c);
    }).finally(() => setLoadingAssets(false));
  }, [activeProduct?.id]);

  const refreshAssets = () => {
    if (!activeProduct?.id) return;
    projectAssetService.listByProduct(activeProduct.id).then(setAssets);
  };

  // Selected config auto-fills workflowTemplateId
  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === addForm.configId) ?? null,
    [configs, addForm.configId]
  );

  // Load feature inputs from config's workflow when config selection changes
  useEffect(() => {
    if (!selectedConfig?.workflowTemplateId) { setConfigFeatureInputs([]); return; }
    workflowTemplateService.getById(selectedConfig.workflowTemplateId).then((wf) => {
      if (!wf) { setConfigFeatureInputs([]); return; }
      const seen = new Set<string>();
      const inputs: StepInput[] = [];
      for (const step of wf.steps) {
        for (const inp of step.inputs ?? []) {
          if (inp.featureId && !seen.has(inp.featureId)) {
            seen.add(inp.featureId);
            inputs.push(inp);
          }
        }
      }
      setConfigFeatureInputs(inputs);
    });
  }, [selectedConfig?.workflowTemplateId]);

  // Filtered + searched assets
  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (selectedProjectId && a.projectId !== selectedProjectId) return false;
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (q && !([a.assetTag, a.serialNumber, a.location].some((f) => f?.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [assets, selectedProjectId, statusFilter, search]);

  // Project name lookup
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const configMap = useMemo(() => new Map(configs.map((c) => [c.id, c])), [configs]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // ------------------------------------------------------------------
  // Add asset dialog
  // ------------------------------------------------------------------

  const openAdd = () => {
    setAddForm(emptyForm());
    setAddError(null);
    setConfigFeatureInputs([]);
    setAddOpen(true);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddError(null);
  };

  const saveAsset = async () => {
    if (!activeProduct) return;
    const tag = addForm.assetTag.trim();
    if (!tag) { setAddError("Asset tag is required."); return; }
    if (!addForm.projectId) { setAddError("Select a project."); return; }
    setAddSaving(true);
    setAddError(null);
    try {
      await projectAssetService.create({
        projectId: addForm.projectId,
        productId: activeProduct.id,
        productConfigId: addForm.configId || undefined,
        workflowTemplateId: selectedConfig?.workflowTemplateId || undefined,
        assetTag: tag,
        serialNumber: addForm.serialNumber.trim() || undefined,
        location: addForm.location.trim() || undefined,
        assignedUserId: addForm.assignedUserId || undefined,
        notes: addForm.notes.trim() || undefined,
        featureValuesJson: Object.keys(addForm.featureValues).length
          ? JSON.stringify(addForm.featureValues)
          : undefined,
      });
      closeAdd();
      refreshAssets();
    } catch {
      setAddError("Failed to create asset. Check your connection.");
    } finally {
      setAddSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Work order runner
  // ------------------------------------------------------------------

  const handleStartWorkOrder = async (asset: ProjectAsset) => {
    if (!asset.workflowTemplateId) {
      alert("This asset has no workflow template linked. Assign a configuration first.");
      return;
    }
    setRunnerLoading(asset.id);
    try {
      const wf = await workflowTemplateService.getById(asset.workflowTemplateId);
      if (!wf) { alert("Workflow template not found."); return; }
      setRunnerAsset(asset);
      setRunnerWorkflow(wf);
      setRunnerOpen(true);
    } catch {
      alert("Failed to load workflow.");
    } finally {
      setRunnerLoading(null);
    }
  };

  function actionButton(asset: ProjectAsset) {
    const loading = runnerLoading === asset.id;
    if (!asset.workflowTemplateId) {
      return (
        <Typography variant="caption" color="text.secondary">No workflow</Typography>
      );
    }
    if (asset.status === "NotStarted") {
      return (
        <Button
          size="small"
          variant="outlined"
          color="success"
          startIcon={loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />}
          disabled={loading}
          onClick={() => handleStartWorkOrder(asset)}
        >
          Start
        </Button>
      );
    }
    if (asset.status === "InProgress") {
      return (
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />}
          disabled={loading}
          onClick={() => handleStartWorkOrder(asset)}
        >
          Continue
        </Button>
      );
    }
    if (asset.status === "Complete") {
      return (
        <Button size="small" variant="text" color="inherit" startIcon={<CheckCircleOutlined />}
          onClick={() => handleStartWorkOrder(asset)}>
          View
        </Button>
      );
    }
    // Issue
    return (
      <Button size="small" variant="outlined" color="error" startIcon={<ErrorOutlined />}
        onClick={() => handleStartWorkOrder(asset)}>
        Review
      </Button>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Installation Assets
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track assets across projects — start work orders, record status, and monitor progress.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} onClick={refreshAssets}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddOutlined />} onClick={openAdd} disabled={!activeProduct}>
            Add asset
          </Button>
        </Stack>
      </Stack>

      {/* Product tabs */}
      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="scrollable" allowScrollButtonsMobile scrollButtons="auto">
          {products.map((p) => (
            <Tab key={p.id} label={p.name} />
          ))}
        </Tabs>
      </Paper>

      {/* Filters */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            <MenuItem value="">All projects</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.jobNumber} — {p.customerName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectAssetStatus | "All")}>
            <MenuItem value="All">All statuses</MenuItem>
            <MenuItem value="NotStarted">Not Started</MenuItem>
            <MenuItem value="InProgress">In Progress</MenuItem>
            <MenuItem value="Complete">Complete</MenuItem>
            <MenuItem value="Issue">Issue</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="Search asset tag / serial / location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 260 }}
        />
      </Stack>

      {/* Asset table */}
      <Paper className="glass-card" sx={{ overflow: "hidden" }}>
        {loadingAssets ? (
          <Stack alignItems="center" justifyContent="center" sx={{ p: 6 }}>
            <CircularProgress size={32} />
          </Stack>
        ) : visibleAssets.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="info">
              {assets.length === 0
                ? `No assets added for ${activeProduct?.name ?? "this product"} yet. Click "Add asset" to get started.`
                : "No assets match the current filters."}
            </Alert>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><Typography variant="caption" fontWeight={700}>Asset Tag</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Serial #</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Configuration</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Project</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Location</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Assigned Tech</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Details</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Status</Typography></TableCell>
                <TableCell align="right"><Typography variant="caption" fontWeight={700}>Action</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleAssets.map((asset) => {
                const cfg = asset.productConfigId ? configMap.get(asset.productConfigId) : null;
                const proj = projectMap.get(asset.projectId);
                const tech = asset.assignedUserId ? userMap.get(asset.assignedUserId) : null;
                return (
                  <TableRow key={asset.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{asset.assetTag}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{asset.serialNumber || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      {cfg ? (
                        <Chip size="small" label={cfg.name} variant="outlined" />
                      ) : (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {proj ? `${proj.jobNumber}` : asset.projectId.slice(0, 8)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{asset.location || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {tech ? tech.fullName : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        let vals: Record<string, string> = {};
                        try { vals = JSON.parse(asset.featureValuesJson || "{}"); } catch {}
                        const entries = Object.entries(vals).filter(([, v]) => {
                          // for component sub-fields (JSON strings), also check non-empty
                          if (!v) return false;
                          try { const sub = JSON.parse(v); return Object.values(sub).some(Boolean); } catch {}
                          return true;
                        });
                        if (!entries.length) return <Typography variant="caption" color="text.disabled">—</Typography>;
                        const summary = entries.map(([, v]) => {
                          try { return Object.values(JSON.parse(v)).filter(Boolean).join(", "); } catch {}
                          return v;
                        }).filter(Boolean).join(" · ");
                        return (
                          <Tooltip title={summary} arrow>
                            <Chip size="small" label={`${entries.length} field${entries.length !== 1 ? "s" : ""}`} variant="outlined" sx={{ maxWidth: 100 }} />
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[asset.status as ProjectAssetStatus] ?? asset.status}
                        color={STATUS_COLORS[asset.status as ProjectAssetStatus] ?? "default"}
                        icon={
                          asset.status === "InProgress" ? <HourglassEmptyOutlined sx={{ fontSize: "0.9rem !important" }} /> :
                          asset.status === "Complete" ? <CheckCircleOutlined sx={{ fontSize: "0.9rem !important" }} /> :
                          asset.status === "Issue" ? <ErrorOutlined sx={{ fontSize: "0.9rem !important" }} /> :
                          undefined
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      {actionButton(asset)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Add asset dialog */}
      <Dialog open={addOpen} onClose={closeAdd} maxWidth="sm" fullWidth>
        <DialogTitle>Add asset</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth required>
              <InputLabel>Project *</InputLabel>
              <Select
                label="Project *"
                value={addForm.projectId}
                onChange={(e) => setAddForm((p) => ({ ...p, projectId: e.target.value }))}
              >
                {projects.map((proj) => (
                  <MenuItem key={proj.id} value={proj.id}>
                    {proj.jobNumber} — {proj.customerName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>Configuration (asset type)</InputLabel>
              <Select
                label="Configuration (asset type)"
                value={addForm.configId}
                onChange={(e) => setAddForm((p) => ({ ...p, configId: e.target.value }))}
              >
                <MenuItem value="">(None)</MenuItem>
                {configs.map((cfg) => (
                  <MenuItem key={cfg.id} value={cfg.id}>
                    {cfg.name}
                    {cfg.workflowTemplateId ? " ✓" : " (no workflow)"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedConfig && !selectedConfig.workflowTemplateId && (
              <Alert severity="warning" sx={{ fontSize: 12 }}>
                This configuration has no workflow template linked. Go to Work Instructions → Configurations → Open Builder to create one first.
              </Alert>
            )}

            <TextField
              label="Asset Tag *"
              size="small"
              fullWidth
              value={addForm.assetTag}
              onChange={(e) => setAddForm((p) => ({ ...p, assetTag: e.target.value }))}
              placeholder="e.g. VEH-001"
              required
            />
            <TextField
              label="Serial Number"
              size="small"
              fullWidth
              value={addForm.serialNumber}
              onChange={(e) => setAddForm((p) => ({ ...p, serialNumber: e.target.value }))}
            />
            <TextField
              label="Location"
              size="small"
              fullWidth
              value={addForm.location}
              onChange={(e) => setAddForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="e.g. Unit 7, Bay 3"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Assigned Technician</InputLabel>
              <Select
                label="Assigned Technician"
                value={addForm.assignedUserId}
                onChange={(e) => setAddForm((p) => ({ ...p, assignedUserId: e.target.value }))}
              >
                <MenuItem value="">(Unassigned)</MenuItem>
                {users.filter((u) => u.isActive).map((u) => (
                  <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Notes"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={addForm.notes}
              onChange={(e) => setAddForm((p) => ({ ...p, notes: e.target.value }))}
            />

            {configFeatureInputs.length > 0 && (
              <>
                <Divider>
                  <Typography variant="caption" color="text.secondary">Feature values (from configuration)</Typography>
                </Divider>
                {configFeatureInputs.map((fi) => {
                  if (fi.type === "component" && fi.subFields?.length) {
                    const compVals = (() => { try { return JSON.parse(addForm.featureValues[fi.featureId!] || "{}") as Record<string, string>; } catch { return {} as Record<string, string>; } })();
                    return (
                      <Box key={fi.featureId}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>{fi.label}</Typography>
                        <Stack spacing={1} sx={{ pl: 1 }}>
                          {fi.subFields.map((sf) => (
                            <TextField
                              key={sf.id}
                              size="small"
                              fullWidth
                              label={sf.name}
                              value={compVals[sf.id] ?? ""}
                              onChange={(e) => {
                                const current = (() => { try { return JSON.parse(addForm.featureValues[fi.featureId!] || "{}") as Record<string, string>; } catch { return {} as Record<string, string>; } })();
                                const next = JSON.stringify({ ...current, [sf.id]: e.target.value });
                                setAddForm((p) => ({ ...p, featureValues: { ...p.featureValues, [fi.featureId!]: next } }));
                              }}
                            />
                          ))}
                        </Stack>
                      </Box>
                    );
                  }
                  return (
                    <TextField
                      key={fi.featureId}
                      size="small"
                      fullWidth
                      label={fi.label}
                      value={addForm.featureValues[fi.featureId!] ?? ""}
                      onChange={(e) => setAddForm((p) => ({ ...p, featureValues: { ...p.featureValues, [fi.featureId!]: e.target.value } }))}
                    />
                  );
                })}
              </>
            )}

            {addError && <Alert severity="error" sx={{ fontSize: 12 }}>{addError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAdd} disabled={addSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveAsset}
            disabled={addSaving}
            startIcon={addSaving ? <CircularProgress size={14} /> : undefined}
          >
            {addSaving ? "Saving…" : "Add asset"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Work order runner */}
      {runnerOpen && runnerWorkflow && runnerAsset && activeProduct && (
        <WorkOrderRunner
          open={runnerOpen}
          onClose={() => { setRunnerOpen(false); setRunnerAsset(null); setRunnerWorkflow(null); }}
          workflow={runnerWorkflow}
          productId={activeProduct.id}
          productName={activeProduct.name}
          projectAssetId={runnerAsset.id}
          onComplete={refreshAssets}
        />
      )}
    </Stack>
  );
};

export default AssetInstallationPage;
