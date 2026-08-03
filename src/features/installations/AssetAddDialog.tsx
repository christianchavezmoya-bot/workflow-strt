import { memo, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Project } from "../../types/project";
import type { Product } from "../../types/product";
import type { User } from "../../types/user";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { StepInput } from "../../types/workflow";
import { workflowTemplateService } from "../../services/workflowTemplateService";
import { projectAssetService } from "../../services/projectAssetService";

export interface AssetFormValues {
  projectId: string;
  configId: string;
  assetTag: string;
  assetName: string;
  serialNumber: string;
  assetModel: string;
  manufacturer: string;
  location: string;
  assignedUserId: string;
  notes: string;
  featureValues: Record<string, string>;
}

const emptyForm = (projectId = ""): AssetFormValues => ({
  projectId,
  configId: "",
  assetTag: "",
  assetName: "",
  serialNumber: "",
  assetModel: "",
  manufacturer: "",
  location: "",
  assignedUserId: "",
  notes: "",
  featureValues: {},
});

interface Props {
  open: boolean;
  defaultProjectId: string;
  activeProduct: Product | null;
  productProjects: Project[];
  projects: Project[];
  users: User[];
  latestPublishedWfConfigs: WorkflowConfig[];
  publishedWfConfigs: WorkflowConfig[];
  configs: { id: string; workflowTemplateId?: string }[];
  getSiteLocation: (siteId?: string) => string;
  onClose: () => void;
  onSaved: () => void;
}

function renderFeatureInputs(
  featureInputs: StepInput[],
  formValues: Record<string, string>,
  onChange: (featureId: string, val: string) => void,
) {
  if (!featureInputs.length) return null;
  return (
    <>
      <Divider>
        <Typography variant="caption" color="text.secondary">
          Feature values (from configuration)
        </Typography>
      </Divider>
      {featureInputs.map((fi) => {
        if (fi.type === "component" && fi.subFields?.length) {
          const compVals = (() => {
            try {
              return JSON.parse(formValues[fi.featureId!] || "{}") as Record<string, string>;
            } catch {
              return {} as Record<string, string>;
            }
          })();
          return (
            <Box key={fi.featureId}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                {fi.label}
              </Typography>
              <Stack spacing={1} sx={{ pl: 1 }}>
                {fi.subFields.map((sf: { id: string; name: string }) => (
                  <TextField
                    key={sf.id}
                    size="small"
                    fullWidth
                    label={sf.name}
                    value={compVals[sf.id] ?? ""}
                    onChange={(e) => {
                      const cur = (() => {
                        try {
                          return JSON.parse(formValues[fi.featureId!] || "{}") as Record<string, string>;
                        } catch {
                          return {};
                        }
                      })();
                      onChange(fi.featureId!, JSON.stringify({ ...cur, [sf.id]: e.target.value }));
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
            value={formValues[fi.featureId!] ?? ""}
            onChange={(e) => onChange(fi.featureId!, e.target.value)}
          />
        );
      })}
    </>
  );
}

function AssetAddDialogInner({
  defaultProjectId,
  activeProduct,
  productProjects,
  projects,
  users,
  latestPublishedWfConfigs,
  publishedWfConfigs,
  configs,
  getSiteLocation,
  onClose,
  onSaved,
}: Omit<Props, "open">) {
  const [form, setForm] = useState(() => emptyForm(defaultProjectId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configFeatureInputs, setConfigFeatureInputs] = useState<StepInput[]>([]);

  useEffect(() => {
    setForm(emptyForm(defaultProjectId));
    setError(null);
    setConfigFeatureInputs([]);
  }, [defaultProjectId]);

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === form.configId) ?? null,
    [configs, form.configId],
  );

  useEffect(() => {
    if (!selectedConfig?.workflowTemplateId) {
      setConfigFeatureInputs([]);
      return;
    }
    workflowTemplateService.getById(selectedConfig.workflowTemplateId).then((wf) => {
      if (!wf) {
        setConfigFeatureInputs([]);
        return;
      }
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

  async function save() {
    if (!activeProduct) return;
    const tag = form.assetTag.trim();
    if (!tag) {
      setError("Asset tag is required.");
      return;
    }
    if (!form.projectId) {
      setError("Select a project.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await projectAssetService.create({
        projectId: form.projectId,
        productId: activeProduct.id,
        productConfigId: form.configId || undefined,
        workflowTemplateId: selectedConfig?.workflowTemplateId || undefined,
        assetTag: tag,
        assetName: form.assetName.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        assetModel: form.assetModel.trim() || undefined,
        manufacturer: form.manufacturer.trim() || undefined,
        location: form.location.trim() || undefined,
        assignedUserId: form.assignedUserId || undefined,
        notes: form.notes.trim() || undefined,
        featureValuesJson: Object.keys(form.featureValues).length
          ? JSON.stringify(form.featureValues)
          : undefined,
      });
      onSaved();
      onClose();
    } catch {
      setError("Failed to create asset. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === form.projectId);

  return (
    <>
      <DialogTitle>Add asset</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl size="small" fullWidth required>
            <InputLabel shrink>Project *</InputLabel>
            <Select
              label="Project *"
              value={form.projectId}
              onChange={(e) => {
                const projId = e.target.value;
                const proj = productProjects.find((p) => p.id === projId);
                setForm((p) => ({
                  ...p,
                  projectId: projId,
                  location: p.location || getSiteLocation(proj?.siteId) || proj?.siteName || "",
                }));
              }}
            >
              {productProjects.length === 0 && (
                <MenuItem disabled value="">
                  No projects linked to {activeProduct?.name ?? "this product"}
                </MenuItem>
              )}
              {productProjects.map((proj) => (
                <MenuItem key={proj.id} value={proj.id}>
                  {proj.jobNumber} - {proj.customerName}
                  {proj.siteName ? ` (${proj.siteName})` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel shrink>Configuration Type</InputLabel>
            <Select
              label="Configuration Type"
              value={form.configId}
              onChange={(e) => setForm((p) => ({ ...p, configId: e.target.value }))}
            >
              <MenuItem value="">(None)</MenuItem>
              {latestPublishedWfConfigs.map((wc) => (
                <MenuItem key={wc.id} value={wc.id}>
                  {wc.configType ? `${wc.configType} - ` : ""}
                  {wc.name}
                  {wc.version > 1 ? ` (v${wc.version})` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {publishedWfConfigs.length === 0 && (
            <Alert severity="info" sx={{ fontSize: 12 }}>
              No published work instructions for {activeProduct?.name ?? "this product"} yet. Publish one in Work
              Instructions first.
            </Alert>
          )}

          {form.projectId && selectedProject && (
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Project #"
                size="small"
                fullWidth
                value={selectedProject.jobNumber}
                InputProps={{ readOnly: true }}
                sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }}
              />
              {selectedProject.siteName && (
                <TextField
                  label="Site Name"
                  size="small"
                  fullWidth
                  value={selectedProject.siteName}
                  InputProps={{ readOnly: true }}
                  sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }}
                />
              )}
            </Stack>
          )}

          <TextField
            label="Asset Tag *"
            size="small"
            fullWidth
            required
            value={form.assetTag}
            onChange={(e) => setForm((p) => ({ ...p, assetTag: e.target.value }))}
            placeholder="e.g. VEH-001"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Asset Name"
            size="small"
            fullWidth
            value={form.assetName}
            onChange={(e) => setForm((p) => ({ ...p, assetName: e.target.value }))}
            placeholder="e.g. AGI-10, Shuttle Car, Skid Steer"
            helperText="Equipment type or model name"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Serial Number"
            size="small"
            fullWidth
            value={form.serialNumber}
            onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))}
          />
          <TextField
            label="Asset Model"
            size="small"
            fullWidth
            value={form.assetModel}
            onChange={(e) => setForm((p) => ({ ...p, assetModel: e.target.value }))}
            placeholder="e.g. Axis P3245-V"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Manufacturer"
            size="small"
            fullWidth
            value={form.manufacturer}
            onChange={(e) => setForm((p) => ({ ...p, manufacturer: e.target.value }))}
            placeholder="e.g. Axis, Cisco"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Location"
            size="small"
            fullWidth
            value={form.location}
            onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
            placeholder="i.e LV workshop, U/G"
            InputLabelProps={{ shrink: true }}
            helperText={selectedProject?.siteName ? `Site: ${selectedProject.siteName}` : undefined}
          />
          <FormControl size="small" fullWidth>
            <InputLabel shrink>Assigned User</InputLabel>
            <Select
              label="Assigned User"
              value={form.assignedUserId}
              onChange={(e) => setForm((p) => ({ ...p, assignedUserId: e.target.value }))}
            >
              <MenuItem value="">(Unassigned)</MenuItem>
              {users.filter((u) => u.isActive).map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.fullName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Notes"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />

          {renderFeatureInputs(configFeatureInputs, form.featureValues, (fid, val) =>
            setForm((p) => ({ ...p, featureValues: { ...p.featureValues, [fid]: val } })),
          )}
          {error && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          {saving ? "Saving..." : "Add asset"}
        </Button>
      </DialogActions>
    </>
  );
}

export default memo(function AssetAddDialog(props: Props) {
  const { open, onClose, ...rest } = props;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {open ? <AssetAddDialogInner {...rest} onClose={onClose} /> : null}
    </Dialog>
  );
});
