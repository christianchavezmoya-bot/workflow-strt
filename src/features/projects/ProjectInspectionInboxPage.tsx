import { Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { inspectionImportService } from "../../services/inspectionImportService";
import type { InspectionImport } from "../../types/inspectionImport";
import type { ProjectAsset } from "../../types/projectAsset";

type Props = {
  projectId: string;
  assets: ProjectAsset[];
  assetId?: string;
};

export default function ProjectInspectionInboxPage({ projectId, assets, assetId }: Props) {
  const [items, setItems] = useState<InspectionImport[]>([]);
  const [rawJson, setRawJson] = useState("");
  const [source, setSource] = useState("manual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string>>({});

  const visibleAssets = useMemo(
    () => assets.filter((asset) => !assetId || asset.id === assetId),
    [assetId, assets]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await inspectionImportService.listByProject(projectId, assetId ? { assetId } : undefined);
      setItems(data);
    } catch {
      setError("Unable to load inspection imports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [assetId, projectId]);

  async function handleUpload() {
    if (!rawJson.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await inspectionImportService.create({
        source,
        rawJson,
        projectId,
        projectAssetId: assetId,
      });
      setRawJson("");
      await load();
    } catch {
      setError("Unable to upload inspection import.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(item: InspectionImport) {
    const nextAssetId = pendingAssignments[item.id];
    if (!nextAssetId) return;
    setAssigningId(item.id);
    try {
      await inspectionImportService.assign(item.id, { projectId, projectAssetId: nextAssetId });
      await load();
    } catch {
      setError("Unable to assign inspection import.");
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <Stack spacing={2}>
      <Box className="glass-card" sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" sx={{ fontFamily: "Sora", mb: 1 }}>Inspection Inbox Upload</Typography>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <FormControl sx={{ minWidth: 220 }}>
              <InputLabel id="inspection-import-source-label">Source</InputLabel>
              <Select
                labelId="inspection-import-source-label"
                value={source}
                label="Source"
                onChange={(e) => setSource(e.target.value)}
              >
                <MenuItem value="manual">Manual</MenuItem>
                <MenuItem value="disk">Disk</MenuItem>
                <MenuItem value="onedrive">OneDrive</MenuItem>
                <MenuItem value="email">Email</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleUpload} disabled={!rawJson.trim() || loading}>
              Upload JSON
            </Button>
          </Stack>
          <TextField
            label="Raw inspection JSON"
            multiline
            minRows={8}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Box>

      <Box className="glass-card" sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" sx={{ fontFamily: "Sora", mb: 1 }}>Inbox Items</Typography>
        {loading ? (
          <Typography variant="body2" color="text.secondary">Loading imports...</Typography>
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No inspection imports found.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {items.map((item) => (
              <Box key={item.id} sx={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, p: 1.5 }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between">
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                      <Chip label={item.status} size="small" variant="outlined" />
                      <Chip label={item.source} size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Received {new Date(item.receivedAt).toLocaleString()}
                    </Typography>
                    {item.error && (
                      <Typography variant="caption" color="error.main" display="block">
                        {item.error}
                      </Typography>
                    )}
                    <TextField
                      value={item.rawJson}
                      multiline
                      minRows={4}
                      fullWidth
                      InputProps={{ readOnly: true }}
                      sx={{ mt: 1 }}
                    />
                  </Box>
                  <Stack spacing={1} sx={{ minWidth: { md: 240 } }}>
                    <FormControl fullWidth size="small">
                      <InputLabel id={`assign-asset-${item.id}`}>Assign to asset</InputLabel>
                      <Select
                        labelId={`assign-asset-${item.id}`}
                        value={pendingAssignments[item.id] ?? item.projectAssetId ?? ""}
                        label="Assign to asset"
                        onChange={(e) => setPendingAssignments((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      >
                        {visibleAssets.map((asset) => (
                          <MenuItem key={asset.id} value={asset.id}>
                            {asset.assetTag || asset.assetName || asset.id}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Button
                      variant="outlined"
                      onClick={() => void handleAssign(item)}
                      disabled={!pendingAssignments[item.id] || assigningId === item.id}
                    >
                      {assigningId === item.id ? "Assigning..." : "Assign"}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

