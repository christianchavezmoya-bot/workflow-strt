/**
 * BomProductSelector
 * Step shown before file upload — user picks Division → Product (or creates one).
 * Stores the selected product in BomProjectContext.
 */
import { useEffect, useState } from "react";
import {
  Box, Button, Stack, Typography, Alert,
  FormControl, InputLabel, Select, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, CircularProgress, Chip, Divider,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { divisionService } from "../../../services/divisionService";
import { productService } from "../../../services/productService";
import { featureService } from "../../../services/featureService";
import type { Division } from "../../../types/division";
import type { Product } from "../../../types/product";
import type { Feature } from "../../../types/feature";
import { useBomProject } from "../store/BomProjectContext";

export default function BomProductSelector() {
  const { state, dispatch } = useBomProject();

  const [divisions, setDivisions]     = useState<Division[]>([]);
  const [products, setProducts]       = useState<Product[]>([]);
  const [features, setFeatures]       = useState<Feature[]>([]);
  const [loading, setLoading]         = useState(true);

  const [divisionId, setDivisionId]   = useState<string>("");
  const [productId, setProductId]     = useState<string>(state.selectedProduct?.id ?? "");

  // Create product dialog
  const [createOpen, setCreateOpen]   = useState(false);
  const [newName, setNewName]         = useState("");
  const [newDesc, setNewDesc]         = useState("");
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  // Load divisions + products on mount
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([divisionService.getAll(), productService.getProducts()])
      .then(([divs, prods]) => {
        setDivisions(divs.filter((d) => d.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
        setProducts(prods.sort((a, b) => a.name.localeCompare(b.name)));
        // If product already selected, restore division
        if (state.selectedProduct) {
          setDivisionId(state.selectedProduct.divisionId ?? "");
          setProductId(state.selectedProduct.id);
        }
      })
      .catch((err) => {
        const msg = err?.response?.status
          ? `API error ${err.response.status}: ${err.response.data?.message ?? err.message}`
          : String(err?.message ?? err);
        setLoadError(`Could not load divisions/products — ${msg}. Check that the server is running and migrations have been applied (dotnet ef database update).`);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load features when product changes
  useEffect(() => {
    if (!productId) { setFeatures([]); return; }
    featureService.getByProduct(productId).then(setFeatures).catch(() => setFeatures([]));
  }, [productId]);

  const filteredProducts = divisionId
    ? products.filter((p) => p.divisionId === divisionId)
    : products;

  const selectedProduct = products.find((p) => p.id === productId) ?? null;

  const handleProductChange = (id: string) => {
    setProductId(id);
    const prod = products.find((p) => p.id === id) ?? null;
    dispatch({ type: "SET_SELECTED_PRODUCT", payload: prod });
    // Auto-populate division from the selected product
    if (prod?.divisionId) setDivisionId(prod.divisionId);
  };

  const handleDivisionChange = (id: string) => {
    setDivisionId(id);
    // Clear product if it doesn't belong to new division
    const current = products.find((p) => p.id === productId);
    if (current && id && current.divisionId !== id) {
      setProductId("");
      dispatch({ type: "SET_SELECTED_PRODUCT", payload: null });
    }
  };

  const handleCreateProduct = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await productService.createProduct({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        divisionId: divisionId || undefined,
      });
      const updated = await productService.getProducts();
      setProducts(updated.sort((a, b) => a.name.localeCompare(b.name)));
      setProductId(created.id);
      dispatch({ type: "SET_SELECTED_PRODUCT", payload: created });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
    } catch {
      setCreateError("Failed to create product. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">Loading products…</Typography>
      </Stack>
    );
  }

  if (loadError) {
    return (
      <Alert severity="error" sx={{ mt: 1 }}>
        {loadError}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Which product is this BOM for?
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Select the product so existing features are matched and new ones are added automatically.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
        {/* Division */}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel shrink>Division (optional)</InputLabel>
          <Select
            value={divisionId}
            label="Division (optional)"
            onChange={(e) => handleDivisionChange(e.target.value)}
          >
            <MenuItem value=""><em>All divisions</em></MenuItem>
            {divisions.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Product */}
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel shrink>Product *</InputLabel>
          <Select
            value={productId}
            label="Product *"
            onChange={(e) => handleProductChange(e.target.value)}
            displayEmpty
          >
            <MenuItem value=""><em>Select a product…</em></MenuItem>
            {filteredProducts.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                <Stack>
                  <Typography variant="body2">{p.name}</Typography>
                  {p.divisionName && (
                    <Typography variant="caption" color="text.secondary">{p.divisionName}</Typography>
                  )}
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          size="small"
          variant="outlined"
          startIcon={<AddOutlinedIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ mt: 0.5 }}
        >
          New Product
        </Button>
      </Stack>

      {/* Warning if no products in division */}
      {divisionId && filteredProducts.length === 0 && (
        <Alert severity="warning" icon={<WarningAmberOutlinedIcon />} sx={{ mt: 2, maxWidth: 480 }}>
          No products found in this division.{" "}
          <Button size="small" onClick={() => setCreateOpen(true)}>Create one now</Button>
        </Alert>
      )}

      {/* Selected product summary */}
      {selectedProduct && (
        <Box mt={2} p={1.5} sx={{ border: "1px solid", borderColor: "success.main", borderRadius: 1.5, background: "rgba(46,125,50,0.04)", maxWidth: 520 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={features.length > 0 ? 1 : 0}>
            <CheckCircleOutlineIcon sx={{ color: "success.main", fontSize: 16 }} />
            <Typography variant="body2" fontWeight={600}>{selectedProduct.name}</Typography>
            {selectedProduct.divisionName && (
              <Chip label={selectedProduct.divisionName} size="small" variant="outlined" />
            )}
          </Stack>
          {features.length > 0 && (
            <>
              <Divider sx={{ mb: 1 }} />
              <Typography variant="caption" color="text.secondary" display="block" mb={0.75}>
                {features.length} existing feature{features.length !== 1 ? "s" : ""} — BOM rows will be matched against these:
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {features.map((f) => (
                  <Chip key={f.id} label={f.name} size="small" variant="outlined" color="primary" />
                ))}
              </Stack>
            </>
          )}
          {features.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              No features yet — all BOM rows will be added as new features.
            </Typography>
          )}
        </Box>
      )}

      {/* Create product dialog */}
      <Dialog open={createOpen} onClose={() => !creating && setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create New Product</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Product Name *"
              size="small"
              fullWidth
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. AIM-100, HazardAvert"
              autoFocus
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Description (optional)"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Division (optional)</InputLabel>
              <Select
                value={divisionId}
                label="Division (optional)"
                onChange={(e) => setDivisionId(e.target.value)}
              >
                <MenuItem value=""><em>No division</em></MenuItem>
                {divisions.map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {createError && <Alert severity="error">{createError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateProduct}
            disabled={creating || !newName.trim()}
            startIcon={creating ? <CircularProgress size={14} /> : undefined}
          >
            {creating ? "Creating…" : "Create Product"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
