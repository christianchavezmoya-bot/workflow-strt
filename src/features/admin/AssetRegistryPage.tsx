import { useEffect, useMemo, useState } from "react";
import {
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import { fetchProjects } from "../../store/projectSlice";
import { demoProducts } from "../../data/demo";
import { projectAssetService } from "../../services/projectAssetService";
import { productConfigService, type ProductConfig } from "../../services/productConfigService";
import type { ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";

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

export default function AssetRegistryPage() {
  const dispatch = useAppDispatch();
  const productsState = useAppSelector((s) => s.products);
  const projects = useAppSelector((s) => s.projects.items);

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items],
  );

  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [configs, setConfigs] = useState<ProductConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectAssetStatus | "All">("All");
  const [productFilter, setProductFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(fetchProjects());
  }, [dispatch]);

  useEffect(() => {
    if (!products.length) return;
    loadAll();
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true);
    try {
      const [allAssets, allConfigs] = await Promise.all([
        Promise.all(products.map((p) => projectAssetService.listByProduct(p.id))).then((arrs) => arrs.flat()),
        Promise.all(products.map((p) => productConfigService.listByProduct(p.id))).then((arrs) => arrs.flat()),
      ]);
      setAssets(allAssets);
      setConfigs(allConfigs);
    } finally {
      setLoading(false);
    }
  }

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const configMap = useMemo(() => new Map(configs.map((c) => [c.id, c])), [configs]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (productFilter && a.productId !== productFilter) return false;
      if (q && !([a.assetTag, a.serialNumber, a.assetModel, a.manufacturer, a.location].some((f) => f?.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [assets, statusFilter, productFilter, search]);

  const summary = useMemo(() => ({
    total: assets.length,
    complete: assets.filter((a) => a.status === "Complete").length,
    issue: assets.filter((a) => a.status === "Issue").length,
    inProgress: assets.filter((a) => a.status === "InProgress").length,
    notStarted: assets.filter((a) => a.status === "NotStarted").length,
  }), [assets]);

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>Asset Registry</Typography>
          <Typography variant="body2" color="text.secondary">
            Full registry of all project assets across products — model, manufacturer, serial, workflow and config used.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} onClick={loadAll}>
          Refresh
        </Button>
      </Stack>

      {/* Summary bar */}
      {!loading && assets.length > 0 && (
        <Paper className="glass-card" sx={{ px: 2.5, py: 1.5 }}>
          <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={1.5} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary" fontWeight={700}
              sx={{ textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>
              Registry total
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`${summary.total} total`} />
              {summary.complete > 0 && <Chip size="small" label={`${summary.complete} complete`} color="success" />}
              {summary.inProgress > 0 && <Chip size="small" label={`${summary.inProgress} in progress`} color="primary" />}
              {summary.issue > 0 && <Chip size="small" label={`${summary.issue} with issues`} color="error" />}
              {summary.notStarted > 0 && <Chip size="small" label={`${summary.notStarted} not started`} />}
            </Stack>
          </Stack>
        </Paper>
      )}

      {/* Filters */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Product</InputLabel>
          <Select label="Product" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <MenuItem value="">All products</MenuItem>
            {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
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
          placeholder="Search tag / serial / model / manufacturer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment>,
          }}
        />
      </Stack>

      {/* Registry table */}
      <Paper className="glass-card" sx={{ overflow: "hidden" }}>
        {loading ? (
          <Stack alignItems="center" justifyContent="center" sx={{ p: 6 }}>
            <CircularProgress size={32} />
          </Stack>
        ) : visibleAssets.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="info">
              {assets.length === 0
                ? "No assets found. Assets created in the installation page will appear here."
                : "No assets match the current filters."}
            </Alert>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><Typography variant="caption" fontWeight={700}>Asset Tag</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Product</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Asset Model</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Manufacturer</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Serial #</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Project</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Site</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Config / Workflow</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Status</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleAssets.map((asset) => {
                const proj = projectMap.get(asset.projectId);
                const cfg = asset.productConfigId ? configMap.get(asset.productConfigId) : null;
                const product = productMap.get(asset.productId);

                return (
                  <TableRow key={asset.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{asset.assetTag}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{product?.name ?? "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{asset.assetModel || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{asset.manufacturer || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{asset.serialNumber || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={proj?.customerName ?? ""}>
                        <Typography variant="body2" color="text.secondary">
                          {proj ? proj.jobNumber : asset.projectId.slice(0, 8)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{proj?.siteName || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        {cfg ? (
                          <Typography variant="body2" color="text.secondary">{cfg.name}</Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                        {cfg?.configType && (
                          <Typography variant="caption" color="text.disabled">{cfg.configType}</Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[asset.status as ProjectAssetStatus] ?? asset.status}
                        color={STATUS_COLORS[asset.status as ProjectAssetStatus] ?? "default"}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
