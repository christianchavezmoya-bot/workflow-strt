import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { AddOutlined, DeleteOutline, EditOutlined, Print, Download, SearchOutlined, CheckCircleOutline, BlockOutlined, ExpandMoreOutlined, ExpandLessOutlined, UploadFileOutlined, ArrowUpwardOutlined, ArrowDownwardOutlined, UnfoldMoreOutlined } from "@mui/icons-material";
import { quickbaseService, type QbFieldInfo } from "../../services/quickbaseService";
import { ChangeEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fieldService, FieldDefinition } from "../../services/fieldService";
import { workflowTypeService } from "../../services/workflowTypeService";
import type { WorkflowType } from "../../types/workflowType";
import axios from "axios";
import { divisionService } from "../../services/divisionService";
import type { Division } from "../../types/division";
import { featureService } from "../../services/featureService";
import type { Feature } from "../../types/feature";
import { featureDependencyService } from "../../services/featureDependencyService";
import type { FeatureDependency } from "../../types/featureDependency";
import { productService } from "../../services/productService";
import type { Product } from "../../types/product";
import api from "../../services/api";
import { randomId } from "../../utils/randomId";
import { settingsService } from "../../services/settingsService";
import { getFallbackPublicFrontendBaseUrl } from "../../services/publicFrontendBase";
import { QuickbaseSettingsForm, QuickbaseSettingsPayload } from "../../types/settings";
import { useFieldNotifications } from "../../contexts/FieldNotificationContext";
import { useAppToast } from "../../contexts/AppToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useAuth } from "../../hooks/useAuth";
import { brandSettingsService } from "../../services/brandSettingsService";
import { APP_NAME } from "../../constants/branding";
import PasswordField from "../../components/ui/PasswordField";
import { secureGet, secureRemove } from "../../services/secureStorage";
import { escapeHtml, openPrintWindow } from "../../utils/printWindow";
import RecoveryCenter from "./RecoveryCenter";
import { fieldLabelSx } from "../admin/adminShared";

async function loadXlsx() {
  return import("xlsx");
}

// ─── Business Logo Tab ────────────────────────────────────────────────────────
function BusinessLogoTab() {
  const confirmAction = useConfirm();
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [appName, setAppName] = useState("");
  const [appNameSaving, setAppNameSaving] = useState(false);
  const [appNameSuccess, setAppNameSuccess] = useState(false);
  const [appNameError, setAppNameError] = useState<string | null>(null);

  useEffect(() => {
    brandSettingsService.get().then((data) => {
      setLogo(data.logoBase64 ?? null);
      setAppName(data.appName ?? "");
      setLoading(false);
    });
  }, []);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      setError("File too large. Maximum size is 500 KB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setSaving(true);
      setError(null);
      try {
        const updated = await brandSettingsService.set(base64);
        setLogo(updated.logoBase64 ?? null);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch {
        setError("Failed to save logo. Make sure you are logged in as Admin.");
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleDelete() {
    const proceed = await confirmAction({
      title: "Remove logo",
      message: "Remove the business logo?",
      confirmLabel: "Remove",
      severity: "warning",
    });
    if (!proceed) return;
    setDeleting(true);
    setError(null);
    try {
      await brandSettingsService.remove();
      setLogo(null);
    } catch {
      setError("Failed to remove logo.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveAppName() {
    setAppNameSaving(true);
    setAppNameError(null);
    try {
      await brandSettingsService.setAppName(appName.trim());
      const resolvedName = appName.trim() || APP_NAME;
      document.title = resolvedName;
      window.dispatchEvent(new CustomEvent("brand-name-changed", { detail: { appName: resolvedName } }));
      setAppNameSuccess(true);
      setTimeout(() => setAppNameSuccess(false), 3000);
    } catch {
      setAppNameError("Failed to save app name.");
    } finally {
      setAppNameSaving(false);
    }
  }

  return (
    <Stack spacing={2} sx={{ marginTop: 2 }}>
      <Typography variant="h6">App Name</Typography>
      <Typography variant="body2" color="text.secondary">
        The name shown in the browser tab, invite emails, and throughout the app.
      </Typography>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

      {!loading && (
        <>
          <TextField
            label="App Name"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder={`e.g. ${APP_NAME}`}
            sx={{ maxWidth: 360 }}
            size="small"
            InputLabelProps={{ shrink: true }}
          />
          {appNameError && <Alert severity="error" sx={{ maxWidth: 500 }}>{appNameError}</Alert>}
          {appNameSuccess && <Alert severity="success" sx={{ maxWidth: 500 }}>App name saved.</Alert>}
          <Box>
            <Button variant="contained" onClick={handleSaveAppName} disabled={appNameSaving} sx={{ minWidth: 120 }}>
              {appNameSaving ? "Saving…" : "Save Name"}
            </Button>
          </Box>
        </>
      )}

      <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", mt: 1 }} />
      <Typography variant="h6">Business Logo</Typography>
      <Typography variant="body2" color="text.secondary">
        Upload your company logo. It will appear in the left header of generated PDF reports.
        Accepted formats: PNG, JPG, SVG — maximum 500 KB.
      </Typography>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

      {loading ? (
        <CircularProgress size={24} />
      ) : (
        <>
          <Box
            sx={{
              width: 320,
              height: 110,
              border: "1px dashed rgba(255,255,255,0.25)",
              borderRadius: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {logo ? (
              <Box
                component="img"
                src={logo}
                alt="Business logo"
                sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: "8px" }}
              />
            ) : (
              <Typography variant="body2" color="text.disabled">
                No logo set
              </Typography>
            )}
          </Box>

          {error && <Alert severity="error" sx={{ maxWidth: 500 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ maxWidth: 500 }}>Logo saved successfully.</Alert>}

          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="contained"
              component="label"
              disabled={saving}
              sx={{ minWidth: 140 }}
            >
              {saving ? "Uploading…" : logo ? "Replace Logo" : "Upload Logo"}
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleFileChange}
              />
            </Button>
            {logo && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteOutline />}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "Removing…" : "Remove Logo"}
              </Button>
            )}
          </Stack>

          <Typography variant="caption" color="text.disabled">
            Only Admins can upload or remove the logo.
          </Typography>
        </>
      )}
    </Stack>
  );
}

const defaultSettings: QuickbaseSettingsForm = {
  enabled: false,
  realmHostname: "",
  userToken: "",
  projectsTableId: "",
  installationsTableId: "",
  projectsFieldMap: "{}",
  installationsFieldMap: "{}",
  goodsMovementsTableId: "",
  goodsMovementsJobFid: "",
  goodsMovementsOrderRefFid: "",
  goodsMovementsDirectionFid: ""
};

const loadSettings = (): QuickbaseSettingsForm => defaultSettings;

const parseJsonMap = (value: string) => {
  try {
    const parsed = JSON.parse(value) as Record<string, number>;
    if (parsed && typeof parsed === "object") {
      return { value: parsed, error: "" };
    }
    return { value: null, error: "JSON must be an object map." };
  } catch {
    return { value: null, error: "Invalid JSON" };
  }
};

interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  timestamp: string;
}

const SETTINGS_TAB_KEYS = ["quickbase", "sms", "fields", "divisions", "products", "features", "workflow-types", "logo", "recovery", "audit"];

function getVisibleSettingsTabKeys(isAdmin: boolean) {
  return isAdmin ? SETTINGS_TAB_KEYS : SETTINGS_TAB_KEYS.slice(0, 8);
}

function resolveSettingsTabKey(isAdmin: boolean, search: string) {
  const visibleKeys = getVisibleSettingsTabKeys(isAdmin);
  const urlKey = new URLSearchParams(search).get("tab");
  if (urlKey && visibleKeys.includes(urlKey)) return urlKey;

  const stored = localStorage.getItem("settings_active_tab");
  if (stored) {
    if (visibleKeys.includes(stored)) return stored;
    const legacyIndex = Number.parseInt(stored, 10);
    if (!Number.isNaN(legacyIndex)) {
      const legacyKey = SETTINGS_TAB_KEYS[legacyIndex];
      if (legacyKey && visibleKeys.includes(legacyKey)) return legacyKey;
    }
  }

  return visibleKeys[0] ?? SETTINGS_TAB_KEYS[0];
}

const Settings = () => {
  const { addNotification } = useFieldNotifications();
  const { user } = useAuth();
  const toast = useAppToast();
  const confirmAction = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  // Read synchronously from secure storage so isAdmin is correct on the first render,
  // before useAuth has loaded the real user from storage into component state.
  const isAdmin = Boolean(
    user?.role === "Admin" ||
    secureGet("auth_user")?.includes('"Admin"') ||
    secureGet("local_auth_user")?.includes('"Admin"')
  );
  const visibleSettingsTabKeys = useMemo(() => getVisibleSettingsTabKeys(isAdmin), [isAdmin]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState(() => resolveSettingsTabKey(isAdmin, window.location.search));
  const tab = Math.max(0, visibleSettingsTabKeys.indexOf(activeTabKey));

  // Only re-validate when admin status changes (not on every tab click).
  // Reading window.location.search here is intentional — we want the URL at
  // the moment isAdmin changes, not a React-batched snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const visibleKeys = getVisibleSettingsTabKeys(isAdmin);
    setActiveTabKey((prev) => (visibleKeys.includes(prev) ? prev : (visibleKeys[0] ?? SETTINGS_TAB_KEYS[0])));
  }, [isAdmin]);

  const [settings, setSettings] = useState<QuickbaseSettingsForm>(() => loadSettings());
  const [status, setStatus] = useState<"" | "saved" | "sent" | "error">("");
  const [discoverOpen,   setDiscoverOpen]   = useState(false);
  const [discoverFields, setDiscoverFields] = useState<QbFieldInfo[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError,  setDiscoverError]  = useState<string | null>(null);
  const [testLoading,  setTestLoading]  = useState(false);
  const [testResult,   setTestResult]   = useState<{ success: boolean; message: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [apiStatus, setApiStatus] = useState<"running" | "stopped" | "unknown">("unknown");
  const [apiBusy, setApiBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [editField, setEditField] = useState<null | { id: string; name: string; type: string }>(null);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [assignedFieldsDraft, setAssignedFieldsDraft] = useState<Record<string, string[]>>({});
  const [assignedFieldsDirty, setAssignedFieldsDirty] = useState(false);
  const [assignedFieldsSaving, setAssignedFieldsSaving] = useState(false);
  const [lookupFieldId, setLookupFieldId] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ migrated: number; message?: string } | null>(null);
  const [lookupRows, setLookupRows] = useState<Record<string, Array<{ id: string; label: string }>>>({});
  const [notifySettings, setNotifySettings] = useState<Record<string, string | boolean>>({
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    smtpUseSsl: true,
    frontendBaseUrl: getFallbackPublicFrontendBaseUrl(),
    smsProvider: "",
    smsApiKey: "",
    smsSender: ""
  });
  const [notifySending, setNotifySending] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState<"" | "saved" | "sent" | "error">("");
  const [notifyError, setNotifyError] = useState<string | null>(null);

  // Divisions manager
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionsLoading, setDivisionsLoading] = useState(false);
  const [divisionDialog, setDivisionDialog] = useState(false);
  const [divisionEditId, setDivisionEditId] = useState<string | null>(null);
  const [divisionForm, setDivisionForm] = useState({ name: "", description: "", sortOrder: "99" });
  const [divisionSaving, setDivisionSaving] = useState(false);
  const [divisionError, setDivisionError] = useState<string | null>(null);
  const [deleteDivisionConfirm, setDeleteDivisionConfirm] = useState<{ id: string; name: string } | null>(null);

  async function loadDivisions() {
    setDivisionsLoading(true);
    try {
      const data = await divisionService.getAll();
      setDivisions(data.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch { console.warn("Failed to load divisions"); } finally {
      setDivisionsLoading(false);
    }
  }

  async function saveDivision() {
    if (!divisionForm.name.trim()) { setDivisionError("Name is required."); return; }
    setDivisionSaving(true);
    setDivisionError(null);
    try {
      const sortOrder = parseInt(divisionForm.sortOrder, 10) || 99;
      if (divisionEditId) {
        await divisionService.update(divisionEditId, { name: divisionForm.name.trim(), description: divisionForm.description || undefined, sortOrder });
      } else {
        await divisionService.create({ name: divisionForm.name.trim(), description: divisionForm.description || undefined, sortOrder });
      }
      await loadDivisions();
      setDivisionDialog(false);
    } catch { setDivisionError("Failed to save division."); } finally {
      setDivisionSaving(false);
    }
  }

  async function removeDivision(id: string) {
    const div = divisions.find((d) => d.id === id);
    setDeleteDivisionConfirm({ id, name: div?.name ?? "this division" });
  }

  async function confirmRemoveDivision() {
    if (!deleteDivisionConfirm) return;
    try {
      await divisionService.remove(deleteDivisionConfirm.id);
      setDivisions((prev) => prev.filter((d) => d.id !== deleteDivisionConfirm.id));
      setDeleteDivisionConfirm(null);
    } catch { setDeleteDivisionConfirm(null); toast.error("Failed to delete division."); }
  }

  async function toggleDivisionActive(id: string, currentIsActive: boolean) {
    try {
      await divisionService.update(id, { isActive: !currentIsActive });
      setDivisions((prev) => prev.map((d) => d.id === id ? { ...d, isActive: !currentIsActive } : d));
    } catch { toast.error("Failed to update division status."); }
  }

  // Product catalog manager
  const [products, setProducts] = useState<Product[]>([]);
  // Start as true if landing directly on Products tab so spinner shows immediately, not "No products yet."
  const [productsLoading, setProductsLoading] = useState(() => {
    return resolveSettingsTabKey(
      Boolean(user?.role === "Admin" || secureGet("local_auth_user")?.includes('"Admin"')),
      window.location.search
    ) === "products";
  });
  const [productDialog, setProductDialog] = useState(false);
  const [productEditId, setProductEditId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({ name: "", description: "", divisionId: "" });
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [featurePickerProductId, setFeaturePickerProductId] = useState<string | null>(null);
  const [featurePickerAnchor, setFeaturePickerAnchor] = useState<HTMLElement | null>(null);
  const [featurePickerSearch, setFeaturePickerSearch] = useState("");
  const [featurePickerSelected, setFeaturePickerSelected] = useState<string[]>([]);
  const [featurePickerLinking, setFeaturePickerLinking] = useState(false);
  const [deleteImpactDialog, setDeleteImpactDialog] = useState<{
    open: boolean;
    productId: string;
    productName: string;
    loading: boolean;
    error: string | null;
    features: Array<{ id: string; name: string; valueType: string; alsoUsedIn: string[] }>;
    projects: Array<{ id: string; name: string; jobNumber?: string }>;
    assets: Array<{ id: string; assetName: string; projectName?: string }>;
    workflows: Array<{ id: string; name: string; workflowType?: string }>;
    selectedDeleteFeatureIds: string[];
    selectedDeleteAssetIds: string[];
    selectedDeleteWorkflowIds: string[];
  }>({
    open: false, productId: "", productName: "", loading: false, error: null,
    features: [], projects: [], assets: [], workflows: [],
    selectedDeleteFeatureIds: [], selectedDeleteAssetIds: [], selectedDeleteWorkflowIds: [],
  });

  const [productsError, setProductsError] = useState<string | null>(null);

  async function loadProducts() {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const data = await productService.getProducts();
      setProducts(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setProductsError(status ? `Failed to load products (HTTP ${status})` : "Failed to load products — check server connection.");
    } finally {
      setProductsLoading(false);
    }
  }

  // Load products + divisions when Products tab becomes active.
  // Load features when Features tab becomes active.
  // Always reload — don't guard on length so switching back refreshes data.
  useEffect(() => {
    if (activeTabKey === "products") {
      loadProducts();
      if (divisions.length === 0) loadDivisions();
    }
    if (activeTabKey === "divisions" && divisions.length === 0) {
      loadDivisions();
    }
    if (activeTabKey === "features") {
      loadFeatures();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabKey]);

  async function saveProduct() {
    if (!productForm.name.trim()) { setProductError("Name is required."); return; }
    setProductSaving(true);
    setProductError(null);
    try {
      if (productEditId) {
        await productService.updateProduct(productEditId, {
          name: productForm.name.trim(),
          description: productForm.description || undefined,
          divisionId: productForm.divisionId || undefined,
        });
      } else {
        await productService.createProduct({
          name: productForm.name.trim(),
          description: productForm.description || undefined,
          divisionId: productForm.divisionId || undefined,
        });
      }
      await loadProducts();
      setProductDialog(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
      setProductError(status?.status === 403 ? "Permission denied — Admin or Project Manager role required." : status?.data?.message ?? "Failed to save product. Check server logs.");
    } finally {
      setProductSaving(false);
    }
  }

  async function removeProduct(id: string) {
    if (!isAdmin) {
      setProductsError("Only Admins can delete products.");
      return;
    }

    setProductsError(null);
    const product = products.find((p) => p.id === id);
    setDeleteImpactDialog({
      open: true, productId: id, productName: product?.name ?? "", loading: true, error: null,
      features: [], projects: [], assets: [], workflows: [],
      selectedDeleteFeatureIds: [], selectedDeleteAssetIds: [], selectedDeleteWorkflowIds: [],
    });
    try {
      const res = await api.get<{
        productName: string;
        features: Array<{ id: string; name: string; valueType: string; alsoUsedIn: string[] }>;
        projects: Array<{ id: string; name: string; jobNumber?: string }>;
        assets: Array<{ id: string; assetName: string; projectName?: string }>;
        workflows: Array<{ id: string; name: string; workflowType?: string }>;
      }>(`/products/${id}/impact`);
      setDeleteImpactDialog((prev) => ({
        ...prev,
        productName: res.data.productName,
        features: res.data.features ?? [],
        projects: res.data.projects ?? [],
        assets: res.data.assets ?? [],
        workflows: res.data.workflows ?? [],
        // Pre-select all for deletion by default
        selectedDeleteFeatureIds: (res.data.features ?? []).map((f) => f.id),
        selectedDeleteAssetIds: (res.data.assets ?? []).map((a) => a.id),
        selectedDeleteWorkflowIds: (res.data.workflows ?? []).map((w) => w.id),
        loading: false,
        error: null,
      }));
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { message?: string; error?: string } } })?.response;
      const message = response?.status === 403
        ? "Only Admins can review product deletion impact."
        : response?.data?.message
          ?? response?.data?.error
          ?? (response?.status ? `Failed to load product impact (HTTP ${response.status}).` : "Failed to load product impact. Check server connection.");
      setDeleteImpactDialog((prev) => ({ ...prev, loading: false, error: message }));
      setProductsError(message);
    }
  }

  async function confirmDeleteProduct() {
    const { productId, selectedDeleteFeatureIds, selectedDeleteAssetIds, selectedDeleteWorkflowIds } = deleteImpactDialog;
    setProductsError(null);
    setDeleteImpactDialog((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await api.delete(`/products/${productId}`, {
        data: {
          deleteFeatureIds: selectedDeleteFeatureIds,
          deleteAssetIds: selectedDeleteAssetIds,
          deleteWorkflowIds: selectedDeleteWorkflowIds,
        },
      });
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      if (expandedProductId === productId) setExpandedProductId(null);
      setDeleteImpactDialog({
        open: false, productId: "", productName: "", loading: false, error: null,
        features: [], projects: [], assets: [], workflows: [],
        selectedDeleteFeatureIds: [], selectedDeleteAssetIds: [], selectedDeleteWorkflowIds: [],
      });
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { message?: string; error?: string } } })?.response;
      const message = response?.status === 403
        ? "Only Admins can delete products."
        : response?.status === 404
          ? "This product no longer exists. Refresh and try again."
          : response?.data?.message
            ?? response?.data?.error
            ?? (response?.status ? `Failed to delete product (HTTP ${response.status}).` : "Failed to delete product. Check server connection.");
      setProductsError(message);
      setDeleteImpactDialog((prev) => ({ ...prev, loading: false, error: message }));
    }
  }

  // After link/unlink, re-fetch products so p.features reflects the change.
  async function linkFeatureToProduct(productId: string, featureId: string) {
    try {
      await featureService.linkToProduct(productId, featureId);
      await loadProducts();
      setFeaturePickerAnchor(null);
      setFeaturePickerProductId(null);
    } catch { toast.error("Failed to link feature."); }
  }

  function closeFeaturePicker() {
    setFeaturePickerAnchor(null);
    setFeaturePickerProductId(null);
    setFeaturePickerSearch("");
    setFeaturePickerSelected([]);
  }

  async function linkSelectedFeatures() {
    if (!featurePickerProductId || featurePickerSelected.length === 0) return;
    setFeaturePickerLinking(true);
    try {
      await Promise.all(featurePickerSelected.map((fid) => featureService.linkToProduct(featurePickerProductId!, fid)));
      await loadProducts();
      closeFeaturePicker();
    } catch { toast.error("Failed to link some features."); }
    finally { setFeaturePickerLinking(false); }
  }

  async function unlinkFeatureFromProduct(productId: string, featureId: string) {
    const proceed = await confirmAction({
      title: "Remove feature",
      message: "Remove this feature from the product?",
      confirmLabel: "Remove",
      severity: "warning",
    });
    if (!proceed) return;
    try {
      await featureService.unlinkFromProduct(productId, featureId);
      await loadProducts();
    } catch { toast.error("Failed to unlink feature."); }
  }

  // Feature library manager
  const [features, setFeatures] = useState<Feature[]>([]);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError] = useState<string | null>(null);
  const [featureDialog, setFeatureDialog] = useState(false);
  const [featureEditId, setFeatureEditId] = useState<string | null>(null);
  const [featureJustCreatedId, setFeatureJustCreatedId] = useState<string | null>(null);
  const [featureForm, setFeatureForm] = useState({ name: "", description: "", valueType: "text", isInventory: false, captureFields: [] as string[], brand: "", supplier: "", alternativePartNumber: "", manufacturerPartNumber: "", unitPrice: "", productLink: "", productLinks: [] as string[] });
  /** Snapshot of the product ids linked when the edit dialog was opened, used to diff against featureForm.productLinks on save. */
  const [featureOriginalProductLinks, setFeatureOriginalProductLinks] = useState<string[]>([]);
  const [featureSaving, setFeatureSaving] = useState(false);
  const [featureError, setFeatureError] = useState<string | null>(null);

  // Feature library filters + sort
  const [featureSearch, setFeatureSearch] = useState("");
  const [featureFilterProduct, setFeatureFilterProduct] = useState<string>("all");
  const [featureFilterInventory, setFeatureFilterInventory] = useState<"all" | "inventory" | "non-inventory">("all");
  type FeatureSortKey = "name" | "valueType" | "isInventory" | "brand" | "supplier" | "manufacturerPartNumber" | "alternativePartNumber" | "unitPrice";
  const [featureSort, setFeatureSort] = useState<{ key: FeatureSortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  function toggleFeatureSort(key: FeatureSortKey) {
    setFeatureSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  const filteredSortedFeatures = useMemo(() => {
    let list = [...features];
    // Global search
    if (featureSearch.trim()) {
      const q = featureSearch.trim().toLowerCase();
      list = list.filter((f) =>
        f.name.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q) ||
        (f.brand ?? "").toLowerCase().includes(q) ||
        (f.supplier ?? "").toLowerCase().includes(q) ||
        (f.manufacturerPartNumber ?? "").toLowerCase().includes(q) ||
        (f.alternativePartNumber ?? "").toLowerCase().includes(q)
      );
    }
    // Product filter
    if (featureFilterProduct !== "all") {
      list = list.filter((f) => f.linkedProducts?.includes(featureFilterProduct));
    }
    // Inventory filter
    if (featureFilterInventory === "inventory") list = list.filter((f) => f.isInventory);
    if (featureFilterInventory === "non-inventory") list = list.filter((f) => !f.isInventory);
    // Sort
    list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (featureSort.key === "isInventory") { av = a.isInventory ? 1 : 0; bv = b.isInventory ? 1 : 0; }
      else if (featureSort.key === "unitPrice") { av = a.unitPrice ?? 0; bv = b.unitPrice ?? 0; }
      else { av = (a[featureSort.key] as string ?? "").toLowerCase(); bv = (b[featureSort.key] as string ?? "").toLowerCase(); }
      if (av < bv) return featureSort.dir === "asc" ? -1 : 1;
      if (av > bv) return featureSort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [features, featureSearch, featureFilterProduct, featureFilterInventory, featureSort]);

  // Bulk feature import state
  interface ImportRow { name: string; description: string; valueType: string; supplier: string; partNumber: string; manufacturerPartNumber: string; unitPrice: string; brand: string; isInventory?: boolean; }
  const [featureImportDialog, setFeatureImportDialog] = useState(false);
  const [featureImportRows, setFeatureImportRows] = useState<ImportRow[]>([]);
  const [featureImportProduct, setFeatureImportProduct] = useState<string>("");
  const [featureImportError, setFeatureImportError] = useState<string | null>(null);
  const [featureImporting, setFeatureImporting] = useState(false);
  const [featureImportDone, setFeatureImportDone] = useState<{ created: number; skipped: number } | null>(null);
  const featureImportFileRef = useRef<HTMLInputElement>(null);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null);

  function exportFeaturesCSV() {
    const headers = ["name","description","valueType","brand","supplier","partNumber","manufacturerPartNumber","unitPrice"];
    const rows = features.map(f => [f.name, f.description??"", f.valueType, f.brand??"", f.supplier??"", f.alternativePartNumber??"", f.manufacturerPartNumber??"", f.unitPrice!=null?String(f.unitPrice):""]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "features.csv"; a.click(); URL.revokeObjectURL(url);
  }

  async function exportFeaturesXLSX() {
    try {
      const XLSX = await loadXlsx();
      const headers = ["Name/Part#","Description","Type","Brand","Supplier","Business Part#","Mfr Part#","Unit Price"];
      const rows = features.map(f => [f.name, f.description??"", f.valueType, f.brand??"", f.supplier??"", f.alternativePartNumber??"", f.manufacturerPartNumber??"", f.unitPrice!=null?String(f.unitPrice):""]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Features");
      XLSX.writeFile(wb, "features.xlsx");
    } catch {
      toast.error("Failed to export Excel file. Check console for details.");
    }
  }

  function exportFeaturesJSON() {
    const blob = new Blob([JSON.stringify(features, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "features.json"; a.click(); URL.revokeObjectURL(url);
  }

  function exportFeaturesPDF() {
    const rows = features.map((f) => `
      <tr>
        <td>${escapeHtml(f.name)}</td>
        <td>${escapeHtml(f.description ?? "")}</td>
        <td>${escapeHtml(f.valueType)}</td>
        <td>${escapeHtml(f.brand ?? "")}</td>
        <td>${escapeHtml(f.supplier ?? "")}</td>
        <td>${escapeHtml(f.alternativePartNumber ?? "")}</td>
        <td>${escapeHtml(f.manufacturerPartNumber ?? "")}</td>
        <td>${escapeHtml(f.unitPrice ?? "")}</td>
      </tr>
    `).join("");
    if (!openPrintWindow(
      `<html><head><title>Feature Library</title><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#f5f5f5}</style></head><body><h2>Feature Library</h2><table><thead><tr><th>Name/Part#</th><th>Description</th><th>Type</th><th>Brand</th><th>Supplier</th><th>Business Part#</th><th>Mfr Part#</th><th>Unit Price</th></tr></thead><tbody>${rows}</tbody></table></body></html>`,
      true
    )) {
      console.warn("[Settings] Print popup was blocked -- allow popups for this site to print.");
    }
  }

  async function downloadFeatureTemplate() {
    try {
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.aoa_to_sheet([
        ["name", "description", "valueType", "brand", "supplier", "partNumber", "manufacturerPartNumber", "unitPrice"],
        ["IP Camera 4MP", "Indoor dome camera", "text", "Hikvision", "AV Security", "DS-2CD2143G2-I", "MFR-DS-2143G2", "149.00"],
        ["* required", "optional", "optional (default: text)", "optional", "optional", "optional", "optional", "optional"],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Features");
      XLSX.writeFile(wb, "features-template.xlsx");
    } catch {
      toast.error("Failed to download template. Check console for details.");
    }
  }

  function handleFeatureImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeatureImportError(null);
    setFeatureImportDone(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await loadXlsx();
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        const parsed: ImportRow[] = rows.map((r) => {
          const invRaw = String(r["isInventory"] || r["is_inventory"] || r["inventory"] || r["Inventory"] || "").trim().toLowerCase();
          return {
            name: String(r["name"] || r["Name"] || "").trim(),
            description: String(r["description"] || r["Description"] || "").trim(),
            valueType: String(r["valueType"] || r["type"] || r["Type"] || "text").trim() || "text",
            supplier: String(r["supplier"] || r["Supplier"] || "").trim(),
            partNumber: String(r["partNumber"] || r["part_number"] || r["PartNumber"] || r["part#"] || "").trim(),
            manufacturerPartNumber: String(r["manufacturerPartNumber"] || r["manufacturer_part_number"] || r["ManufacturerPartNumber"] || r["mfr_part"] || "").trim(),
            unitPrice: String(r["unitPrice"] || r["unit_price"] || r["UnitPrice"] || r["price"] || "").trim(),
            brand: String(r["brand"] || r["Brand"] || "").trim(),
            isInventory: invRaw === "true" || invRaw === "yes" || invRaw === "1",
          };
        }).filter((r) => r.name);
        if (!parsed.length) { setFeatureImportError("No valid rows found. Make sure the file has a 'name' column."); return; }
        setFeatureImportRows(parsed);
      } catch {
        setFeatureImportError("Could not parse file. Use the template for correct format.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  async function runFeatureImport() {
    setFeatureImporting(true);
    setFeatureImportError(null);
    let created = 0; let skipped = 0;
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const existing = await featureService.getAll();
    const existingKeys = new Set(existing.map((f) => normalize(f.name)));
    for (const row of featureImportRows) {
      if (existingKeys.has(normalize(row.name))) { skipped++; continue; }
      try {
        const created_ = await featureService.create({
          name: row.name,
          description: row.description || undefined,
          valueType: row.valueType,
          isInventory: row.isInventory ?? false,
          supplier: row.supplier || undefined,
          alternativePartNumber: row.partNumber || undefined,
          manufacturerPartNumber: row.manufacturerPartNumber || undefined,
          unitPrice: row.unitPrice ? Number(row.unitPrice) : undefined,
          brand: row.brand || undefined,
        });
        if (featureImportProduct) {
          await featureService.linkToProduct(featureImportProduct, created_.id);
        }
        existingKeys.add(normalize(row.name));
        created++;
      } catch { skipped++; }
    }
    await loadFeatures();
    setFeatureImporting(false);
    setFeatureImportDone({ created, skipped });
  }

  async function loadFeatures() {
    setFeaturesLoading(true);
    setFeaturesError(null);
    try {
      const data = await featureService.getAll();
      setFeatures(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFeaturesError(status ? `Failed to load features (HTTP ${status})` : "Failed to load features — check server connection.");
    } finally {
      setFeaturesLoading(false);
    }
  }

  // Load features (and products for the filter dropdown) whenever Features tab becomes active.
  useEffect(() => {
    if (activeTabKey === "features") {
      loadFeatures();
      if (products.length === 0) loadProducts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabKey]);

  async function saveFeature() {
    if (!featureForm.name.trim()) { setFeatureError("Name is required."); return; }
    setFeatureSaving(true);
    setFeatureError(null);
    try {
      const procurementFields = {
        brand: featureForm.brand.trim() || undefined,
        supplier: featureForm.supplier.trim() || undefined,
        alternativePartNumber: featureForm.alternativePartNumber.trim() || undefined,
        manufacturerPartNumber: featureForm.manufacturerPartNumber.trim() || undefined,
        unitPrice: featureForm.unitPrice.trim() ? Number(featureForm.unitPrice) : undefined,
        productLink: featureForm.productLink.trim() || undefined,
      };
      if (featureEditId) {
        await featureService.update(featureEditId, {
          name: featureForm.name.trim(),
          description: featureForm.description || undefined,
          valueType: featureForm.valueType,
          isInventory: featureForm.isInventory,
          captureFields: featureForm.captureFields,
          ...procurementFields,
        });
        // Sync product links: link newly-checked products, unlink newly-unchecked ones
        const toLink = featureForm.productLinks.filter((pid) => !featureOriginalProductLinks.includes(pid));
        const toUnlink = featureOriginalProductLinks.filter((pid) => !featureForm.productLinks.includes(pid));
        if (toLink.length > 0 || toUnlink.length > 0) {
          await Promise.all([
            ...toLink.map((pid) => featureService.linkToProduct(pid, featureEditId)),
            ...toUnlink.map((pid) => featureService.unlinkFromProduct(pid, featureEditId)),
          ]);
          await loadProducts();
        }
        await loadFeatures();
        setFeatureDialog(false);
      } else {
        const created = await featureService.create({
          name: featureForm.name.trim(),
          description: featureForm.description || undefined,
          valueType: featureForm.valueType,
          isInventory: featureForm.isInventory,
          captureFields: featureForm.captureFields,
          ...procurementFields,
        });
        // Link to all selected products
        if (featureForm.productLinks.length > 0) {
          await Promise.all(featureForm.productLinks.map((pid) => featureService.linkToProduct(pid, created.id)));
          await loadProducts();
        }
        await loadFeatures();
        // Stay open so user can add dependencies immediately
        setFeatureJustCreatedId(created.id);
        setExpandedFeatureId(created.id);
        loadDeps(created.id);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
      setFeatureError(status?.status === 403 ? "Permission denied — Admin or Project Manager role required." : status?.data?.message ?? "Failed to save feature. Check server logs.");
    } finally {
      setFeatureSaving(false);
    }
  }

  async function removeFeature(id: string) {
    const proceed = await confirmAction({
      title: "Delete feature",
      message: "Delete this feature? It will be unlinked from all products.",
      confirmLabel: "Delete",
      severity: "error",
    });
    if (!proceed) return;
    try {
      await featureService.remove(id);
      setFeatures((prev) => prev.filter((f) => f.id !== id));
      if (expandedFeatureId === id) setExpandedFeatureId(null);
    } catch { toast.error("Failed to delete feature."); }
  }

  // Feature dependencies
  const [expandedFeatureId, setExpandedFeatureId] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<Record<string, FeatureDependency[]>>({});
  const [depsLoading, setDepsLoading] = useState<Record<string, boolean>>({});
  const [depDialog, setDepDialog] = useState(false);
  const [depEditId, setDepEditId] = useState<string | null>(null);
  const [depFeatureId, setDepFeatureId] = useState<string | null>(null);
  const [depForm, setDepForm] = useState({
    name: "",
    isInventory: false,
    captureFields: [] as string[],
    defaultQty: 1,
    unit: "",
    unitPrice: 0,
  });
  const [depSaving, setDepSaving] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);

  const CAPTURE_FIELD_OPTIONS = ["serialNo", "firmware", "ipAddress", "macAddress", "model", "location", "notes"];
  const [featureCustomField, setFeatureCustomField] = useState("");
  const [depCustomField, setDepCustomField] = useState("");

  async function loadDeps(featureId: string) {
    setDepsLoading((prev) => ({ ...prev, [featureId]: true }));
    try {
      const data = await featureDependencyService.getByFeature(featureId);
      setDependencies((prev) => ({ ...prev, [featureId]: data }));
    } catch { console.warn("Failed to load dependencies"); } finally {
      setDepsLoading((prev) => ({ ...prev, [featureId]: false }));
    }
  }

  function openDepDialog(featureId: string, dep?: FeatureDependency) {
    setDepFeatureId(featureId);
    setDepEditId(dep?.id ?? null);
    setDepForm({
      name: dep?.name ?? "",
      isInventory: dep?.isInventory ?? false,
      captureFields: dep?.captureFields ?? [],
      defaultQty: dep?.defaultQty ?? 1,
      unit: dep?.unit ?? "",
      unitPrice: dep?.unitPrice ?? 0,
    });
    setDepError(null);
    setDepDialog(true);
  }

  async function saveDep() {
    if (!depFeatureId || !depForm.name.trim()) { setDepError("Name is required."); return; }
    setDepSaving(true);
    setDepError(null);
    try {
      if (depEditId) {
        await featureDependencyService.update(depEditId, {
          name: depForm.name.trim(),
          isInventory: depForm.isInventory,
          captureFields: depForm.captureFields,
          defaultQty: depForm.defaultQty,
          unit: depForm.unit || undefined,
          unitPrice: depForm.unitPrice,
        });
      } else {
        await featureDependencyService.create({
          featureId: depFeatureId,
          name: depForm.name.trim(),
          isInventory: depForm.isInventory,
          captureFields: depForm.captureFields,
          defaultQty: depForm.defaultQty,
          unit: depForm.unit || undefined,
          unitPrice: depForm.unitPrice,
          sortOrder: (dependencies[depFeatureId]?.length ?? 0),
        });
      }
      await loadDeps(depFeatureId);
      setDepDialog(false);
    } catch { setDepError("Failed to save dependency."); } finally {
      setDepSaving(false);
    }
  }

  async function removeDep(featureId: string, depId: string) {
    const proceed = await confirmAction({
      title: "Delete dependency",
      message: "Delete this dependency?",
      confirmLabel: "Delete",
      severity: "error",
    });
    if (!proceed) return;
    try {
      await featureDependencyService.remove(depId);
      setDependencies((prev) => ({
        ...prev,
        [featureId]: (prev[featureId] ?? []).filter((d) => d.id !== depId),
      }));
    } catch { toast.error("Failed to delete dependency."); }
  }

  // Workflow types manager
  const [wfTypes, setWfTypes] = useState<WorkflowType[]>([]);
  const [wfTypesLoading, setWfTypesLoading] = useState(false);
  const [wfTypeDialog, setWfTypeDialog] = useState(false);
  const [wfTypeEditId, setWfTypeEditId] = useState<string | null>(null);
  const [wfTypeForm, setWfTypeForm] = useState({ name: "", icon: "", sortOrder: "99" });
  const [wfTypeSaving, setWfTypeSaving] = useState(false);
  const [wfTypeError, setWfTypeError] = useState<string | null>(null);
  const [wfTypeDeleteError, setWfTypeDeleteError] = useState<string | null>(null);

  async function loadWfTypes() {
    setWfTypesLoading(true);
    try {
      const types = await workflowTypeService.listAll();
      setWfTypes(types.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch { console.warn("Failed to load workflow types"); } finally {
      setWfTypesLoading(false);
    }
  }

  async function saveWfType() {
    if (!wfTypeForm.name.trim()) { setWfTypeError("Name is required."); return; }
    setWfTypeSaving(true);
    setWfTypeError(null);
    try {
      const sortOrder = parseInt(wfTypeForm.sortOrder, 10) || 99;
      if (wfTypeEditId) {
        await workflowTypeService.update(wfTypeEditId, wfTypeForm.name.trim(), wfTypeForm.icon.trim() || undefined, sortOrder);
      } else {
        await workflowTypeService.create(wfTypeForm.name.trim(), wfTypeForm.icon.trim() || undefined, sortOrder);
      }
      await loadWfTypes();
      setWfTypeDialog(false);
    } catch { setWfTypeError("Failed to save workflow type."); } finally {
      setWfTypeSaving(false);
    }
  }

  function formatWorkflowTypeDeleteError(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as {
        message?: string;
        usedByProject?: boolean;
        usedByConfig?: boolean;
        usedByAssignment?: boolean;
      } | undefined;
      if (data?.message) {
        const parts: string[] = [data.message];
        const refs: string[] = [];
        if (data.usedByProject) refs.push("projects");
        if (data.usedByConfig) refs.push("workflow configs");
        if (data.usedByAssignment) refs.push("asset assignments");
        if (refs.length) parts.push(`In use by: ${refs.join(", ")}.`);
        return parts.join(" ");
      }
      if (err.response?.status === 400) {
        return "Default workflow types cannot be deleted.";
      }
    }
    return "Failed to delete workflow type.";
  }

  async function removeWfType(type: WorkflowType) {
    if (type.id.startsWith("wftype-")) {
      setWfTypeDeleteError("Default workflow types cannot be deleted.");
      return;
    }
    const proceed = await confirmAction({
      title: "Delete workflow type",
      message: `Delete workflow type "${type.name}"? This is blocked if any project, published config, or active assignment still references it.`,
      confirmLabel: "Delete",
      severity: "error",
    });
    if (!proceed) {
      return;
    }
    setWfTypeDeleteError(null);
    try {
      await workflowTypeService.remove(type.id);
      setWfTypes((prev) => prev.filter((t) => t.id !== type.id));
    } catch (err: unknown) {
      setWfTypeDeleteError(formatWorkflowTypeDeleteError(err));
    }
  }
  const localUser = useMemo(() => {
    const raw = secureGet("local_auth_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { email: string; fullName: string; role: string; office: string };
    } catch {
      return null;
    }
  }, []);

  const projectsMap = useMemo(() => parseJsonMap(settings.projectsFieldMap), [settings.projectsFieldMap]);
  const installationsMap = useMemo(
    () => parseJsonMap(settings.installationsFieldMap),
    [settings.installationsFieldMap]
  );

  const payload: QuickbaseSettingsPayload = useMemo(
    () => ({
      enabled: settings.enabled,
      realmHostname: settings.realmHostname.trim(),
      userToken: settings.userToken.trim(),
      projectsTableId: settings.projectsTableId.trim(),
      installationsTableId: settings.installationsTableId.trim(),
      projectsFieldMap: projectsMap.value || {},
      installationsFieldMap: installationsMap.value || {},
      goodsMovementsTableId: settings.goodsMovementsTableId.trim(),
      goodsMovementsJobFid: parseInt(settings.goodsMovementsJobFid, 10) || 0,
      goodsMovementsOrderRefFid: parseInt(settings.goodsMovementsOrderRefFid, 10) || 0,
      goodsMovementsDirectionFid: parseInt(settings.goodsMovementsDirectionFid, 10) || 0
    }),
    [settings, projectsMap.value, installationsMap.value]
  );

  const isValid = useMemo(() => {
    if (!settings.enabled) {
      return true;
    }
    return (
      !!payload.realmHostname &&
      !!payload.userToken &&
      !projectsMap.error &&
      !installationsMap.error
    );
  }, [settings.enabled, payload, projectsMap.error, installationsMap.error]);

  const handleSave = async () => {
    setSending(true);
    setSendError(null);
    try {
      await settingsService.saveQuickbaseSettings(payload);
      setStatus("saved");
    } catch {
      setSendError("Failed to save settings to backend.");
      setStatus("error");
    } finally {
      setSending(false);
    }
  };

  const handleDiscoverFields = async () => {
    const tableId = settings.goodsMovementsTableId.trim();
    if (!tableId) return;
    setDiscoverLoading(true);
    setDiscoverError(null);
    setDiscoverFields([]);
    setDiscoverOpen(true);
    try {
      const fields = await quickbaseService.discoverFields(tableId, settings.realmHostname.trim(), settings.userToken.trim());
      setDiscoverFields(fields);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Failed to load fields. Make sure settings are saved to the backend first.";
      setDiscoverError(msg);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await quickbaseService.testConnection(
        settings.realmHostname.trim(),
        settings.userToken.trim(),
        settings.goodsMovementsTableId.trim() || undefined
      );
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Request failed — check that settings are saved to the backend." });
    } finally {
      setTestLoading(false);
    }
  };

  const handleCopy = async () => {
    const json = JSON.stringify(payload, null, 2);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = json;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setStatus("saved");
  };

  const handleSend = async () => {
    setSending(true);
    setSendError(null);
    try {
      await settingsService.saveQuickbaseSettings(payload);
      setStatus("sent");
    } catch {
      setSendError("Failed to send settings to backend.");
      setStatus("error");
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setStatus("");
  };

  const handleSaveNotify = async () => {

    if (!isAdmin) {
      setNotifyStatus("saved");
      return;
    }

    setNotifySending(true);
    setNotifyError(null);
    try {
      const smtpPort = parseInt(String(notifySettings.smtpPort || "25"), 10);
      await settingsService.saveNotificationSettings({
        smtpHost: String(notifySettings.smtpHost || ""),
        smtpPort: Number.isFinite(smtpPort) ? smtpPort : 25,
        smtpUseSsl: Boolean(notifySettings.smtpUseSsl),
        smtpUser: String(notifySettings.smtpUser || ""),
        smtpPass: String(notifySettings.smtpPass || ""),
        smtpFrom: String(notifySettings.smtpFrom || ""),
        frontendBaseUrl: String(notifySettings.frontendBaseUrl || getFallbackPublicFrontendBaseUrl()),
        smsProvider: String(notifySettings.smsProvider || ""),
        smsApiKey: String(notifySettings.smsApiKey || ""),
        smsSender: String(notifySettings.smsSender || "")
      });
      setNotifyStatus("sent");
    } catch {
      setNotifyError("Failed to save SMS/SMTP settings to backend.");
      setNotifyStatus("error");
    } finally {
      setNotifySending(false);
    }
  };

  const handleClearLocalAuth = () => {
    secureRemove("local_auth_user");
    secureRemove("auth_token");
  };

  const fieldTypes = [
    "text",
    "number",
    "date",
    "checkbox",
    "primary key",
    "composite key",
    "lookup field",
    "rollup",
    "formula",
    "json",
    "user",
    "single select",
    "percentage",
    "image",
    "location",
    "file",
    "dropdown",
    "multi-select",
    "email",
    "phone",
    "currency"
  ];

  const [tableOptions, setTableOptions] = useState<string[]>([
    "admintabs",
    "assets",
    "customers",
    "documents",
    "inspections",
    "installations",
    "installationtabs",
    "issues",
    "offices",
    "products",
    "projects",
    "roleconfigs",
    "roles",
    "sites",
    "tableconfigs",
    "users"
  ]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesSuccess, setTablesSuccess] = useState(false);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState<null | HTMLElement>(null);
  const tableColumnSlots = 6;

  const sortedTableOptions = useMemo(
    () => [...tableOptions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    [tableOptions]
  );

  const filteredSortedFieldDefinitions = useMemo(() => {
    const query = fieldSearch.toLowerCase();
    return fieldDefinitions
      .filter((field) =>
        field.name.toLowerCase().includes(query) ||
        field.fieldType.toLowerCase().includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }, [fieldDefinitions, fieldSearch]);

  const reloadFieldDefinitions = async () => {
    setFieldsLoading(true);
    try {
      const data = await fieldService.getDefinitions();
      setFieldDefinitions(data);
      window.dispatchEvent(new Event("field-definitions-changed"));
    } catch {
      setFieldDefinitions([]);
    } finally {
      setFieldsLoading(false);
    }
  };

  const saveAssignedFields = async () => {
    setAssignedFieldsSaving(true);
    try {
      const updates = fieldDefinitions
        .map((field) => {
          const draft = assignedFieldsDraft[field.id];
          if (!draft) return null;
          const nextTables = draft.map((v) => String(v || "").trim()).filter(Boolean);
          const prevTables = (field.tables ?? []).map((v) => String(v || "").trim()).filter(Boolean);
          const changed = nextTables.join("|") !== prevTables.join("|");
          if (!changed) return null;
          return { field, nextTables };
        })
        .filter((x): x is { field: FieldDefinition; nextTables: string[] } => x !== null);

      if (updates.length === 0) {
        setAssignedFieldsDirty(false);
        return;
      }

      await Promise.all(
        updates.map(({ field, nextTables }) =>
          fieldService.updateDefinition(field.id, {
            ...field,
            tables: nextTables
          })
        )
      );

      setAssignedFieldsDirty(false);
      await reloadFieldDefinitions();
    } catch (error) {
      console.error("Failed to save assigned fields:", error);
      toast.error("Failed to save assigned fields. Check console for details.");
    } finally {
      setAssignedFieldsSaving(false);
    }
  };

  const discardAssignedFields = () => {
    setAssignedFieldsDirty(false);
    setAssignedFieldsDraft(() => {
      const next: Record<string, string[]> = {};
      fieldDefinitions.forEach((field) => {
        const tables = field.tables ?? [];
        next[field.id] = Array.from({ length: tableColumnSlots }).map((_, i) => tables[i] || "");
      });
      return next;
    });
  };

  // Draft assigned-fields state: edit multiple rows then save once.
  useEffect(() => {
    setAssignedFieldsDraft((prev) => {
      const next: Record<string, string[]> = {};

      fieldDefinitions.forEach((field) => {
        const existing = prev[field.id];
        if (existing && assignedFieldsDirty) {
          next[field.id] = existing;
          return;
        }

        const tables = field.tables ?? [];
        next[field.id] = Array.from({ length: tableColumnSlots }).map((_, i) => tables[i] || "");
      });

      return next;
    });
  }, [fieldDefinitions, tableColumnSlots, assignedFieldsDirty]);

  const refreshTables = async () => {
    setTablesLoading(true);
    setTablesSuccess(false);
    try {
      const tables = await fieldService.getAvailableTables();
      setTableOptions(
        [...tables].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      );
      setTablesSuccess(true);
      setTimeout(() => setTablesSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to fetch tables:", error);
      toast.error("Failed to refresh tables. Check console for details.");
    } finally {
      setTablesLoading(false);
    }
  };

  const handlePrintFields = () => {
    // Sort fields alphabetically (same as UI)
    const sortedFields = [...fieldDefinitions].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    const tableHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Field Definitions - ${new Date().toLocaleDateString()}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f5f5f5; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .field-name { color: var(--text-2); font-weight: 600; }
          .field-type { color: #666; font-size: 11px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Field Definitions</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              <th>Created Field</th>
              ${Array.from({ length: tableColumnSlots }).map((_, i) => `<th>Table ${i + 1}</th>`).join('')}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sortedFields.map(field => {
              const tables = field.tables ?? [];
              const slots = Array.from({ length: tableColumnSlots }).map((_, index) => tables[index] || '');
              return `
                <tr>
                  <td>
                    <div class="field-name">${escapeHtml(field.name)}</div>
                    <div class="field-type">${escapeHtml(field.fieldType)}</div>
                  </td>
                  ${slots.map(slot => `<td>${escapeHtml(slot)}</td>`).join('')}
                  <td>Edit / Delete</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <button onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">Print</button>
      </body>
      </html>
    `;

    if (!openPrintWindow(tableHTML)) {
      console.warn("[Settings] Print popup was blocked -- allow popups for this site to print.");
    }
  };

  const handleDownloadCSV = () => {
    // Sort fields alphabetically (same as UI)
    const sortedFields = [...fieldDefinitions].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Convert to CSV with all table columns
    const headers = [
      'Created Field',
      'Type',
      ...Array.from({ length: tableColumnSlots }).map((_, i) => `Table ${i + 1}`),
      'Actions'
    ];

    const rows = sortedFields.map(field => {
      const tables = field.tables ?? [];
      const slots = Array.from({ length: tableColumnSlots }).map((_, index) => tables[index] || '');
      return [
        field.name,
        field.fieldType,
        ...slots,
        'Edit / Delete'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `field-definitions-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadMenuAnchor(null);
  };

  const handleDownloadExcel = () => {
    // Sort fields alphabetically (same as UI)
    const sortedFields = [...fieldDefinitions].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Excel format (tab-separated values with .xls extension for Excel compatibility)
    const headers = [
      'Created Field',
      'Type',
      ...Array.from({ length: tableColumnSlots }).map((_, i) => `Table ${i + 1}`),
      'Actions'
    ];

    const rows = sortedFields.map(field => {
      const tables = field.tables ?? [];
      const slots = Array.from({ length: tableColumnSlots }).map((_, index) => tables[index] || '');
      return [
        field.name,
        field.fieldType,
        ...slots,
        'Edit / Delete'
      ];
    });

    const tsvContent = [
      headers.join('\t'),
      ...rows.map(row => row.join('\t'))
    ].join('\n');

    const blob = new Blob([tsvContent], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `field-definitions-${new Date().toISOString().split('T')[0]}.xls`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadMenuAnchor(null);
  };

  const handleDownloadWord = () => {
    // Sort fields alphabetically (same as UI)
    const sortedFields = [...fieldDefinitions].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Word format (HTML that Word can open)
    const headers = [
      'Created Field',
      ...Array.from({ length: tableColumnSlots }).map((_, i) => `Table ${i + 1}`),
      'Actions'
    ];

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
      <head><meta charset='utf-8'><title>Field Definitions</title></head>
      <body>
        <h1>Field Definitions</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${sortedFields.map(field => {
              const tables = field.tables ?? [];
              const slots = Array.from({ length: tableColumnSlots }).map((_, index) => tables[index] || '');
              return `
                <tr>
                  <td>
                    <div style="color: var(--text-2); font-weight: 600;">${field.name}</div>
                    <div style="color: #666; font-size: 11px;">${field.fieldType}</div>
                  </td>
                  ${slots.map(slot => `<td>${slot}</td>`).join('')}
                  <td>Edit / Delete</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `field-definitions-${new Date().toISOString().split('T')[0]}.doc`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadMenuAnchor(null);
  };

  const handleDownloadPDF = () => {
    // For PDF, we'll open print dialog with a specific layout
    // Users can save as PDF from the print dialog
    handlePrintFields();
    setDownloadMenuAnchor(null);
  };

  useEffect(() => {
    reloadFieldDefinitions();
  }, []);

  // Load available tables on mount
  useEffect(() => {
    refreshTables();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lookup_field_rows");
      if (raw) setLookupRows(JSON.parse(raw));
    } catch {
      setLookupRows({});
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("lookup_field_rows", JSON.stringify(lookupRows));
  }, [lookupRows]);

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem("settings_active_tab", activeTabKey);
    if (activeTabKey) setSearchParams({ tab: activeTabKey }, { replace: true });
  }, [activeTabKey, setSearchParams]);

  const checkApiStatus = async () => {
    try {
      await api.get("/health");
      setApiStatus("running");
      setApiError(null);
    } catch {
      setApiStatus("stopped");
    }
  };

  useEffect(() => {
    checkApiStatus();
  }, []);

  useEffect(() => {
    if (user?.role !== "Admin") return;
    (async () => {
      try {
        const s = await settingsService.getNotificationSettings();
        setNotifySettings((prev) => ({
          ...prev,
          smtpHost: s.smtpHost ?? "",
          smtpPort: String(s.smtpPort ?? ""),
          smtpUseSsl: Boolean(s.smtpUseSsl),
          smtpUser: s.smtpUser ?? "",
          smtpPass: s.smtpPass ?? "",
          smtpFrom: s.smtpFrom ?? "",
          frontendBaseUrl: s.frontendBaseUrl ?? getFallbackPublicFrontendBaseUrl(),
          smsProvider: s.smsProvider ?? "",
          smsApiKey: s.smsApiKey ?? "",
          smsSender: s.smsSender ?? ""
        }));
      } catch {
        // ignore
      }
    })();
  }, [user]);

  useEffect(() => {
    if (user?.role !== "Admin") return;
    (async () => {
      try {
        const qb = await settingsService.getQuickbaseSettings();
        if (qb) {
          setSettings({
            enabled: qb.enabled ?? false,
            realmHostname: qb.realmHostname ?? "",
            userToken: qb.userToken ?? "",
            projectsTableId: qb.projectsTableId ?? "",
            installationsTableId: qb.installationsTableId ?? "",
            projectsFieldMap: JSON.stringify(qb.projectsFieldMap ?? {}),
            installationsFieldMap: JSON.stringify(qb.installationsFieldMap ?? {}),
            goodsMovementsTableId: qb.goodsMovementsTableId ?? "",
            goodsMovementsJobFid: String(qb.goodsMovementsJobFid ?? ""),
            goodsMovementsOrderRefFid: String(qb.goodsMovementsOrderRefFid ?? ""),
            goodsMovementsDirectionFid: String(qb.goodsMovementsDirectionFid ?? ""),
          });
        }
      } catch {
        // ignore
      }
    })();
  }, [user]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
          Settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure external integrations and notification providers.
        </Typography>
      </Box>

      <Box sx={{ padding: 3 }}>
        <Tabs value={tab} onChange={(_, next) => {
          const key = visibleSettingsTabKeys[next] ?? visibleSettingsTabKeys[0] ?? SETTINGS_TAB_KEYS[0];
          if (key) setActiveTabKey(key);
        }} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
          sx={{
            '& .MuiTab-root': {
              borderRadius: '8px',
              transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
              willChange: 'transform',
            },
            '& .MuiTab-root:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              background: 'rgba(255,255,255,0.06)',
            },
          }}
        >
          <Tab label="Integrations" />
          <Tab label="SMS/SMTP" />
          <Tab label="Fields/Data" />
          <Tab label="Divisions" />
          <Tab label="Products" />
          <Tab label="Features" />
          <Tab label="Workflow Types" onClick={() => { if (wfTypes.length === 0) loadWfTypes(); }} />
          <Tab label="Business Logo" />
          {isAdmin && <Tab label="Recovery" />}
          {isAdmin && <Tab label="Audit Log" />}
        </Tabs>

        {activeTabKey === "quickbase" && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Typography variant="h6">External integrations (optional)</Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Switch
                checked={settings.enabled}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              <Typography variant="body2">
                Enable external API integration
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Step-by-step
            </Typography>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Generate an API user token in your external service (e.g. Quickbase realm).</li>
              <li>Paste the service hostname (example: company.quickbase.com).</li>
              <li>Enter Projects and Installations table IDs.</li>
              <li>Provide field maps so the backend can map app fields to the external service.</li>
              <li>Click Save settings to store locally for testing.</li>
              <li>Use Copy JSON or Send to backend for integration handoff.</li>
            </ol>

            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

            <TextField
              label="Realm hostname"
              value={settings.realmHostname}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, realmHostname: event.target.value }))
              }
              placeholder="your-realm.quickbase.com"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="User token"
              value={settings.userToken}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, userToken: event.target.value }))
              }
              placeholder="QB-USER-TOKEN"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleTestConnection}
                disabled={testLoading || !settings.realmHostname.trim() || !settings.userToken.trim()}
                startIcon={testLoading ? <CircularProgress size={14} /> : undefined}
              >
                Test connection
              </Button>
              {testResult && (
                <Chip
                  label={testResult.message}
                  color={testResult.success ? "success" : "error"}
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Projects table ID (dbid)"
                value={settings.projectsTableId}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, projectsTableId: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Installations table ID (dbid)"
                value={settings.installationsTableId}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, installationsTableId: event.target.value }))
                }
                fullWidth
              />
            </Stack>
            <TextField
              label="Projects field map (JSON)"
              value={settings.projectsFieldMap}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, projectsFieldMap: event.target.value }))
              }
              error={!!projectsMap.error}
              helperText={projectsMap.error || 'Example: { "jobNumber": 9, "customerName": 7 }'}
              multiline
              minRows={4}
              fullWidth
            />
            <TextField
              label="Installations field map (JSON)"
              value={settings.installationsFieldMap}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, installationsFieldMap: event.target.value }))
              }
              error={!!installationsMap.error}
              helperText={installationsMap.error || 'Example: { "installationNumber": 31, "siteLocation": 34 }'}
              multiline
              minRows={4}
              fullWidth
            />

            <Divider sx={{ my: 1, borderColor: "rgba(255,255,255,0.08)" }} />
            <Typography variant="subtitle2" color="text.secondary">
              Goods Movements (optional)
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Sync despatched and received goods into project panels. Find the Table DBID in the
              Quickbase URL: <code>…/db/XXXXXXXX</code>. Enter it below, save to backend, then
              click "Discover fields" to auto-fill the FIDs.
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
              <TextField
                label="Goods Movements table ID (dbid)"
                value={settings.goodsMovementsTableId}
                onChange={(e) => setSettings((p) => ({ ...p, goodsMovementsTableId: e.target.value }))}
                fullWidth
                placeholder="e.g. bpqxy123"
                InputLabelProps={{ shrink: true }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<SearchOutlined />}
                disabled={!settings.goodsMovementsTableId.trim()}
                onClick={handleDiscoverFields}
                sx={{ whiteSpace: "nowrap", mt: "8px !important", flexShrink: 0 }}
              >
                Discover fields
              </Button>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Job Number field ID (FID)"
                value={settings.goodsMovementsJobFid}
                onChange={(e) => setSettings((p) => ({ ...p, goodsMovementsJobFid: e.target.value }))}
                fullWidth
                type="number"
                helperText='FID of "Purchased for Job Number" field'
              />
              <TextField
                label="Order Reference field ID (FID)"
                value={settings.goodsMovementsOrderRefFid}
                onChange={(e) => setSettings((p) => ({ ...p, goodsMovementsOrderRefFid: e.target.value }))}
                fullWidth
                type="number"
                helperText='FID of "Order Reference Number" field (OR fallback)'
              />
              <TextField
                label="Direction field ID (FID)"
                value={settings.goodsMovementsDirectionFid}
                onChange={(e) => setSettings((p) => ({ ...p, goodsMovementsDirectionFid: e.target.value }))}
                fullWidth
                type="number"
                helperText='FID of "Incoming/Outgoing" field'
              />
            </Stack>

            {/* ── Discover Fields Dialog ── */}
            <Dialog open={discoverOpen} onClose={() => setDiscoverOpen(false)} maxWidth="sm" fullWidth>
              <DialogTitle>Fields in table: {settings.goodsMovementsTableId}</DialogTitle>
              <DialogContent dividers sx={{ p: 0 }}>
                {discoverLoading && (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                    <CircularProgress size={28} />
                  </Box>
                )}
                {discoverError && (
                  <Alert severity="error" sx={{ m: 2 }}>{discoverError}</Alert>
                )}
                {!discoverLoading && !discoverError && discoverFields.length > 0 && (
                  <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small" sx={{ minWidth: 650 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 60 }}>FID</TableCell>
                        <TableCell>Field name</TableCell>
                        <TableCell sx={{ width: 90 }}>Type</TableCell>
                        <TableCell sx={{ width: 140 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {discoverFields.map(f => (
                        <TableRow key={f.id} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{f.id}</TableCell>
                          <TableCell>{f.label}</TableCell>
                          <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem" }}>{f.fieldType}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              <Button size="small" sx={{ fontSize: "0.68rem", py: 0.25, px: 0.75 }}
                                onClick={() => setSettings(p => ({ ...p, goodsMovementsJobFid: String(f.id) }))}>
                                → Job FID
                              </Button>
                              <Button size="small" sx={{ fontSize: "0.68rem", py: 0.25, px: 0.75 }}
                                onClick={() => setSettings(p => ({ ...p, goodsMovementsOrderRefFid: String(f.id) }))}>
                                → Ref FID
                              </Button>
                              <Button size="small" sx={{ fontSize: "0.68rem", py: 0.25, px: 0.75 }}
                                onClick={() => setSettings(p => ({ ...p, goodsMovementsDirectionFid: String(f.id) }))}>
                                → Dir FID
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </TableContainer>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDiscoverOpen(false)}>Close</Button>
              </DialogActions>
            </Dialog>

            {!isValid && (
              <Alert severity="warning">
                Fill all required fields and fix JSON errors to enable saving or sending.
              </Alert>
            )}

            {status === "saved" && (
              <Alert severity="success">Settings saved locally.</Alert>
            )}
            {status === "sent" && (
              <Alert severity="success">Settings sent to backend.</Alert>
            )}
            {status === "error" && sendError && (
              <Alert severity="error">{sendError}</Alert>
            )}

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Button variant="contained" onClick={handleSave} disabled={!isValid}>
                Save settings
              </Button>
              <Button variant="outlined" onClick={handleCopy} disabled={!isValid}>
                Copy JSON config
              </Button>
              <Button variant="outlined" onClick={handleSend} disabled={!isValid || sending}>
                {sending ? "Sending..." : "Send to backend"}
              </Button>
              <Button variant="outlined" onClick={handleReset}>
                Reset
              </Button>
            </Stack>
          </Stack>
        )}

        {activeTabKey === "sms" && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Typography variant="h6">SMS/SMTP settings</Typography>
            <Typography variant="body2" color="text.secondary">
              Configure email and SMS providers for notifications (Admin saves to the database).
            </Typography>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            <TextField
              label="SMTP Host"
              value={String(notifySettings.smtpHost || "")}
              onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpHost: event.target.value }))}
              fullWidth
            />
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="SMTP Port"
                value={String(notifySettings.smtpPort || "")}
                onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpPort: event.target.value }))}
                fullWidth
              />
              <TextField
                label="SMTP User"
                value={String(notifySettings.smtpUser || "")}
                onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpUser: event.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Frontend Base URL"
              value={String(notifySettings.frontendBaseUrl || "")}
              onChange={(event) => setNotifySettings((prev) => ({ ...prev, frontendBaseUrl: event.target.value }))}
              helperText="Used in invite and password-reset links (e.g. http://10.7.15.155:5173). Saved here overrides appsettings."
              fullWidth
            />
            <Stack direction="row" spacing={2} alignItems="center">
              <Switch
                checked={Boolean(notifySettings.smtpUseSsl)}
                onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpUseSsl: event.target.checked }))}
              />
              <Typography variant="body2">Use SSL</Typography>
            </Stack>
            <PasswordField
              label="SMTP Password"
              value={String(notifySettings.smtpPass || "")}
              onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpPass: event.target.value }))}
              fullWidth
            />
            <TextField
              label="From address"
              value={String(notifySettings.smtpFrom || "")}
              onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpFrom: event.target.value }))}
              helperText="Use noreply@strata-ngo.com with Resend (verified domain) or a Gmail Send mail as alias. Plain Gmail SMTP sends as the authenticated Gmail account."
              fullWidth
            />
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="SMS Provider"
                value={String(notifySettings.smsProvider || "")}
                onChange={(event) => setNotifySettings((prev) => ({ ...prev, smsProvider: event.target.value }))}
                fullWidth
              />
              <TextField
                label="SMS Sender"
                value={String(notifySettings.smsSender || "")}
                onChange={(event) => setNotifySettings((prev) => ({ ...prev, smsSender: event.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="SMS API Key"
              value={String(notifySettings.smsApiKey || "")}
              onChange={(event) => setNotifySettings((prev) => ({ ...prev, smsApiKey: event.target.value }))}
              fullWidth
            />
            {notifyStatus === "sent" && (
              <Alert severity="success">SMS/SMTP settings saved successfully.</Alert>
            )}
            {notifyStatus === "error" && notifyError && (
              <Alert severity="error">{notifyError}</Alert>
            )}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Button variant="contained" onClick={handleSaveNotify} disabled={notifySending}>
                {notifySending ? "Saving..." : "Save SMS/SMTP settings"}
              </Button>
            </Stack>
          </Stack>
        )}

        {activeTabKey === "divisions" && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="h6">Divisions</Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage top-level business divisions (e.g. Strata AI, Strata Connect, Strata Protect).
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => {
                  setDivisionEditId(null);
                  setDivisionForm({ name: "", description: "", sortOrder: String((divisions.length + 1) * 10) });
                  setDivisionError(null);
                  setDivisionDialog(true);
                }}
              >
                Add division
              </Button>
            </Stack>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            {divisionsLoading ? (
              <Stack alignItems="center" sx={{ py: 3 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : divisions.length === 0 ? (
              <Alert severity="info">
                No divisions found.{" "}
                <Button size="small" onClick={loadDivisions}>Refresh</Button>
              </Alert>
            ) : (
              <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow>
                    <TableCell><Typography variant="caption" fontWeight={700}>Name</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Description</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Sort</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Status</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption" fontWeight={700}>Actions</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {divisions.map((d) => (
                    <TableRow key={d.id} hover>
                      <TableCell><Typography variant="body2" fontWeight={600}>{d.name}</Typography></TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{d.description || "—"}</Typography></TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{d.sortOrder}</Typography></TableCell>
                      <TableCell>
                        <Chip size="small" label={d.isActive ? "Active" : "Inactive"} color={d.isActive ? "success" : "default"} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title={d.isActive ? "Deactivate" : "Activate"}>
                            <IconButton size="small" color={d.isActive ? "success" : "default"} onClick={() => toggleDivisionActive(d.id, d.isActive)}>
                              {d.isActive ? <CheckCircleOutline fontSize="small" /> : <BlockOutlined fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => {
                              setDivisionEditId(d.id);
                              setDivisionForm({ name: d.name, description: d.description ?? "", sortOrder: String(d.sortOrder) });
                              setDivisionError(null);
                              setDivisionDialog(true);
                            }}>
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => removeDivision(d.id)}>
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </TableContainer>
            )}
            <Button size="small" variant="outlined" onClick={loadDivisions} disabled={divisionsLoading}>
              {divisionsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </Stack>
        )}

        {activeTabKey === "products" && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="h6">Product Catalog</Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage products (equipment types). Assign a division and link features from the library.
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => {
                  setProductEditId(null);
                  setProductForm({ name: "", description: "", divisionId: "" });
                  setProductError(null);
                  setProductDialog(true);
                }}
              >
                Add product
              </Button>
            </Stack>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            {productsError && (
              <Alert severity="error" onClose={() => setProductsError(null)}>{productsError}</Alert>
            )}
            {productsLoading ? (
              <Stack alignItems="center" sx={{ py: 3 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : products.length === 0 ? (
              <Alert severity="info">
                No products yet.{" "}
                <Button size="small" onClick={loadProducts}>Refresh</Button>
              </Alert>
            ) : (
              <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow>
                    <TableCell><Typography variant="caption" fontWeight={700}>Name</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Division</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Features</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption" fontWeight={700}>Actions</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {products.map((p) => {
                    const isExpanded = expandedProductId === p.id;
                    // p.features comes directly from the API response — no separate load needed.
                    const linked = p.features ?? [];
                    const unlinkedFeatures = features.filter((f) => !linked.some((l) => l.id === f.id));
                    return (
                      <Fragment key={p.id}>
                        <TableRow key={p.id} hover sx={{ cursor: "pointer" }} onClick={() => {
                          if (isExpanded) {
                            setExpandedProductId(null);
                          } else {
                            setExpandedProductId(p.id);
                            if (features.length === 0) loadFeatures();
                          }
                        }}>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); if (isExpanded) { setExpandedProductId(null); } else { setExpandedProductId(p.id); if (features.length === 0) loadFeatures(); } }}>
                                {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
                              </IconButton>
                              <Stack>
                                <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                                {p.description && <Typography variant="caption" color="text.secondary">{p.description}</Typography>}
                              </Stack>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {p.divisionName
                              ? <Chip size="small" label={p.divisionName} variant="outlined" />
                              : <Typography variant="body2" color="text.secondary">—</Typography>}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {`${linked.length} feature${linked.length !== 1 ? "s" : ""}`}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={(e) => {
                                  e.stopPropagation();
                                  setProductEditId(p.id);
                                  setProductForm({ name: p.name, description: p.description ?? "", divisionId: p.divisionId ?? "" });
                                  setProductError(null);
                                  setProductDialog(true);
                                }}>
                                  <EditOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={isAdmin ? "Delete" : "Only Admins can delete products"}>
                                <span>
                                  <IconButton size="small" color="error" disabled={!isAdmin} onClick={(e) => { e.stopPropagation(); removeProduct(p.id); }}>
                                    <DeleteOutline fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${p.id}-features`}>
                            <TableCell colSpan={4} sx={{ py: 0, px: 2, bgcolor: "action.hover" }}>
                              <Stack spacing={1} sx={{ py: 1.5 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                                    LINKED FEATURES ({linked.length})
                                  </Typography>
                                  <Button
                                    size="small"
                                    startIcon={<AddOutlined />}
                                    disabled={unlinkedFeatures.length === 0}
                                    onClick={(e) => { setFeaturePickerProductId(p.id); setFeaturePickerAnchor(e.currentTarget); }}
                                  >
                                    Link feature
                                  </Button>
                                </Stack>
                                {linked.length === 0 ? (
                                  <Typography variant="caption" color="text.secondary">No features linked. Click "Link feature" to add.</Typography>
                                ) : (
                                  <Stack direction="row" flexWrap="wrap" gap={0.75}>
                                    {linked.map((f) => (
                                      <Chip
                                        key={f.id}
                                        size="small"
                                        label={f.name}
                                        variant="outlined"
                                        onDelete={() => unlinkFeatureFromProduct(p.id, f.id)}
                                      />
                                    ))}
                                  </Stack>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              </TableContainer>
            )}
            <Button size="small" variant="outlined" onClick={loadProducts} disabled={productsLoading}>
              {productsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </Stack>
        )}

        {activeTabKey === "features" && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="h6">Feature Library</Typography>
                <Typography variant="body2" color="text.secondary">
                  Global reusable features that can be linked to any product (e.g. IP Camera, Room, NVR).
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UploadFileOutlined />}
                  onClick={() => {
                    setFeatureImportRows([]);
                    setFeatureImportProduct("");
                    setFeatureImportError(null);
                    setFeatureImportDone(null);
                    setFeatureImportDialog(true);
                  }}
                >
                  Import
                </Button>
                <Button variant="outlined" size="small" startIcon={<Download />} onClick={(e) => setExportMenuAnchor(e.currentTarget)}>
                  Export
                </Button>
                <Menu anchorEl={exportMenuAnchor} open={Boolean(exportMenuAnchor)} onClose={() => setExportMenuAnchor(null)}>
                  <MenuItem onClick={() => { exportFeaturesCSV(); setExportMenuAnchor(null); }}>CSV</MenuItem>
                  <MenuItem onClick={() => { exportFeaturesXLSX(); setExportMenuAnchor(null); }}>Excel (.xlsx)</MenuItem>
                  <MenuItem onClick={() => { exportFeaturesJSON(); setExportMenuAnchor(null); }}>JSON</MenuItem>
                  <MenuItem onClick={() => { exportFeaturesPDF(); setExportMenuAnchor(null); }}>PDF (print)</MenuItem>
                </Menu>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddOutlined />}
                  onClick={() => {
                    setFeatureEditId(null);
                    setFeatureJustCreatedId(null);
                    setFeatureForm({ name: "", description: "", valueType: "text", isInventory: false, captureFields: [], brand: "", supplier: "", alternativePartNumber: "", manufacturerPartNumber: "", unitPrice: "", productLink: "", productLinks: [] });
                    setFeatureOriginalProductLinks([]);
                    setFeatureError(null);
                    setFeatureDialog(true);
                  }}
                >
                  Add feature
                </Button>
              </Stack>
            </Stack>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            {featuresError && (
              <Alert severity="error" onClose={() => setFeaturesError(null)}>{featuresError}</Alert>
            )}
            {/* ── Filter bar ── */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ px: 0, pb: 1.5 }} flexWrap="wrap">
              <TextField
                size="small"
                placeholder="Search name, brand, supplier, part #…"
                value={featureSearch}
                onChange={(e) => setFeatureSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined sx={{ fontSize: 16 }} /></InputAdornment> }}
                sx={{ minWidth: 260, flex: 1 }}
                InputLabelProps={{ shrink: true }}
              />
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <Select
                  displayEmpty
                  value={featureFilterProduct}
                  onChange={(e) => setFeatureFilterProduct(e.target.value)}
                >
                  <MenuItem value="all">All products</MenuItem>
                  {products.map((p) => <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select
                  displayEmpty
                  value={featureFilterInventory}
                  onChange={(e) => setFeatureFilterInventory(e.target.value as "all" | "inventory" | "non-inventory")}
                >
                  <MenuItem value="all">All types</MenuItem>
                  <MenuItem value="inventory">Inventory only</MenuItem>
                  <MenuItem value="non-inventory">Non-inventory only</MenuItem>
                </Select>
              </FormControl>
              {(featureSearch || featureFilterProduct !== "all" || featureFilterInventory !== "all") && (
                <Button size="small" variant="text" onClick={() => { setFeatureSearch(""); setFeatureFilterProduct("all"); setFeatureFilterInventory("all"); }}>
                  Clear filters
                </Button>
              )}
              <Typography variant="caption" color="text.secondary" alignSelf="center" sx={{ ml: "auto" }}>
                {filteredSortedFeatures.length} / {features.length} features
              </Typography>
            </Stack>

            {featuresLoading ? (
              <Stack alignItems="center" sx={{ py: 3 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : featuresError ? (
              <Alert severity="error" action={<Button size="small" color="inherit" onClick={loadFeatures}>Retry</Button>}>
                {featuresError}
              </Alert>
            ) : features.length === 0 ? (
              <Alert severity="info">
                No features in the library yet.{" "}
                <Button size="small" onClick={loadFeatures}>Refresh</Button>
              </Alert>
            ) : (
              <TableContainer sx={{ overflowX: "auto", "& th": { resize: "horizontal", overflow: "auto", whiteSpace: "nowrap" } }}>
              <Table size="small" sx={{ minWidth: 1200, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ minWidth: 160 }} />
                  <col style={{ minWidth: 90 }} />
                  <col style={{ minWidth: 130 }} />
                  <col style={{ minWidth: 110 }} />
                  <col style={{ minWidth: 130 }} />
                  <col style={{ minWidth: 140 }} />
                  <col style={{ minWidth: 150 }} />
                  <col style={{ minWidth: 220 }} />
                  <col style={{ minWidth: 100 }} />
                  <col style={{ minWidth: 180 }} />
                </colgroup>
                <TableHead>
                  <TableRow>
                    {([
                      { key: "name",                   label: "Name" },
                      { key: "valueType",              label: "Type" },
                      { key: "alternativePartNumber",  label: "Business Part #" },
                      { key: "isInventory",            label: "Inventory" },
                      { key: "brand",                  label: "Brand" },
                      { key: "supplier",               label: "Supplier" },
                      { key: "manufacturerPartNumber", label: "Mfr. Part #" },
                    ] as { key: FeatureSortKey; label: string }[]).map(({ key, label }) => (
                      <TableCell key={key} onClick={() => toggleFeatureSort(key)}
                        sx={{ cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "action.hover" } }}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="caption" fontWeight={700}>{label}</Typography>
                          {featureSort.key === key
                            ? featureSort.dir === "asc"
                              ? <ArrowUpwardOutlined sx={{ fontSize: 13, color: "primary.main" }} />
                              : <ArrowDownwardOutlined sx={{ fontSize: 13, color: "primary.main" }} />
                            : <UnfoldMoreOutlined sx={{ fontSize: 13, color: "text.disabled" }} />
                          }
                        </Stack>
                      </TableCell>
                    ))}
                    <TableCell><Typography variant="caption" fontWeight={700}>Description</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Products</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption" fontWeight={700}>Actions</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSortedFeatures.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10}>
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                          No features match the current filters.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredSortedFeatures.map((f) => {
                    const isExpanded = expandedFeatureId === f.id;
                    const featureDeps = dependencies[f.id] ?? [];
                    const featureDepsLoading = depsLoading[f.id] ?? false;
                    return (
                      <Fragment key={f.id}>
                        <TableRow key={f.id} hover sx={{ cursor: "pointer" }} onClick={() => {
                          if (isExpanded) {
                            setExpandedFeatureId(null);
                          } else {
                            setExpandedFeatureId(f.id);
                            if (!dependencies[f.id]) loadDeps(f.id);
                          }
                        }}>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); if (isExpanded) { setExpandedFeatureId(null); } else { setExpandedFeatureId(f.id); if (!dependencies[f.id]) loadDeps(f.id); } }}>
                                {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
                              </IconButton>
                              <Typography variant="body2" fontWeight={600}>{f.name}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell><Chip size="small" label={f.valueType} variant="outlined" /></TableCell>
                          <TableCell><Typography variant="body2" sx={{ wordBreak: "break-word" }}>{f.alternativePartNumber || "—"}</Typography></TableCell>
                          <TableCell>
                            <Chip size="small"
                              label={f.isInventory ? "Inventory" : "Non-inventory"}
                              color={f.isInventory ? "primary" : "default"}
                              variant={f.isInventory ? "filled" : "outlined"}
                            />
                          </TableCell>
                          <TableCell><Typography variant="body2" sx={{ wordBreak: "break-word" }}>{f.brand || "—"}</Typography></TableCell>
                          <TableCell><Typography variant="body2" sx={{ wordBreak: "break-word" }}>{f.supplier || "—"}</Typography></TableCell>
                          <TableCell><Typography variant="body2" sx={{ wordBreak: "break-word" }}>{f.manufacturerPartNumber || "—"}</Typography></TableCell>
                          <TableCell><Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>{f.description || "—"}</Typography></TableCell>
                          <TableCell>
                            {f.linkedProducts && f.linkedProducts.length > 0
                              ? <Stack direction="row" flexWrap="wrap" gap={0.5}>{f.linkedProducts.map((p) => <Chip key={p} label={p} size="small" variant="outlined" />)}</Stack>
                              : <Typography variant="body2" color="text.disabled">—</Typography>}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={(e) => {
                                  e.stopPropagation();
                                  setFeatureEditId(f.id);
                                  setFeatureJustCreatedId(null);
                                  setFeatureForm({ name: f.name, description: f.description ?? "", valueType: f.valueType, isInventory: f.isInventory ?? false, captureFields: f.captureFields ?? [], brand: f.brand ?? "", supplier: f.supplier ?? "", alternativePartNumber: f.alternativePartNumber ?? "", manufacturerPartNumber: f.manufacturerPartNumber ?? "", unitPrice: f.unitPrice != null ? String(f.unitPrice) : "", productLink: f.productLink ?? "", productLinks: f.linkedProductIds ?? [] });
                                  setFeatureOriginalProductLinks(f.linkedProductIds ?? []);
                                  setFeatureError(null);
                                  setFeatureDialog(true);
                                }}>
                                  <EditOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); removeFeature(f.id); }}>
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${f.id}-deps`}>
                            <TableCell colSpan={4} sx={{ py: 0, px: 2, bgcolor: "action.hover" }}>
                              <Stack spacing={1} sx={{ py: 1.5 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                                    DEPENDENCIES ({featureDeps.length})
                                  </Typography>
                                  <Button size="small" startIcon={<AddOutlined />} onClick={(e) => { e.stopPropagation(); openDepDialog(f.id); }}>
                                    Add dependency
                                  </Button>
                                </Stack>
                                {featureDepsLoading ? (
                                  <CircularProgress size={18} />
                                ) : featureDeps.length === 0 ? (
                                  <Typography variant="caption" color="text.secondary">No dependencies yet.</Typography>
                                ) : (
                                  featureDeps.map((dep) => (
                                    <Stack key={dep.id} direction="row" alignItems="center" justifyContent="space-between"
                                      sx={{ px: 1, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                                      <Stack spacing={0.25}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                          <Typography variant="body2" fontWeight={500}>{dep.name}</Typography>
                                          <Chip size="small" label={dep.isInventory ? "Inventory" : "Non-inventory"}
                                            color={dep.isInventory ? "primary" : "default"} variant="outlined" />
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary">
                                          {dep.isInventory
                                            ? `Qty: ${dep.defaultQty}${dep.unit ? " " + dep.unit : ""} · Capture: ${dep.captureFields.join(", ") || "none"}`
                                            : `Qty: ${dep.defaultQty}${dep.unit ? " " + dep.unit : ""} · $${dep.unitPrice}`}
                                        </Typography>
                                      </Stack>
                                      <Stack direction="row" spacing={0.5}>
                                        <Tooltip title="Edit">
                                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); openDepDialog(f.id, dep); }}>
                                            <EditOutlined fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                          <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); removeDep(f.id, dep.id); }}>
                                            <DeleteOutline fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      </Stack>
                                    </Stack>
                                  ))
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              </TableContainer>
            )}
            <Button size="small" variant="outlined" onClick={loadFeatures} disabled={featuresLoading}>
              {featuresLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </Stack>
        )}

        {activeTabKey === "workflow-types" && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="h6">Workflow Types</Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage the workflow categories used in the installation workflow system (Installation, Commissioning, Inspection, etc.).
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => {
                  setWfTypeEditId(null);
                  setWfTypeForm({ name: "", icon: "", sortOrder: String((wfTypes.length + 1) * 10) });
                  setWfTypeError(null);
                  setWfTypeDialog(true);
                }}
              >
                Add type
              </Button>
            </Stack>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            {wfTypeDeleteError && (
              <Alert severity="error" onClose={() => setWfTypeDeleteError(null)}>
                {wfTypeDeleteError}
              </Alert>
            )}
            {wfTypesLoading ? (
              <Stack alignItems="center" sx={{ py: 3 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : wfTypes.length === 0 ? (
              <Alert severity="info">
                No workflow types found.{" "}
                <Button size="small" onClick={loadWfTypes}>Refresh</Button>
              </Alert>
            ) : (
              <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow>
                    <TableCell><Typography variant="caption" fontWeight={700}>Name</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Icon</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Sort Order</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontWeight={700}>Status</Typography></TableCell>
                    <TableCell align="right"><Typography variant="caption" fontWeight={700}>Actions</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wfTypes.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell><Typography variant="body2" fontWeight={600}>{t.name}</Typography></TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{t.icon || "—"}</Typography></TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{t.sortOrder}</Typography></TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={t.isActive ? "Active" : "Inactive"}
                          color={t.isActive ? "success" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => {
                              setWfTypeEditId(t.id);
                              setWfTypeForm({ name: t.name, icon: t.icon ?? "", sortOrder: String(t.sortOrder) });
                              setWfTypeError(null);
                              setWfTypeDialog(true);
                            }}>
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {!t.id.startsWith("wftype-") && (
                            <Tooltip title="Delete (soft)">
                              <IconButton size="small" color="error" onClick={() => removeWfType(t)}>
                                <DeleteOutline fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </TableContainer>
            )}
            <Button size="small" variant="outlined" onClick={loadWfTypes} disabled={wfTypesLoading}>
              {wfTypesLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </Stack>
        )}

        {activeTabKey === "logo" && <BusinessLogoTab />}

        {activeTabKey === "recovery" && isAdmin && <RecoveryCenter />}

        {activeTabKey === "audit" && isAdmin && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Typography variant="h6">2FA Audit Log</Typography>
            <Typography variant="body2" color="text.secondary">
              Security events related to two-factor authentication.
            </Typography>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            <Button
              variant="outlined"
              disabled={auditLoading}
              onClick={async () => {
                setAuditLoading(true);
                try {
                  const response = await api.get<AuditLogEntry[]>("/auth/audit-log?limit=200");
                  setAuditLogs(response.data);
                } catch {
                  setAuditLogs([]);
                }
                setAuditLoading(false);
              }}
              sx={{ alignSelf: "flex-start" }}
            >
              {auditLoading ? "Loading..." : "Load audit log"}
            </Button>
            {auditLogs.length > 0 && (
              <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Details</TableCell>
                    <TableCell>IP</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>{log.userEmail}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: "0.8rem",
                            color: log.action.includes("failed") ? "error.main" :
                                   log.action.includes("disabled") || log.action.includes("reset") ? "warning.main" :
                                   "success.main"
                          }}
                        >
                          {log.action}
                        </Typography>
                      </TableCell>
                      <TableCell>{log.details || "—"}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{log.ipAddress || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </TableContainer>
            )}
            {auditLogs.length === 0 && !auditLoading && (
              <Typography variant="body2" color="text.secondary">
                Click "Load audit log" to view recent 2FA security events.
              </Typography>
            )}
          </Stack>
        )}

        {activeTabKey === "fields" && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Typography variant="h6">Fields / Data catalog</Typography>
            <Typography variant="body2" color="text.secondary">
              Create standardized fields and assign them to tables so forms stay consistent across the app.
            </Typography>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            <Box className="glass-card" sx={{ padding: 2 }}>
              <Typography variant="subtitle1">Add field</Typography>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                alignItems="center"
                sx={{ marginTop: 1 }}
              >
                <TextField
                  label="Field name"
                  value={fieldName}
                  onChange={(event) => setFieldName(event.target.value)}
                  fullWidth
                  InputLabelProps={{ sx: fieldLabelSx }}
                />
                <FormControl fullWidth>
                  <Select
                    value={fieldType}
                    onChange={(event) => setFieldType(event.target.value)}
                  >
                    {fieldTypes.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                  <Button
                    variant="contained"
                    disabled={!fieldName.trim()}
                    onClick={() => {
                      const trimmed = fieldName.trim();
                      fieldService
                        .createDefinition({
                          id: "",
                          name: trimmed,
                          fieldType,
                          tables: [],
                          sortOrder: fieldDefinitions.length + 1,
                          isActive: true
                        })
                        .then((created) => {
                          setFieldDefinitions((prev) => {
                            if (prev.some((item) => item.id === created.id)) return prev;
                            return [...prev, created];
                          });
                          window.dispatchEvent(new Event("field-definitions-changed"));
                          // Trigger notification
                          addNotification(trimmed);
                        })
                        .catch(() => reloadFieldDefinitions())
                        .finally(() => {
                          setFieldName("");
                          setFieldType("text");
                        });
                    }}
                  >
                    Add field
                  </Button>
              </Stack>
            </Box>

            <Box className="glass-card" sx={{ padding: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="subtitle1">Assigned fields</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="Print">
                    <span>
                      <IconButton
                        size="small"
                        onClick={handlePrintFields}
                        disabled={fieldDefinitions.length === 0}
                      >
                        <Print />
                      </IconButton>
                    </span>
                  </Tooltip>
                 <Tooltip title="Download">
                    <span>
                      <IconButton
                        size="small"
                        onClick={(e) => setDownloadMenuAnchor(e.currentTarget)}
                        disabled={fieldDefinitions.length === 0}
                      >
                        <Download />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Menu
                    anchorEl={downloadMenuAnchor}
                    open={Boolean(downloadMenuAnchor)}
                    onClose={() => setDownloadMenuAnchor(null)}
                  >
                    <MenuItem onClick={handleDownloadWord}>Word (.doc)</MenuItem>
                    <MenuItem onClick={handleDownloadPDF}>PDF</MenuItem>
                    <MenuItem onClick={handleDownloadCSV}>CSV</MenuItem>
                    <MenuItem onClick={handleDownloadExcel}>Excel (.xls)</MenuItem>
                  </Menu>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={seedLoading}
                    onClick={async () => {
                      setSeedLoading(true);
                      setSeedSuccess(false);
                      try {
                        const data = await fieldService.seedDefaults();
                        setFieldDefinitions(data);
                        setSeedSuccess(true);
                        setTimeout(() => setSeedSuccess(false), 3000);
                      } catch (error) {
                        console.error("Failed to seed fields:", error);
                        toast.error("Failed to seed default fields. Check console for details.");
                      } finally {
                        setSeedLoading(false);
                      }
                    }}
                  >
                    {seedLoading ? "Loading..." : "Seed/Refresh Default Fields"}
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={!assignedFieldsDirty || assignedFieldsSaving}
                    onClick={saveAssignedFields}
                  >
                    {assignedFieldsSaving ? "Saving..." : "Save assigned fields"}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!assignedFieldsDirty || assignedFieldsSaving}
                    onClick={discardAssignedFields}
                  >
                    Discard changes
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={tablesLoading}
                    onClick={refreshTables}
                  >
                    {tablesLoading ? "Loading..." : "Update Dropdown Tables"}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={migrateLoading}
                    onClick={async () => {
                      setMigrateLoading(true);
                      setMigrateResult(null);
                      try {
                        const result = await fieldService.migrateIds();
                        setMigrateResult(result);
                        if (result.migrated > 0) {
                          await reloadFieldDefinitions();
                        }
                        setTimeout(() => setMigrateResult(null), 5000);
                      } catch (error) {
                        console.error("Failed to migrate IDs:", error);
                        toast.error("Failed to migrate field IDs. Check console for details.");
                      } finally {
                        setMigrateLoading(false);
                      }
                    }}
                  >
                    {migrateLoading ? "Migrating..." : "Migrate GUID IDs"}
                  </Button>
                </Stack>
              </Stack>
              {seedSuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Default fields loaded successfully! ({fieldDefinitions.length} fields)
                </Alert>
              )}
              {migrateResult && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {migrateResult.migrated > 0
                    ? `Migrated ${migrateResult.migrated} field ID(s) from GUIDs to readable slugs.`
                    : migrateResult.message || "All field IDs are already readable."}
                </Alert>
              )}
              {tablesSuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Dropdown tables updated successfully! ({tableOptions.length} tables)
                </Alert>
              )}
              <TextField
                size="small"
                placeholder="Search fields..."
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
              />
              {fieldsLoading ? (
                <Stack spacing={1} alignItems="center" sx={{ marginTop: 3, py: 4 }}>
                  <CircularProgress size={28} />
                  <Typography variant="body2" color="text.secondary">
                    Loading field definitions...
                  </Typography>
                </Stack>
              ) : fieldDefinitions.length === 0 ? (
                <Stack spacing={1} sx={{ marginTop: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    No fields yet. Click "Seed/Refresh Default Fields" above to load defaults.
                  </Typography>
                </Stack>
              ) : (
                <TableContainer sx={{ overflowX: "auto" }}>
                <Table sx={{ marginTop: 1, minWidth: 900 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={fieldLabelSx}>Created field</TableCell>
                      <TableCell>Backend Tag</TableCell>
                      <TableCell>UI Field Name</TableCell>
                      {Array.from({ length: tableColumnSlots }).map((_, index) => (
                        <TableCell key={`table-header-${index}`}>{`Table ${index + 1}`}</TableCell>
                      ))}
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSortedFieldDefinitions.map((field) => {
                      const tables = field.tables ?? [];
                      const slots =
                        assignedFieldsDraft[field.id] ??
                        Array.from({ length: tableColumnSlots }).map((_, index) => tables[index] || "");
                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <Stack spacing={0.5}>
                              <Typography variant="subtitle2" sx={fieldLabelSx}>{field.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {field.fieldType}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: "text.secondary" }}>
                              {field.id}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {field.name}
                            </Typography>
                          </TableCell>
                          {slots.map((value, index) => (
                            <TableCell key={`${field.id}-${index}`}>
                              <FormControl fullWidth size="small">
                                <Select
                                  value={value}
                                  displayEmpty
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    const nextTables = [...(assignedFieldsDraft[field.id] ?? slots)];
                                    const previousValue = nextTables[index] ?? "";
                                    nextTables[index] = String(nextValue);

                                    // Trigger notification if assigning to a new table (not removing or changing)
                                    if (nextValue && nextValue !== previousValue) {
                                      addNotification(field.name);
                                    }

                                    setAssignedFieldsDraft((prev) => ({ ...prev, [field.id]: nextTables }));
                                    setAssignedFieldsDirty(true);
                                  }}
                                >
                                  <MenuItem value="">
                                    <em>None</em>
                                  </MenuItem>
                                  {sortedTableOptions.map((option) => (
                                    <MenuItem key={option} value={option}>
                                      {option}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </TableCell>
                          ))}
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              {field.fieldType === "lookup field" && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => setLookupFieldId(field.id)}
                                >
                                  Open lookup table
                                </Button>
                              )}
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => setEditField({ id: field.id, name: field.name, type: field.fieldType })}
                              >
                                Edit
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                onClick={() => {
                                  fieldService.deleteDefinition(field.id).then(() => reloadFieldDefinitions());
                                }}
                              >
                                Delete
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredSortedFieldDefinitions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={tableColumnSlots + 4} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No fields match your search "{fieldSearch}"
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </TableContainer>
              )}
            </Box>
          </Stack>
        )}

      </Box>

      <Box sx={{ padding: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">API status</Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Status: {apiStatus}
            </Typography>
            <Button
              variant="outlined"
              onClick={async () => {
                setApiBusy(true);
                setApiError(null);
                await checkApiStatus();
                setApiBusy(false);
              }}
              disabled={apiBusy}
            >
              Refresh status
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={async () => {
                setApiBusy(true);
                setApiError(null);
                try {
                  await api.post("/admin/shutdown");
                  setApiStatus("stopped");
                } catch {
                  setApiError("Failed to stop API.");
                } finally {
                  setApiBusy(false);
                }
              }}
              disabled={apiBusy || apiStatus !== "running"}
            >
              Stop API
            </Button>
            <Button
              variant="outlined"
              onClick={async () => {
                const cmd = "dotnet run --project server/Commtrac.Api";
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(cmd);
                }
                setApiError("Start command copied: dotnet run --project server/Commtrac.Api");
              }}
            >
              Start API
            </Button>
          </Stack>
          {apiError && (
            <Alert severity="info">{apiError}</Alert>
          )}
        </Stack>
      </Box>

      <Dialog open={!!editField} onClose={() => setEditField(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit field</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Field name"
              value={editField?.name || ""}
              onChange={(event) =>
                setEditField((prev) => (prev ? { ...prev, name: event.target.value } : prev))
              }
              fullWidth
              InputLabelProps={{ sx: fieldLabelSx }}
            />
            <FormControl fullWidth>
              <Select
                value={editField?.type || "text"}
                onChange={(event) =>
                  setEditField((prev) => (prev ? { ...prev, type: event.target.value } : prev))
                }
              >
                {fieldTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEditField(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!editField) return;
              const existing = fieldDefinitions.find((item) => item.id === editField.id);
              if (!existing) {
                setEditField(null);
                return;
              }
              fieldService
                .updateDefinition(editField.id, {
                  ...existing,
                  name: editField.name,
                  fieldType: editField.type
                })
                .then(() => reloadFieldDefinitions())
                .finally(() => setEditField(null));
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!lookupFieldId} onClose={() => setLookupFieldId(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Lookup table</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <Button
              variant="outlined"
              onClick={() => {
                if (!lookupFieldId) return;
                const next = { id: randomId(), label: "" };
                setLookupRows((prev) => ({
                  ...prev,
                  [lookupFieldId]: [...(prev[lookupFieldId] || []), next]
                }));
              }}
            >
              Add row
            </Button>
            <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(lookupFieldId ? lookupRows[lookupFieldId] || [] : []).map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.label}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (!lookupFieldId) return;
                          setLookupRows((prev) => ({
                            ...prev,
                            [lookupFieldId]: (prev[lookupFieldId] || []).map((item) =>
                              item.id === row.id ? { ...item, label: value } : item
                            )
                          }));
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => {
                          if (!lookupFieldId) return;
                          setLookupRows((prev) => ({
                            ...prev,
                            [lookupFieldId]: (prev[lookupFieldId] || []).filter((item) => item.id !== row.id)
                          }));
                        }}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableContainer>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setLookupFieldId(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add / Edit Product dialog */}
      <Dialog open={productDialog} onClose={() => !productSaving && setProductDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{productEditId ? "Edit Product" : "Add Product"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name *"
              size="small"
              fullWidth
              value={productForm.name}
              onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. AIM-100 Camera, NVR-4000"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Description (optional)"
              size="small"
              fullWidth
              value={productForm.description}
              onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
              multiline
              rows={2}
            />
            <FormControl size="small" fullWidth>
              <Select
                displayEmpty
                value={productForm.divisionId}
                onChange={(e) => setProductForm((p) => ({ ...p, divisionId: e.target.value }))}
                renderValue={(v) => v ? (divisions.find((d) => d.id === v)?.name ?? v) : <em style={{ color: "rgba(255,255,255,0.4)" }}>No division</em>}
              >
                <MenuItem value=""><em>No division</em></MenuItem>
                {divisions.filter((d) => d.isActive).map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {productError && <Alert severity="error" sx={{ fontSize: 12 }}>{productError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProductDialog(false)} disabled={productSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveProduct}
            disabled={productSaving || !productForm.name.trim()}
            startIcon={productSaving ? <CircularProgress size={14} /> : undefined}
          >
            {productSaving ? "Saving…" : productEditId ? "Save changes" : "Add product"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Product delete impact warning dialog */}
      {(() => {
        const di = deleteImpactDialog;
        const hasImpact = di.features.length > 0 || di.projects.length > 0 || di.assets.length > 0 || di.workflows.length > 0;
        const allFeaturesSelected = di.features.length > 0 && di.features.every((f) => di.selectedDeleteFeatureIds.includes(f.id));
        const allAssetsSelected = di.assets.length > 0 && di.assets.every((a) => di.selectedDeleteAssetIds.includes(a.id));
        const allWorkflowsSelected = di.workflows.length > 0 && di.workflows.every((w) => di.selectedDeleteWorkflowIds.includes(w.id));
        const emptyState = {
          open: false, productId: "", productName: "", loading: false, error: null,
          features: [], projects: [], assets: [], workflows: [],
          selectedDeleteFeatureIds: [], selectedDeleteAssetIds: [], selectedDeleteWorkflowIds: [],
        } as typeof di;
        return (
          <Dialog
            open={di.open}
            onClose={() => !di.loading && setDeleteImpactDialog(emptyState)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Delete {di.productName ? `"${di.productName}"` : "Product"}?</DialogTitle>
            <DialogContent sx={{ pb: 1 }}>
              {di.loading && di.features.length === 0 && di.assets.length === 0 && di.workflows.length === 0 && di.projects.length === 0 ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <Stack spacing={2}>
                  {di.error && <Alert severity="error">{di.error}</Alert>}
                  {!hasImpact && (
                    <Typography variant="body2" color="text.secondary">No linked data — only the product record will be removed.</Typography>
                  )}

                  {/* Features section */}
                  {di.features.length > 0 && (
                    <Box>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          FEATURES ({di.features.length})
                        </Typography>
                        <Button
                          size="small"
                          sx={{ fontSize: 11, py: 0 }}
                          onClick={() => setDeleteImpactDialog((prev) => ({
                            ...prev,
                            selectedDeleteFeatureIds: allFeaturesSelected ? [] : prev.features.map((f) => f.id),
                          }))}
                        >
                          {allFeaturesSelected ? "Deselect all" : "Select all"}
                        </Button>
                      </Stack>
                      <Box sx={{ maxHeight: 400, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                        {di.features.map((f) => {
                          const checked = di.selectedDeleteFeatureIds.includes(f.id);
                          return (
                            <ListItem key={f.id} disablePadding dense>
                              <ListItemButton
                                dense
                                onClick={() => setDeleteImpactDialog((prev) => ({
                                  ...prev,
                                  selectedDeleteFeatureIds: checked
                                    ? prev.selectedDeleteFeatureIds.filter((x) => x !== f.id)
                                    : [...prev.selectedDeleteFeatureIds, f.id],
                                }))}
                              >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                  <Checkbox size="small" checked={checked} disableRipple edge="start" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={
                                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                                      <Typography variant="body2">{f.name}</Typography>
                                      <Chip size="small" label={f.valueType} variant="outlined" sx={{ fontSize: 10 }} />
                                      {f.alsoUsedIn.length > 0 && (
                                        <Chip size="small" label={`Also in: ${f.alsoUsedIn.join(", ")}`} color="warning" variant="outlined" sx={{ fontSize: 10 }} />
                                      )}
                                    </Stack>
                                  }
                                  secondary={<Typography variant="caption" color="text.secondary">Uncheck to keep in library</Typography>}
                                />
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </Box>
                    </Box>
                  )}

                  {/* Projects section — no checkboxes, always unlinked */}
                  {di.projects.length > 0 && (
                    <Box>
                      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                        PROJECTS ({di.projects.length})
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                        Product will be removed from these projects (projects are never deleted)
                      </Typography>
                      <Box sx={{ maxHeight: 200, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1, px: 1.5, py: 0.5 }}>
                        {di.projects.map((p) => (
                          <Typography key={p.id} variant="body2" sx={{ py: 0.25 }}>
                            • {p.name}{p.jobNumber ? ` (${p.jobNumber})` : ""}
                          </Typography>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Assets section */}
                  {di.assets.length > 0 && (
                    <Box>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          ASSETS ({di.assets.length})
                        </Typography>
                        <Button
                          size="small"
                          sx={{ fontSize: 11, py: 0 }}
                          onClick={() => setDeleteImpactDialog((prev) => ({
                            ...prev,
                            selectedDeleteAssetIds: allAssetsSelected ? [] : prev.assets.map((a) => a.id),
                          }))}
                        >
                          {allAssetsSelected ? "Deselect all" : "Select all"}
                        </Button>
                      </Stack>
                      <Box sx={{ maxHeight: 400, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                        {di.assets.map((a) => {
                          const checked = di.selectedDeleteAssetIds.includes(a.id);
                          return (
                            <ListItem key={a.id} disablePadding dense>
                              <ListItemButton
                                dense
                                onClick={() => setDeleteImpactDialog((prev) => ({
                                  ...prev,
                                  selectedDeleteAssetIds: checked
                                    ? prev.selectedDeleteAssetIds.filter((x) => x !== a.id)
                                    : [...prev.selectedDeleteAssetIds, a.id],
                                }))}
                              >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                  <Checkbox size="small" checked={checked} disableRipple edge="start" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={<Typography variant="body2">{a.assetName}</Typography>}
                                  secondary={a.projectName && <Typography variant="caption" color="text.secondary">{a.projectName}</Typography>}
                                />
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </Box>
                    </Box>
                  )}

                  {/* Workflows section */}
                  {di.workflows.length > 0 && (
                    <Box>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          WORKFLOWS ({di.workflows.length})
                        </Typography>
                        <Button
                          size="small"
                          sx={{ fontSize: 11, py: 0 }}
                          onClick={() => setDeleteImpactDialog((prev) => ({
                            ...prev,
                            selectedDeleteWorkflowIds: allWorkflowsSelected ? [] : prev.workflows.map((w) => w.id),
                          }))}
                        >
                          {allWorkflowsSelected ? "Deselect all" : "Select all"}
                        </Button>
                      </Stack>
                      <Box sx={{ maxHeight: 400, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                        {di.workflows.map((w) => {
                          const checked = di.selectedDeleteWorkflowIds.includes(w.id);
                          return (
                            <ListItem key={w.id} disablePadding dense>
                              <ListItemButton
                                dense
                                onClick={() => setDeleteImpactDialog((prev) => ({
                                  ...prev,
                                  selectedDeleteWorkflowIds: checked
                                    ? prev.selectedDeleteWorkflowIds.filter((x) => x !== w.id)
                                    : [...prev.selectedDeleteWorkflowIds, w.id],
                                }))}
                              >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                  <Checkbox size="small" checked={checked} disableRipple edge="start" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={
                                    <Stack direction="row" spacing={0.75} alignItems="center">
                                      <Typography variant="body2">{w.name}</Typography>
                                      {w.workflowType && <Chip size="small" label={w.workflowType} variant="outlined" sx={{ fontSize: 10 }} />}
                                    </Stack>
                                  }
                                />
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </Box>
                    </Box>
                  )}

                  <Alert severity="warning" sx={{ fontSize: 12 }}>This action cannot be undone.</Alert>
                </Stack>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setDeleteImpactDialog(emptyState)}
                disabled={di.loading}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={confirmDeleteProduct}
                disabled={di.loading || (di.features.length === 0 && di.projects.length === 0 && di.assets.length === 0 && di.workflows.length === 0 && di.loading)}
                startIcon={di.loading && (hasImpact || !di.loading) ? <CircularProgress size={14} /> : undefined}
              >
                {di.loading ? "Deleting…" : "Delete permanently"}
              </Button>
            </DialogActions>
          </Dialog>
        );
      })()}

      {/* Feature picker for product linking */}
      {(() => {
        const pickerProduct = products.find((p) => p.id === featurePickerProductId);
        const alreadyLinked = pickerProduct?.features ?? [];
        const available = features.filter((f) => !alreadyLinked.some((l) => l.id === f.id));
        const q = featurePickerSearch.trim().toLowerCase();
        const filtered = q
          ? available.filter((f) => {
              const nameWords = f.name.toLowerCase().split(/\s+/);
              const queryWords = q.split(/\s+/);
              return queryWords.every((qw) => nameWords.some((nw) => nw.startsWith(qw)));
            })
          : available;
        return (
          <Dialog
            open={Boolean(featurePickerAnchor) && featurePickerProductId !== null}
            onClose={closeFeaturePicker}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle sx={{ pb: 1 }}>
              Link features to {pickerProduct?.name ?? "product"}
            </DialogTitle>
            <DialogContent sx={{ pt: 1, pb: 0 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search features…"
                value={featurePickerSearch}
                onChange={(e) => setFeaturePickerSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined fontSize="small" />
                    </InputAdornment>
                  )
                }}
                sx={{ mb: 1 }}
                autoFocus
              />
              {available.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", py: 2, textAlign: "center" }}>
                  All features are already linked.
                </Typography>
              ) : filtered.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", py: 2, textAlign: "center" }}>
                  No features match "{featurePickerSearch}".
                </Typography>
              ) : (
                <List dense disablePadding sx={{ maxHeight: 320, overflowY: "auto" }}>
                  {filtered.map((f) => {
                    const checked = featurePickerSelected.includes(f.id);
                    return (
                      <ListItem key={f.id} disablePadding>
                        <ListItemButton
                          dense
                          onClick={() => setFeaturePickerSelected((prev) =>
                            checked ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                          )}
                        >
                          <Checkbox
                            edge="start"
                            checked={checked}
                            tabIndex={-1}
                            disableRipple
                            size="small"
                          />
                          <ListItemText
                            primary={f.name}
                            secondary={`${f.valueType}${f.isInventory ? " · inventory" : ""}`}
                            primaryTypographyProps={{ variant: "body2" }}
                            secondaryTypographyProps={{ variant: "caption" }}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              )}
            </DialogContent>
            <DialogActions sx={{ justifyContent: "space-between", px: 3, py: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {featurePickerSelected.length > 0 ? `${featurePickerSelected.length} selected` : "Select features to link"}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button onClick={closeFeaturePicker} size="small">Cancel</Button>
                <Button
                  variant="contained"
                  size="small"
                  disabled={featurePickerSelected.length === 0 || featurePickerLinking}
                  onClick={linkSelectedFeatures}
                >
                  {featurePickerLinking ? <CircularProgress size={16} /> : `Link ${featurePickerSelected.length > 0 ? featurePickerSelected.length : ""} feature${featurePickerSelected.length !== 1 ? "s" : ""}`}
                </Button>
              </Stack>
            </DialogActions>
          </Dialog>
        );
      })()}

      {/* Delete Division confirm dialog */}
      <Dialog open={!!deleteDivisionConfirm} onClose={() => setDeleteDivisionConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Division?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete <strong>{deleteDivisionConfirm?.name}</strong>? Products assigned to it will keep their data but lose the association.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDivisionConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmRemoveDivision}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Add / Edit Division dialog */}
      <Dialog open={divisionDialog} onClose={() => !divisionSaving && setDivisionDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{divisionEditId ? "Edit Division" : "Add Division"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name *"
              size="small"
              fullWidth
              value={divisionForm.name}
              onChange={(e) => setDivisionForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Strata AI, Strata Connect"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Description (optional)"
              size="small"
              fullWidth
              value={divisionForm.description}
              onChange={(e) => setDivisionForm((p) => ({ ...p, description: e.target.value }))}
              multiline
              rows={2}
            />
            <TextField
              label="Sort Order"
              size="small"
              fullWidth
              type="number"
              value={divisionForm.sortOrder}
              onChange={(e) => setDivisionForm((p) => ({ ...p, sortOrder: e.target.value }))}
              helperText="Lower numbers appear first"
            />
            {divisionError && <Alert severity="error" sx={{ fontSize: 12 }}>{divisionError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDivisionDialog(false)} disabled={divisionSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveDivision}
            disabled={divisionSaving || !divisionForm.name.trim()}
            startIcon={divisionSaving ? <CircularProgress size={14} /> : undefined}
          >
            {divisionSaving ? "Saving…" : divisionEditId ? "Save changes" : "Add division"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Feature Import dialog */}
      <Dialog open={featureImportDialog} onClose={() => { if (!featureImporting) setFeatureImportDialog(false); }} maxWidth="md" fullWidth>
        <DialogTitle>Import Features from CSV / Excel</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button size="small" variant="outlined" startIcon={<Download />} onClick={downloadFeatureTemplate}>
                Download template
              </Button>
              <Typography variant="caption" color="text.secondary">
                Columns: name, description, valueType, supplier, partNumber, unitPrice, brand
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <input ref={featureImportFileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFeatureImportFile} />
              <Button variant="contained" size="small" startIcon={<UploadFileOutlined />} onClick={() => featureImportFileRef.current?.click()}>
                Choose file
              </Button>
              {featureImportRows.length > 0 && (
                <Typography variant="body2" color="success.main">{featureImportRows.length} rows ready</Typography>
              )}
            </Stack>

            {featureImportError && <Alert severity="error">{featureImportError}</Alert>}

            {featureImportRows.length > 0 && (
              <>
                <FormControl size="small" fullWidth>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5 }}>
                    Link all imported features to product (optional)
                  </Typography>
                  <Select
                    value={featureImportProduct}
                    onChange={(e) => setFeatureImportProduct(e.target.value)}
                    displayEmpty
                  >
                    <MenuItem value=""><em>— No product —</em></MenuItem>
                    {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                  </Select>
                </FormControl>

                <TableContainer sx={{ overflowX: "auto", maxHeight: 300 }}>
                  <Table size="small" stickyHeader sx={{ minWidth: 600 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Supplier</TableCell>
                        <TableCell>Part #</TableCell>
                        <TableCell>Mfr. Part #</TableCell>
                        <TableCell>Unit Price</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {featureImportRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell><Typography variant="body2" fontWeight={600}>{r.name}</Typography>{r.description && <Typography variant="caption" color="text.secondary" display="block">{r.description}</Typography>}</TableCell>
                          <TableCell><Chip size="small" label={r.valueType} variant="outlined" /></TableCell>
                          <TableCell>{r.supplier || "—"}</TableCell>
                          <TableCell>{r.partNumber || "—"}</TableCell>
                          <TableCell>{r.manufacturerPartNumber || "—"}</TableCell>
                          <TableCell>{r.unitPrice ? `$${r.unitPrice}` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {featureImportDone && (
              <Alert severity="success">
                Done — {featureImportDone.created} feature{featureImportDone.created !== 1 ? "s" : ""} created
                {featureImportDone.skipped > 0 ? `, ${featureImportDone.skipped} skipped (already exist)` : ""}.
                {featureImportProduct && " All linked to selected product."}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFeatureImportDialog(false)} disabled={featureImporting}>Close</Button>
          {featureImportRows.length > 0 && !featureImportDone && (
            <Button variant="contained" onClick={runFeatureImport} disabled={featureImporting}>
              {featureImporting ? <><CircularProgress size={14} sx={{ mr: 1 }} />Importing…</> : `Import ${featureImportRows.length} features`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add / Edit Feature dialog */}
      <Dialog open={featureDialog} onClose={() => { if (!featureSaving) { setFeatureDialog(false); setFeatureJustCreatedId(null); setFeatureCustomField(""); } }} maxWidth="sm" fullWidth>
        <DialogTitle>{featureEditId ? "Edit Feature" : featureJustCreatedId ? "Feature Created" : "Add Feature"}</DialogTitle>
        <DialogContent>
          {featureJustCreatedId ? (
            /* ── Created state: show deps section ── */
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="success" sx={{ fontSize: 12 }}>
                <strong>{featureForm.name}</strong> created. Add dependencies below (optional), then click Done.
              </Alert>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  DEPENDENCIES ({(dependencies[featureJustCreatedId] ?? []).length})
                </Typography>
                <Button size="small" startIcon={<AddOutlined />} onClick={() => openDepDialog(featureJustCreatedId)}>
                  Add dependency
                </Button>
              </Stack>
              {(depsLoading[featureJustCreatedId]) ? (
                <CircularProgress size={18} />
              ) : (dependencies[featureJustCreatedId] ?? []).length === 0 ? (
                <Typography variant="caption" color="text.secondary">No dependencies yet.</Typography>
              ) : (
                (dependencies[featureJustCreatedId] ?? []).map((dep) => (
                  <Stack key={dep.id} direction="row" alignItems="center" justifyContent="space-between"
                    sx={{ px: 1, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                    <Stack spacing={0.25}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={500}>{dep.name}</Typography>
                        <Chip size="small" label={dep.isInventory ? "Inventory" : "Non-inventory"}
                          color={dep.isInventory ? "primary" : "default"} variant="outlined" />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {dep.isInventory
                          ? `Capture: ${dep.captureFields.join(", ") || "none"}`
                          : `Qty: ${dep.defaultQty}${dep.unit ? " " + dep.unit : ""} · $${dep.unitPrice}`}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openDepDialog(featureJustCreatedId, dep)}>
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => removeDep(featureJustCreatedId, dep.id)}>
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                ))
              )}
            </Stack>
          ) : (
            /* ── Create / Edit form ── */
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Name / Part Number *"
                size="small"
                fullWidth
                value={featureForm.name}
                onChange={(e) => setFeatureForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. IP Camera, Room, NVR"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Description (optional)"
                size="small"
                fullWidth
                value={featureForm.description}
                onChange={(e) => setFeatureForm((p) => ({ ...p, description: e.target.value }))}
                multiline
                rows={2}
              />
              <FormControl size="small" fullWidth>
                <Select
                  value={featureForm.valueType}
                  onChange={(e) => setFeatureForm((p) => ({ ...p, valueType: e.target.value }))}
                >
                  {["text","number","single-select","multi-select","component","tri-state","date","rating","percentage"].map((vt) => (
                    <MenuItem key={vt} value={vt}>{vt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {/* Inventory toggle */}
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2">This feature is:</Typography>
                <Chip
                  size="small"
                  label="Non-inventory"
                  variant={!featureForm.isInventory ? "filled" : "outlined"}
                  color={!featureForm.isInventory ? "primary" : "default"}
                  onClick={() => setFeatureForm((p) => ({ ...p, isInventory: false, captureFields: [] }))}
                />
                <Chip
                  size="small"
                  label="Inventory item"
                  variant={featureForm.isInventory ? "filled" : "outlined"}
                  color={featureForm.isInventory ? "primary" : "default"}
                  onClick={() => setFeatureForm((p) => ({ ...p, isInventory: true }))}
                />
              </Stack>
              {featureForm.isInventory && (
                <FormControl size="small" fullWidth>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                    Capture fields (select all that apply, or add custom)
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
                    {CAPTURE_FIELD_OPTIONS.map((field) => (
                      <Chip
                        key={field}
                        size="small"
                        label={field}
                        variant={featureForm.captureFields.includes(field) ? "filled" : "outlined"}
                        color={featureForm.captureFields.includes(field) ? "primary" : "default"}
                        onClick={() => setFeatureForm((p) => ({
                          ...p,
                          captureFields: p.captureFields.includes(field)
                            ? p.captureFields.filter((f) => f !== field)
                            : [...p.captureFields, field],
                        }))}
                      />
                    ))}
                    {featureForm.captureFields.filter((f) => !CAPTURE_FIELD_OPTIONS.includes(f)).map((field) => (
                      <Chip
                        key={field}
                        size="small"
                        label={field}
                        variant="filled"
                        color="secondary"
                        onDelete={() => setFeatureForm((p) => ({ ...p, captureFields: p.captureFields.filter((f) => f !== field) }))}
                      />
                    ))}
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      placeholder="Custom field name…"
                      value={featureCustomField}
                      onChange={(e) => setFeatureCustomField(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = featureCustomField.trim();
                          if (val && !featureForm.captureFields.includes(val)) {
                            setFeatureForm((p) => ({ ...p, captureFields: [...p.captureFields, val] }));
                          }
                          setFeatureCustomField("");
                        }
                      }}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={!featureCustomField.trim() || featureForm.captureFields.includes(featureCustomField.trim())}
                      onClick={() => {
                        const val = featureCustomField.trim();
                        if (val && !featureForm.captureFields.includes(val)) {
                          setFeatureForm((p) => ({ ...p, captureFields: [...p.captureFields, val] }));
                        }
                        setFeatureCustomField("");
                      }}
                    >
                      Add
                    </Button>
                  </Stack>
                </FormControl>
              )}
              {/* Link to products — one feature can belong to multiple products */}
              {(
                <>
                  <Divider><Typography variant="caption" color="text.secondary">Related products</Typography></Divider>
                  <FormControl size="small" fullWidth>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                      Select the products this feature belongs to
                    </Typography>
                    <Box sx={{ maxHeight: 200, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                      {products.length === 0 ? (
                        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 1, display: "block" }}>No products available.</Typography>
                      ) : (
                        products.map((p) => {
                          const checked = featureForm.productLinks.includes(p.id);
                          return (
                            <ListItem key={p.id} disablePadding dense>
                              <ListItemButton
                                dense
                                onClick={() => setFeatureForm((prev) => ({
                                  ...prev,
                                  productLinks: checked
                                    ? prev.productLinks.filter((x) => x !== p.id)
                                    : [...prev.productLinks, p.id],
                                }))}
                              >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                  <Checkbox size="small" checked={checked} disableRipple edge="start" />
                                </ListItemIcon>
                                <ListItemText primary={<Typography variant="body2">{p.name}</Typography>} />
                              </ListItemButton>
                            </ListItem>
                          );
                        })
                      )}
                    </Box>
                  </FormControl>
                </>
              )}
              {/* Procurement fields */}
              <Divider><Typography variant="caption" color="text.secondary">Procurement (optional)</Typography></Divider>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Brand"
                  size="small"
                  fullWidth
                  value={featureForm.brand}
                  onChange={(e) => setFeatureForm((p) => ({ ...p, brand: e.target.value }))}
                  placeholder="e.g. Hikvision"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Supplier / Manufacturer"
                  size="small"
                  fullWidth
                  value={featureForm.supplier}
                  onChange={(e) => setFeatureForm((p) => ({ ...p, supplier: e.target.value }))}
                  placeholder="e.g. Hikvision Australia"
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Business Part Number"
                  size="small"
                  fullWidth
                  value={featureForm.alternativePartNumber}
                  onChange={(e) => setFeatureForm((p) => ({ ...p, alternativePartNumber: e.target.value }))}
                  placeholder="e.g. DS-2CD2143G2-I"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Manufacturer Part Number"
                  size="small"
                  fullWidth
                  value={featureForm.manufacturerPartNumber}
                  onChange={(e) => setFeatureForm((p) => ({ ...p, manufacturerPartNumber: e.target.value }))}
                  placeholder="e.g. MFR-DS-2143G2"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Price / Unit ($)"
                  size="small"
                  fullWidth
                  type="number"
                  inputProps={{ min: 0, step: "0.01" }}
                  value={featureForm.unitPrice}
                  onChange={(e) => setFeatureForm((p) => ({ ...p, unitPrice: e.target.value }))}
                  placeholder="e.g. 185.00"
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <TextField
                label="Product Link (URL)"
                size="small"
                fullWidth
                value={featureForm.productLink}
                onChange={(e) => setFeatureForm((p) => ({ ...p, productLink: e.target.value }))}
                placeholder="https://..."
                InputLabelProps={{ shrink: true }}
              />
              {featureError && <Alert severity="error" sx={{ fontSize: 12 }}>{featureError}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {featureJustCreatedId ? (
            <Button variant="contained" onClick={() => { setFeatureDialog(false); setFeatureJustCreatedId(null); }}>Done</Button>
          ) : (
            <>
              <Button onClick={() => setFeatureDialog(false)} disabled={featureSaving}>Cancel</Button>
              <Button
                variant="contained"
                onClick={saveFeature}
                disabled={featureSaving || !featureForm.name.trim()}
                startIcon={featureSaving ? <CircularProgress size={14} /> : undefined}
              >
                {featureSaving ? "Saving…" : featureEditId ? "Save changes" : "Add feature"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Add / Edit Dependency dialog */}
      <Dialog open={depDialog} onClose={() => !depSaving && setDepDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{depEditId ? "Edit Dependency" : "Add Dependency"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name *"
              size="small"
              fullWidth
              value={depForm.name}
              onChange={(e) => setDepForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Camera Body, Cat6 Cable, Bracket"
              InputLabelProps={{ shrink: true }}
            />
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2">Type:</Typography>
              <Chip
                size="small"
                label="Non-inventory"
                variant={!depForm.isInventory ? "filled" : "outlined"}
                color={!depForm.isInventory ? "primary" : "default"}
                onClick={() => setDepForm((p) => ({ ...p, isInventory: false }))}
              />
              <Chip
                size="small"
                label="Inventory"
                variant={depForm.isInventory ? "filled" : "outlined"}
                color={depForm.isInventory ? "primary" : "default"}
                onClick={() => setDepForm((p) => ({ ...p, isInventory: true }))}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Default Qty"
                size="small"
                type="number"
                sx={{ width: 110 }}
                value={depForm.defaultQty}
                onChange={(e) => setDepForm((p) => ({ ...p, defaultQty: parseFloat(e.target.value) || 0 }))}
                inputProps={{ min: 0, step: 0.1 }}
              />
              <TextField
                label="Unit"
                size="small"
                sx={{ width: 90 }}
                value={depForm.unit}
                onChange={(e) => setDepForm((p) => ({ ...p, unit: e.target.value }))}
                placeholder="ea, m, kg"
                InputLabelProps={{ shrink: true }}
              />
              {!depForm.isInventory && (
                <TextField
                  label="Unit Price"
                  size="small"
                  type="number"
                  sx={{ flex: 1 }}
                  value={depForm.unitPrice}
                  onChange={(e) => setDepForm((p) => ({ ...p, unitPrice: parseFloat(e.target.value) || 0 }))}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              )}
            </Stack>
            {depForm.isInventory && (
              <FormControl size="small" fullWidth>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                  Capture fields per unit (select all that apply, or add custom)
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
                  {CAPTURE_FIELD_OPTIONS.map((field) => (
                    <Chip
                      key={field}
                      size="small"
                      label={field}
                      variant={depForm.captureFields.includes(field) ? "filled" : "outlined"}
                      color={depForm.captureFields.includes(field) ? "primary" : "default"}
                      onClick={() => setDepForm((p) => ({
                        ...p,
                        captureFields: p.captureFields.includes(field)
                          ? p.captureFields.filter((f) => f !== field)
                          : [...p.captureFields, field],
                      }))}
                    />
                  ))}
                  {depForm.captureFields.filter((f) => !CAPTURE_FIELD_OPTIONS.includes(f)).map((field) => (
                    <Chip
                      key={field}
                      size="small"
                      label={field}
                      variant="filled"
                      color="secondary"
                      onDelete={() => setDepForm((p) => ({ ...p, captureFields: p.captureFields.filter((f) => f !== field) }))}
                    />
                  ))}
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    placeholder="Custom field name…"
                    value={depCustomField}
                    onChange={(e) => setDepCustomField(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = depCustomField.trim();
                        if (val && !depForm.captureFields.includes(val)) {
                          setDepForm((p) => ({ ...p, captureFields: [...p.captureFields, val] }));
                        }
                        setDepCustomField("");
                      }
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!depCustomField.trim() || depForm.captureFields.includes(depCustomField.trim())}
                    onClick={() => {
                      const val = depCustomField.trim();
                      if (val && !depForm.captureFields.includes(val)) {
                        setDepForm((p) => ({ ...p, captureFields: [...p.captureFields, val] }));
                      }
                      setDepCustomField("");
                    }}
                  >
                    Add
                  </Button>
                </Stack>
              </FormControl>
            )}
            {depError && <Alert severity="error" sx={{ fontSize: 12 }}>{depError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDepDialog(false)} disabled={depSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveDep}
            disabled={depSaving || !depForm.name.trim()}
            startIcon={depSaving ? <CircularProgress size={14} /> : undefined}
          >
            {depSaving ? "Saving…" : depEditId ? "Save changes" : "Add dependency"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add / Edit Workflow Type dialog */}
      <Dialog open={wfTypeDialog} onClose={() => !wfTypeSaving && setWfTypeDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{wfTypeEditId ? "Edit Workflow Type" : "Add Workflow Type"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name *"
              size="small"
              fullWidth
              value={wfTypeForm.name}
              onChange={(e) => setWfTypeForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Installation, Inspection"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Icon (emoji or code)"
              size="small"
              fullWidth
              value={wfTypeForm.icon}
              onChange={(e) => setWfTypeForm((p) => ({ ...p, icon: e.target.value }))}
              placeholder="e.g. 🔧 or wrench"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Sort Order"
              size="small"
              fullWidth
              type="number"
              value={wfTypeForm.sortOrder}
              onChange={(e) => setWfTypeForm((p) => ({ ...p, sortOrder: e.target.value }))}
              helperText="Lower numbers appear first"
            />
            {wfTypeError && <Alert severity="error" sx={{ fontSize: 12 }}>{wfTypeError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWfTypeDialog(false)} disabled={wfTypeSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveWfType}
            disabled={wfTypeSaving || !wfTypeForm.name.trim()}
            startIcon={wfTypeSaving ? <CircularProgress size={14} /> : undefined}
          >
            {wfTypeSaving ? "Saving…" : wfTypeEditId ? "Save changes" : "Add type"}
          </Button>
        </DialogActions>
      </Dialog>

      <Box className="glass-card" sx={{ padding: 3 }}>
        <Stack spacing={1.5}>
          <Typography variant="h6">Local auth testing</Typography>
          <Typography variant="body2" color="text.secondary">
            Current local user: {localUser ? `${localUser.fullName} (${localUser.role})` : "None"}
          </Typography>
          <Button variant="outlined" onClick={handleClearLocalAuth}>
            Clear local auth
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
};

export default Settings;
