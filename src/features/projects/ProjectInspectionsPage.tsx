import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Project } from "../../types/project";
import type { ProjectAsset } from "../../types/projectAsset";
import type { InspectionImport } from "../../types/inspectionImport";
import { projectAssetService } from "../../services/projectAssetService";
import { inspectionImportService } from "../../services/inspectionImportService";

type Props = {
  project: Project;
};

type AssetFormState = {
  productId: string;
  assetTag: string;
  assetName: string;
  serialNumber: string;
  assignedUserId: string;
};

const emptyAssetForm = (productId = ""): AssetFormState => ({
  productId,
  assetTag: "",
  assetName: "",
  serialNumber: "",
  assignedUserId: "",
});

export default function ProjectInspectionsPage({ project }: Props) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [imports, setImports] = useState<InspectionImport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [assetForm, setAssetForm] = useState<AssetFormState>(emptyAssetForm(project.productIds?.[0] || ""));

  async function load() {
    try {
      const [loadedAssets, loadedImports] = await Promise.all([
        projectAssetService.listByProject(project.id),
        inspectionImportService.listByProject(project.id),
      ]);
      setAssets(loadedAssets);
      setImports(loadedImports);
      setError(null);
    } catch {
      setError("Unable to load project inspections.");
    }
  }

  useEffect(() => {
    void load();
  }, [project.id]);

  const importCountByAsset = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of imports) {
      if (!item.projectAssetId) continue;
      map.set(item.projectAssetId, (map.get(item.projectAssetId) ?? 0) + 1);
    }
    return map;
  }, [imports]);

  async function handleCreateAsset() {
    if (!assetForm.productId || !assetForm.assetTag.trim()) return;
    try {
      await projectAssetService.create({
        projectId: project.id,
        productId: assetForm.productId,
        assetTag: assetForm.assetTag.trim(),
        assetName: assetForm.assetName.trim() || undefined,
        serialNumber: assetForm.serialNumber.trim() || undefined,
        assignedUserId: assetForm.assignedUserId || undefined,
      });
      setAddOpen(false);
      setAssetForm(emptyAssetForm(project.productIds?.[0] || ""));
      await load();
    } catch {
      setError("Unable to create project asset.");
    }
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontFamily: "Sora" }}>Inspection assets</Typography>
          <Typography variant="body2" color="text.secondary">
            Internal inspection runs and third-party imports for {project.jobNumber}.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => setAddOpen(true)}>
          Add inspection asset
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {assets.length === 0 ? (
        <Box className="glass-card" sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            No project assets created for inspections yet.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {assets.map((asset) => (
            <Box key={asset.id} className="glass-card" sx={{ p: 2 }}>
              <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
                <Box>
                  <Typography variant="subtitle2">{asset.assetTag || asset.assetName || asset.id}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {asset.assetName || "Inspection asset"} {asset.serialNumber ? `• ${asset.serialNumber}` : ""}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {(asset.workflowSummary?.latestRunStatus ?? "No runs")} • {importCountByAsset.get(asset.id) ?? 0} inbox items
                  </Typography>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    component={Link}
                    to={`/projects/${project.id}/assets/${asset.id}/inspections`}
                    variant="contained"
                  >
                    Open inspections
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add inspection asset</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="inspection-asset-product">Product</InputLabel>
              <Select
                labelId="inspection-asset-product"
                value={assetForm.productId}
                label="Product"
                onChange={(e) => setAssetForm((prev) => ({ ...prev, productId: e.target.value }))}
              >
                {(project.productIds ?? []).map((productId) => (
                  <MenuItem key={productId} value={productId}>{productId}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Asset Tag" value={assetForm.assetTag} onChange={(e) => setAssetForm((prev) => ({ ...prev, assetTag: e.target.value }))} />
            <TextField label="Asset Name" value={assetForm.assetName} onChange={(e) => setAssetForm((prev) => ({ ...prev, assetName: e.target.value }))} />
            <TextField label="Serial Number" value={assetForm.serialNumber} onChange={(e) => setAssetForm((prev) => ({ ...prev, serialNumber: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleCreateAsset()} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

