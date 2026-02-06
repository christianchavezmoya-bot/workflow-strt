import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Box,
  Typography,
  Container,
  Stack,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  Alert,
  Menu,
  Tooltip,
  Chip,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  AddOutlined,
  DeleteOutline,
  EditOutlined,
  ArrowDropDown,
  SettingsOutlined,
  GridView,
  TableRows,
} from "@mui/icons-material";
import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState, MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import DynamicFieldsForm from "../../components/DynamicFieldsForm";
import TableConfigDialog from "../../components/TableConfigDialog";
import GlobalOfficeMap, { Office } from "../../components/GlobalOfficeMap";
import { demoCustomers, demoProducts, demoUsers } from "../../data/demo";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useDynamicFields } from "../../hooks/useDynamicFields";
import { useAuth } from "../../hooks/useAuth";
import { useTableConfig } from "../../hooks/useTableConfig";
import { useFieldDefinitions } from "../../hooks/useFieldDefinitions";
import { adminTabsService, AdminTab, AdminTabRow } from "../../services/adminTabsService";
import { fieldService } from "../../services/fieldService";
import { officesService } from "../../services/officesService";
import api from "../../services/api";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { createCustomer, deleteCustomer, fetchCustomers, updateCustomer } from "../../store/customersSlice";
import { createProduct, deleteProduct, fetchProducts, updateProduct } from "../../store/productsSlice";
import { createUser, deactivateUser, deleteUser, fetchUsers, inviteUser, updateUser } from "../../store/usersSlice";
import { Customer } from "../../types/customer";
import { Product } from "../../types/product";
import { User, UserRole } from "../../types/user";

const roles: UserRole[] = ["Admin", "Project Manager", "Engineer", "Viewer"];
const offices: Array<Customer["office"]> = ["USA", "Australia", "South Africa", "All"];
const defaultCustomColumns = ["ID", "Name", "Created Date"];
const getDefaultColumnType = (name: string) => {
  if (name === "ID") return "lookup field";
  if (name === "Created Date") return "date";
  return "text";
};
const createDefaultCustomRow = (index: number) => ({
  ID: `ID-${String(index).padStart(3, "0")}`,
  Name: "New item",
  "Created Date": new Date().toISOString().slice(0, 10)
});

const normalize = (value: string | number | boolean | undefined | null) => String(value ?? "");

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const anyError = error as {
      message?: string;
      response?: {
        data?: string | {
          title?: string;
          detail?: string;
          message?: string;
          errors?: Record<string, string[]>;
        }
      }
    };

    // Handle .NET ProblemDetails response
    if (anyError.response?.data && typeof anyError.response.data === "object") {
      const data = anyError.response.data;

      // If there are validation errors, format them nicely
      if (data.errors && typeof data.errors === "object") {
        const errorMessages = Object.entries(data.errors)
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages}`)
          .join("; ");
        if (errorMessages) {
          return `${data.title || "Validation error"} - ${errorMessages}`;
        }
      }

      return data.title || data.detail || data.message || fallback;
    }

    // Handle string response data
    if (anyError.response?.data && typeof anyError.response.data === "string") {
      return anyError.response.data;
    }

    return anyError.message || fallback;
  }
  return fallback;
};

const applyAutoSort = <T,>(
  rows: T[],
  sort: { key: string; dir: "asc" | "desc" },
  accessorMap: Record<string, (row: T) => string>
) => {
  if (!sort.key || !accessorMap[sort.key]) return rows;
  const accessor = accessorMap[sort.key];
  return [...rows].sort((a, b) => {
    const aVal = accessor(a).toLowerCase();
    const bVal = accessor(b).toLowerCase();
    if (aVal < bVal) return sort.dir === "asc" ? -1 : 1;
    if (aVal > bVal) return sort.dir === "asc" ? 1 : -1;
    return 0;
  });
};

const applyAutoFilter = <T,>(
  rows: T[],
  filters: Record<string, Set<string>>,
  accessorMap: Record<string, (row: T) => string>
) => {
  return rows.filter((row) =>
    Object.entries(filters).every(([key, selected]) => {
      if (!selected || selected.size === 0) return true;
      const value = accessorMap[key]?.(row) ?? "";
      return selected.has(value);
    })
  );
};

// Draggable Paper component for Dialog
function DraggablePaper(props: any) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: ReactMouseEvent) => {
    // Only allow dragging from the title area
    const target = e.target as HTMLElement;
    if (target.closest('.MuiDialogTitle-root')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart.x, dragStart.y, position.x, position.y]);

  return (
    <Paper
      {...props}
      onMouseDown={handleMouseDown}
      sx={{
        ...props.sx,
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'default',
        '& .MuiDialogTitle-root': {
          cursor: 'grab',
          userSelect: 'none',
        },
      }}
    />
  );
}

export const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const { activeOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const usersState = useAppSelector((state) => state.users);
  const customersState = useAppSelector((state) => state.customers);
  const productsState = useAppSelector((state) => state.products);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [editProductOpen, setEditProductOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "user" | "customer" | "product" | "role";
    id: string;
    label: string;
  } | null>(null);
  const [tab, setTab] = useState(0);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    role: "Viewer" as UserRole,
    office: "USA" as User["office"]
  });
  const [customerForm, setCustomerForm] = useState({
    name: "",
    customerId: "",
    office: activeOffice === "All" ? "" : activeOffice
  });
  const [customersList, setCustomersList] = useState([
    { id: 101, name: "Apex Industries", type: "Manufacturing", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 102, name: "BeeHealthy Foods", type: "Retail", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 103, name: "SolarTech Energy", type: "Energy", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 104, name: "Zenith Data Systems", type: "Technology", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 105, name: "Kappa Telecoms", type: "Technology", sites: 1, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 106, name: "Omega Softworks", type: "Technology", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 107, name: "Delta Dental", type: "Healthcare", sites: 1, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 108, name: "Pi Pharmaceuticals", type: "Healthcare", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 109, name: "Theta Care", type: "Healthcare", sites: 1, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 110, name: "Lambda Financial", type: "Finance", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 111, name: "Sigma Capital", type: "Finance", sites: 1, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 112, name: "Phi Bank", type: "Finance", sites: 1, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 113, name: "Alpha Logistics", type: "Transport", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 114, name: "Beta Shipping", type: "Transport", sites: 1, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 115, name: "Mu Freight", type: "Transport", sites: 1, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 116, name: "Gamma Agritech", type: "Manufacturing", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 117, name: "Rho Education", type: "Education", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
    { id: 118, name: "Xi Hospitality", type: "Retail", sites: 2, logo: null as string | null, logoShape: 'round' as 'none' | 'round' | 'rectangular', logoSize: 70, photoScale: 100 },
  ]);
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerIndustry, setEditCustomerIndustry] = useState("");
  const [editCustomerLogo, setEditCustomerLogo] = useState<string | null>(null);
  const [editCustomerLogoShape, setEditCustomerLogoShape] = useState<'none' | 'round' | 'rectangular'>('round');
  const [editCustomerLogoSize, setEditCustomerLogoSize] = useState<number>(70);
  const [editCustomerPhotoScale, setEditCustomerPhotoScale] = useState<number>(100);
  const [logoUploadDialogOpen, setLogoUploadDialogOpen] = useState(false);

  // Sites Management State
  const [customerViewMode, setCustomerViewMode] = useState<'cards' | 'table'>('cards');
  const [sitesList, setSitesList] = useState<Array<{
    id: string;
    customerId: string | number;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    contactName?: string;
    contactPhone?: string;
    notes?: string;
    createdAt: string;
  }>>([]);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editSiteFormData, setEditSiteFormData] = useState<{
    name?: string;
    city?: string;
    state?: string;
    notes?: string;
    customerId?: string | number;
  }>({});

  const [productForm, setProductForm] = useState({
    name: "",
    description: ""
  });
  const [editUserForm, setEditUserForm] = useState({
    id: "",
    fullName: "",
    email: "",
    role: "Viewer" as UserRole,
    office: "USA" as User["office"],
    isActive: true
  });
  const [editCustomerForm, setEditCustomerForm] = useState({
    id: "",
    name: "",
    customerId: "",
    office: activeOffice
  });
  const [editProductForm, setEditProductForm] = useState({
    id: "",
    name: "",
    description: ""
  });
  const [assetForm, setAssetForm] = useState({
    machineType: "",
    machineId: "",
    serialNumber: "",
    pmCount: "1",
    comments: ""
  });
  const [assets, setAssets] = useState<Array<{
    id: string;
    seq: number;
    machineType: string;
    machineId: string;
    serialNumber: string;
    pmCount: string;
    comments: string;
  }>>([]);
  const [customAssetColumns, setCustomAssetColumns] = useState<string[]>([]);
  const usersDynamic = useDynamicFields("users");
  const customersDynamic = useDynamicFields("customers");
  const productsDynamic = useDynamicFields("products");
  const assetsDynamic = useDynamicFields("assets");
  const allFieldDefinitions = useFieldDefinitions();
  const usersTableConfig = useTableConfig(
    "users",
    usersDynamic.definitions.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  const customersTableConfig = useTableConfig(
    "customers",
    customersDynamic.definitions.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  // Base field name customizations stored in localStorage
  const [baseFieldNames, setBaseFieldNames] = useState<Record<string, Record<string, string>>>(() => {
    const stored = localStorage.getItem(`base_field_names:${user?.id || "anonymous"}`);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return {};
      }
    }
    return {};
  });

  // Save base field names to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`base_field_names:${user?.id || "anonymous"}`, JSON.stringify(baseFieldNames));
  }, [baseFieldNames, user?.id]);

  const productsTableConfig = useTableConfig(
    "products",
    useMemo(() => [
      { id: "base-name", name: baseFieldNames.products?.["base-name"] || "Name", type: "text" },
      { id: "base-description", name: baseFieldNames.products?.["base-description"] || "Description", type: "text" },
      ...productsDynamic.definitions.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.fieldType,
        linkToFieldId: field.linkToFieldId,
        actionType: field.actionType
      }))
    ], [baseFieldNames, productsDynamic.definitions])
  );
  const assetsTableConfig = useTableConfig(
    "assets",
    useMemo(() => [
      { id: "base-machineType", name: baseFieldNames.assets?.["base-machineType"] || "Machine Type", type: "text" },
      { id: "base-machineId", name: baseFieldNames.assets?.["base-machineId"] || "Machine ID", type: "text" },
      { id: "base-serialNumber", name: baseFieldNames.assets?.["base-serialNumber"] || "Serial Number", type: "text" },
      { id: "base-pmCount", name: baseFieldNames.assets?.["base-pmCount"] || "PM Count", type: "text" },
      { id: "base-comments", name: baseFieldNames.assets?.["base-comments"] || "Comments", type: "text" },
      ...assetsDynamic.definitions.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.fieldType,
        linkToFieldId: field.linkToFieldId,
        actionType: field.actionType
      }))
    ], [baseFieldNames, assetsDynamic.definitions])
  );
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const [tableConfigTarget, setTableConfigTarget] = useState<"users" | "customers" | "products" | "assets">("users");

  const availableFieldsForAdminTable = useMemo(() => {
    const tableName = tableConfigTarget;
    return allFieldDefinitions.definitions.filter((field) => !field.tables.includes(tableName));
  }, [allFieldDefinitions.definitions, tableConfigTarget]);

  // Helper function to get field definitions ordered by table config
  const getOrderedDefinitions = (definitions: FieldDefinition[], config: { order: string[] }) => {
    if (!config.order || config.order.length === 0) return definitions;

    const byId = new Map(definitions.map((def) => [def.id, def]));
    const ordered = config.order
      .map((id) => byId.get(id))
      .filter((def): def is FieldDefinition => def !== undefined);
    const remaining = definitions.filter((def) => !config.order.includes(def.id));

    return [...ordered, ...remaining];
  };

  // Get ordered field definitions for each table
  const orderedProductsDefinitions = useMemo(
    () => getOrderedDefinitions(productsDynamic.definitions, productsTableConfig.config),
    [productsDynamic.definitions, productsTableConfig.config]
  );

  const orderedAssetsDefinitions = useMemo(
    () => getOrderedDefinitions(assetsDynamic.definitions, assetsTableConfig.config),
    [assetsDynamic.definitions, assetsTableConfig.config]
  );

  const orderedUsersDefinitions = useMemo(
    () => getOrderedDefinitions(usersDynamic.definitions, usersTableConfig.config),
    [usersDynamic.definitions, usersTableConfig.config]
  );

  const orderedCustomersDefinitions = useMemo(
    () => getOrderedDefinitions(customersDynamic.definitions, customersTableConfig.config),
    [customersDynamic.definitions, customersTableConfig.config]
  );
  const [userDynamicValues, setUserDynamicValues] = useState<Record<string, string>>({});
  const [editUserDynamicValues, setEditUserDynamicValues] = useState<Record<string, string>>({});
  const [customerDynamicValues, setCustomerDynamicValues] = useState<Record<string, string>>({});
  const [editCustomerDynamicValues, setEditCustomerDynamicValues] = useState<Record<string, string>>({});
  const [productDynamicValues, setProductDynamicValues] = useState<Record<string, string>>({});
  const [editProductDynamicValues, setEditProductDynamicValues] = useState<Record<string, string>>({});
  const [assetDynamicValues, setAssetDynamicValues] = useState<Record<string, string>>({});
  const [userSort, setUserSort] = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [userFilters, setUserFilters] = useState<Record<string, Set<string>>>({});
  const [userMenu, setUserMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({
    anchorEl: null,
    key: ""
  });
  const [customerSort, setCustomerSort] = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [customerFilters, setCustomerFilters] = useState<Record<string, Set<string>>>({});
  const [customerMenu, setCustomerMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({
    anchorEl: null,
    key: ""
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSort, setProductSort] = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [productFilters, setProductFilters] = useState<Record<string, Set<string>>>({});
  const [productMenu, setProductMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({
    anchorEl: null,
    key: ""
  });
  const [assetSort, setAssetSort] = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [assetFilters, setAssetFilters] = useState<Record<string, Set<string>>>({});
  const [assetMenu, setAssetMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({
    anchorEl: null,
    key: ""
  });
  const [roleSort, setRoleSort] = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [roleFilters, setRoleFilters] = useState<Record<string, Set<string>>>({});
  const [roleMenu, setRoleMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({
    anchorEl: null,
    key: ""
  });
  const [rolesConfig, setRolesConfig] = useState(() => {
    try {
      const raw = localStorage.getItem("admin_roles_config");
      if (raw) return JSON.parse(raw) as Record<string, Record<string, boolean>>;
    } catch {
      // ignore
    }
    return {
      Viewer: {
        viewOnly: true
      },
      "Project Manager": {
        viewOnly: false,
        createDeleteTables: true,
        createUsers: false,
        editFields: true,
        modifyData: true,
        editForms: true
      },
      Admin: {
        viewOnly: false,
        createDeleteTables: true,
        createUsers: true,
        editFields: true,
        modifyData: true,
        editForms: true
      },
      Engineer: {
        viewOnly: false,
        createDeleteTables: false,
        createUsers: false,
        editFields: false,
        modifyData: true,
        editForms: false
      }
    };
  });
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    originalName: "",
    permissions: {
      viewOnly: true,
      createDeleteTables: false,
      createUsers: false,
      editFields: false,
      modifyData: false,
      editForms: false
    } as Record<string, boolean>
  });

  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(fetchCustomers());
    dispatch(fetchProducts());
  }, [dispatch]);

  // Fetch sites from API
  useEffect(() => {
    const fetchSites = async () => {
      try {
        const response = await api.get('/sites');
        setSitesList(response.data);
      } catch (err) {
        console.error('Failed to fetch sites', err);
      }
    };
    fetchSites();
  }, []);

  useEffect(() => {
    const storedAssets = localStorage.getItem("admin_assets");
    if (storedAssets) {
      try {
        const parsed = JSON.parse(storedAssets) as typeof assets;
        const withSeq = parsed.map((item, index) => ({
          ...item,
          seq: item.seq ?? index + 1
        }));
        setAssets(withSeq);
      } catch {
        setAssets([]);
      }
    }
    const storedColumns = localStorage.getItem("admin_asset_columns");
    if (storedColumns) {
      try {
        const parsed = JSON.parse(storedColumns) as string[];
        setCustomAssetColumns(parsed);
      } catch {
        setCustomAssetColumns([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("admin_assets", JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem("admin_asset_columns", JSON.stringify(customAssetColumns));
  }, [customAssetColumns]);


  useEffect(() => {
    localStorage.setItem("admin_roles_config", JSON.stringify(rolesConfig));
  }, [rolesConfig]);

  // Site Management Helper Functions
  const getCustomerName = (customerId: string | number) => {
    const customer = customersList.find(c => c.id === customerId);
    return customer?.name || 'Unknown Customer';
  };

  const getCustomerData = (customerId: string | number) => {
    return customersList.find(c => c.id === customerId);
  };

  const handleEditSite = (site: typeof sitesList[0]) => {
    setEditingSiteId(site.id);
    setEditSiteFormData({
      name: site.name,
      city: site.city,
      state: site.state,
      notes: site.notes,
      customerId: site.customerId,
    });
  };

  const handleSaveSite = async () => {
    if (!editingSiteId) return;

    try {
      const response = await api.put(`/sites/${editingSiteId}`, {
        name: editSiteFormData.name,
        address: '',
        city: editSiteFormData.city,
        state: editSiteFormData.state,
        zipCode: null,
        contactName: '',
        contactPhone: '',
        contactEmail: null,
        notes: editSiteFormData.notes,
        customerId: editSiteFormData.customerId,
      });

      setSitesList(prev => prev.map(s => s.id === editingSiteId ? { ...s, ...response.data } : s));
      setEditingSiteId(null);
      setEditSiteFormData({});
    } catch (err) {
      console.error('Failed to save site', err);
      alert('Failed to save site');
    }
  };

  const handleDeleteSite = async (siteId: string) => {
    if (!confirm('Are you sure you want to delete this site?')) return;

    try {
      await api.delete(`/sites/${siteId}`);
      setSitesList(prev => prev.filter(s => s.id !== siteId));
    } catch (err) {
      console.error('Failed to delete site', err);
      alert('Failed to delete site');
    }
  };

  const handleCancelSiteEdit = () => {
    setEditingSiteId(null);
    setEditSiteFormData({});
  };

  const openRoleDialog = (roleName?: string) => {
    if (roleName && rolesConfig[roleName]) {
      setRoleForm({
        name: roleName,
        originalName: roleName,
        permissions: { ...rolesConfig[roleName] }
      });
    } else {
      setRoleForm({
        name: "",
        originalName: "",
        permissions: {
          viewOnly: true,
          createDeleteTables: false,
          createUsers: false,
          editFields: false,
          modifyData: false,
          editForms: false
        }
      });
    }
    setRoleDialogOpen(true);
  };

  useEffect(() => {
    if (usersDynamic.definitions.length === 0) return;
    setUserDynamicValues((prev) => {
      const next = { ...prev };
      usersDynamic.definitions.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
  }, [usersDynamic.definitions]);

  useEffect(() => {
    if (customersDynamic.definitions.length === 0) return;
    setCustomerDynamicValues((prev) => {
      const next = { ...prev };
      customersDynamic.definitions.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
  }, [customersDynamic.definitions]);

  useEffect(() => {
    if (productsDynamic.definitions.length === 0) return;
    setProductDynamicValues((prev) => {
      const next = { ...prev };
      productsDynamic.definitions.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
  }, [productsDynamic.definitions]);

  useEffect(() => {
    if (assetsDynamic.definitions.length === 0) return;
    setAssetDynamicValues((prev) => {
      const next = { ...prev };
      assetsDynamic.definitions.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
  }, [assetsDynamic.definitions]);

  useEffect(() => {
    setCustomerForm((prev) => ({ ...prev, office: activeOffice === "All" ? "" : activeOffice }));
  }, [activeOffice]);

  const users = useMemo(() => (usersState.items.length ? usersState.items : demoUsers), [usersState.items]);
  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items]
  );

  const filteredCustomers = useMemo(() => {
    if (activeOffice === "All") return customersState.items;
    return customersState.items.filter((customer) => customer.office === activeOffice || customer.office === "All");
  }, [customersState.items, activeOffice]);

  const [adminTabsConfig, setAdminTabsConfig] = useState<AdminTab[]>([]);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [adminSettingsMenu, setAdminSettingsMenu] = useState<HTMLElement | null>(null);
  const [adminSettingsMenuOpen, setAdminSettingsMenuOpen] = useState(false);
  const [adminTabManagerOpen, setAdminTabManagerOpen] = useState(false);
  const adminSettingsAnchorRef = useRef<HTMLDivElement | null>(null);
  const [adminTabDraftName, setAdminTabDraftName] = useState("");
  const [adminTabRows, setAdminTabRows] = useState<Record<string, Array<Record<string, string>>>>({});
  const [adminTabDragIndex, setAdminTabDragIndex] = useState<number | null>(null);
  const [customRowDialogOpen, setCustomRowDialogOpen] = useState(false);
  const [customRowDialogTabId, setCustomRowDialogTabId] = useState<string | null>(null);
  const [customRowDialogIndex, setCustomRowDialogIndex] = useState<number | null>(null);
  const [customRowForm, setCustomRowForm] = useState<Record<string, string>>({});
  const [customTabSorts, setCustomTabSorts] = useState<Record<string, { key: string; dir: "asc" | "desc" }>>({});
  const [customTabFilters, setCustomTabFilters] = useState<Record<string, Record<string, Set<string>>>>({});
  const [customTabMenu, setCustomTabMenu] = useState<{
    tabId: string;
    anchorEl: HTMLElement | null;
    key: string;
  }>({ tabId: "", anchorEl: null, key: "" });
  const [customTabConfigs, setCustomTabConfigs] = useState<Record<string, { order: string[]; hidden: string[] }>>({});
  const [customTableConfigOpen, setCustomTableConfigOpen] = useState(false);
  const [customTableConfigTabId, setCustomTableConfigTabId] = useState<string | null>(null);
  const [adminTabsLoaded, setAdminTabsLoaded] = useState(false);
  const [globalOffices, setGlobalOffices] = useState<Office[]>([]);

  useEffect(() => {
    officesService.getAll().then(setGlobalOffices).catch(console.error);
  }, []);

  useEffect(() => {
    const loadTabs = async () => {
      try {
        const data = await adminTabsService.getAll();
        if (data.length > 0) {
          setAdminTabsConfig(data);
          setAdminTabsLoaded(true);
          return;
        }
      } catch {
        // ignore
      }
      const defaults: AdminTab[] = [
        {
          id: "admin-users",
          label: "Users",
          type: "users",
          position: 0,
          columns: [],
          fieldIds: [],
          config: { order: [], hidden: [] }
        },
        {
          id: "admin-customers",
          label: "Customers",
          type: "customers",
          position: 1,
          columns: [],
          fieldIds: [],
          config: { order: [], hidden: [] }
        },
        {
          id: "admin-global-offices",
          label: "Global Offices",
          type: "offices",
          position: 2,
          columns: [],
          fieldIds: [],
          config: { order: [], hidden: [] }
        },
        {
          id: "admin-products",
          label: "Products",
          type: "products",
          position: 3,
          columns: [],
          fieldIds: [],
          config: { order: [], hidden: [] }
        },
        {
          id: "admin-assets",
          label: "Assets",
          type: "assets",
          position: 4,
          columns: [],
          fieldIds: [],
          config: { order: [], hidden: [] }
        },
        {
          id: "admin-roles",
          label: "Roles",
          type: "roles",
          position: 5,
          columns: [],
          fieldIds: [],
          config: { order: [], hidden: [] }
        }
      ];
      setAdminTabsConfig(defaults);
      try {
        await adminTabsService.saveAll(defaults);
      } catch {
        // ignore
      }
      setAdminTabsLoaded(true);
    };
    loadTabs();
  }, []);

  useEffect(() => {
    if (!adminTabsLoaded) return;
    const normalized = adminTabsConfig.map((tab, index) => ({
      ...tab,
      position: index,
        columns:
          tab.type === "custom" && (!tab.columns || tab.columns.length === 0)
            ? defaultCustomColumns
            : tab.columns || [],
      fieldIds: tab.fieldIds || [],
      config: tab.config || { order: [], hidden: [] }
    }));
    adminTabsService.saveAll(normalized).catch(() => {
      // ignore
    });
  }, [adminTabsConfig, adminTabsLoaded]);

  useEffect(() => {
    if (tab >= adminTabsConfig.length) {
      setTab(Math.max(0, adminTabsConfig.length - 1));
    }
  }, [tab, adminTabsConfig.length]);


  useEffect(() => {
    const loadRows = async () => {
      const customTabs = adminTabsConfig.filter((tabItem) => tabItem.type === "custom");
      await Promise.all(
        customTabs.map(async (tabItem) => {
          try {
            const rows = await adminTabsService.getRows(tabItem.id);
            setAdminTabRows((prev) => ({
              ...prev,
              [tabItem.id]: rows.map((row) => ({ ...row.data, _rowId: row.id }))
            }));
          } catch {
            // ignore
          }
        })
      );
    };
    if (adminTabsLoaded) {
      loadRows();
    }
  }, [adminTabsConfig, adminTabsLoaded]);

  useEffect(() => {
    if (!adminTabsLoaded) return;
    const customTabs = adminTabsConfig.filter((tabItem) => tabItem.type === "custom");
    customTabs.forEach((tabItem) => {
      const rows = adminTabRows[tabItem.id] || [];
      let didAssignIds = false;
      const payload: AdminTabRow[] = rows.map((row, index) => {
        let rowId = typeof row._rowId === "string" && row._rowId ? row._rowId : "";
        if (!rowId) {
          rowId = crypto.randomUUID();
          didAssignIds = true;
        }
        const { _rowId, ...data } = row;
        return {
          id: rowId,
          tabId: tabItem.id,
          data,
          position: index
        };
      });
      if (didAssignIds) {
        setAdminTabRows((prev) => ({
          ...prev,
          [tabItem.id]: rows.map((row, index) => ({
            ...row,
            _rowId: payload[index]?.id
          }))
        }));
      }
      if (payload.length === 0) return;
      adminTabsService.saveRows(tabItem.id, payload).catch(() => {
        // ignore
      });
    });
  }, [adminTabRows, adminTabsConfig, adminTabsLoaded]);

  useEffect(() => {
    const initial: Record<string, { order: string[]; hidden: string[] }> = {};
    adminTabsConfig.forEach((tabItem) => {
      if (tabItem.type === "custom") {
        initial[tabItem.id] = tabItem.config || { order: [], hidden: [] };
      }
    });
    setCustomTabConfigs((prev) => ({ ...initial, ...prev }));
  }, [adminTabsConfig]);

  const numberedUsers = useMemo(() => users.map((user, index) => ({ ...user, seq: index + 1 })), [users]);
  const numberedProducts = useMemo(
    () => products.map((product, index) => ({ ...product, seq: index + 1 })),
    [products]
  );

  const userAccessors = useMemo(
    () => ({
      name: (user: User & { seq: number }) => normalize(user.fullName),
      email: (user: User & { seq: number }) => normalize(user.email),
      role: (user: User & { seq: number }) => normalize(user.role),
      office: (user: User & { seq: number }) => normalize(user.office),
      status: (user: User & { seq: number }) =>
        normalize(!user.isActive && user.isFirstLogin ? "Pending" : user.isActive ? "Active" : "Inactive")
    }),
    []
  );
  const userFilterOptions = useMemo(
    () => ({
      name: Array.from(new Set(numberedUsers.map((row) => userAccessors.name(row)))).sort(),
      email: Array.from(new Set(numberedUsers.map((row) => userAccessors.email(row)))).sort(),
      role: Array.from(new Set(numberedUsers.map((row) => userAccessors.role(row)))).sort(),
      office: Array.from(new Set(numberedUsers.map((row) => userAccessors.office(row)))).sort(),
      status: Array.from(new Set(numberedUsers.map((row) => userAccessors.status(row)))).sort()
    }),
    [numberedUsers, userAccessors]
  );

  const productAccessors = useMemo(
    () => ({
      name: (product: Product & { seq: number }) => normalize(product.name),
      description: (product: Product & { seq: number }) => normalize(product.description ?? "-")
    }),
    []
  );
  const productFilterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};

    productsTableConfig.visibleFields.forEach((field) => {
      const values = new Set<string>();

      products.forEach((product) => {
        let value = "";
        if (field.id === "base-name") {
          value = normalize(product.name);
        } else if (field.id === "base-description") {
          value = normalize(product.description ?? "");
        } else {
          value = normalize(productsDynamic.valuesByEntity[product.id]?.[field.id]?.value ?? "");
        }
        values.add(value);
      });

      options[field.id] = Array.from(values).sort();
    });

    return options;
  }, [products, productsTableConfig.visibleFields, productsDynamic.valuesByEntity]);

  const assetFilterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};

    assetsTableConfig.visibleFields.forEach((field) => {
      const values = new Set<string>();
      assets.forEach((asset) => {
        let value = "";
        if (field.id === "base-machineType") {
          value = normalize(asset.machineType);
        } else if (field.id === "base-machineId") {
          value = normalize(asset.machineId);
        } else if (field.id === "base-serialNumber") {
          value = normalize(asset.serialNumber);
        } else if (field.id === "base-pmCount") {
          value = normalize(asset.pmCount);
        } else if (field.id === "base-comments") {
          value = normalize(asset.comments ?? "");
        } else {
          value = normalize(assetsDynamic.valuesByEntity[asset.id]?.[field.id]?.value ?? "");
        }
        values.add(value);
      });
      options[field.id] = Array.from(values).sort();
    });

    return options;
  }, [assets, assetsTableConfig.visibleFields, assetsDynamic.valuesByEntity]);

  const roleLabels = useMemo(() => Object.keys(rolesConfig), [rolesConfig]);

  const roleAccessors = useMemo(
    () => ({
      role: (row: { role: string; seq: number }) => normalize(row.role),
      viewOnly: (row: { role: string; seq: number }) => normalize(rolesConfig[row.role]?.viewOnly ? "Yes" : "No"),
      createDeleteTables: (row: { role: string; seq: number }) =>
        normalize(rolesConfig[row.role]?.createDeleteTables ? "Yes" : "No"),
      createUsers: (row: { role: string; seq: number }) =>
        normalize(rolesConfig[row.role]?.createUsers ? "Yes" : "No"),
      editFields: (row: { role: string; seq: number }) =>
        normalize(rolesConfig[row.role]?.editFields ? "Yes" : "No"),
      modifyData: (row: { role: string; seq: number }) =>
        normalize(rolesConfig[row.role]?.modifyData ? "Yes" : "No"),
      editForms: (row: { role: string; seq: number }) =>
        normalize(rolesConfig[row.role]?.editForms ? "Yes" : "No")
    }),
    [rolesConfig]
  );
  const roleFilterOptions = useMemo(
    () => ({
      role: Array.from(new Set(roleLabels.map((role) => normalize(role)))).sort(),
      viewOnly: Array.from(new Set(roleLabels.map((role) => roleAccessors.viewOnly({ role, seq: 0 })))).sort(),
      createDeleteTables: Array.from(
        new Set(roleLabels.map((role) => roleAccessors.createDeleteTables({ role, seq: 0 })))
      ).sort(),
      createUsers: Array.from(
        new Set(roleLabels.map((role) => roleAccessors.createUsers({ role, seq: 0 })))
      ).sort(),
      editFields: Array.from(
        new Set(roleLabels.map((role) => roleAccessors.editFields({ role, seq: 0 })))
      ).sort(),
      modifyData: Array.from(
        new Set(roleLabels.map((role) => roleAccessors.modifyData({ role, seq: 0 })))
      ).sort(),
      editForms: Array.from(
        new Set(roleLabels.map((role) => roleAccessors.editForms({ role, seq: 0 })))
      ).sort()
    }),
    [roleLabels, roleAccessors]
  );

  const filteredUsers = useMemo(() => {
    const filtered = applyAutoFilter(numberedUsers, userFilters, userAccessors);
    return applyAutoSort(filtered, userSort, userAccessors);
  }, [numberedUsers, userFilters, userSort, userAccessors]);

  const filteredProductRows = useMemo(() => {
    const filtered = applyAutoFilter(numberedProducts, productFilters, productAccessors);
    return applyAutoSort(filtered, productSort, productAccessors);
  }, [numberedProducts, productFilters, productSort, productAccessors]);

  // Comprehensive products filtering including dynamic fields
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Apply filters for each field
    Object.entries(productFilters).forEach(([fieldId, valueSet]) => {
      if (valueSet.size === 0) return;
      result = result.filter((product) => {
        let fieldValue = "";
        if (fieldId === "base-name") fieldValue = normalize(product.name);
        else if (fieldId === "base-description") fieldValue = normalize(product.description ?? "");
        else fieldValue = normalize(productsDynamic.valuesByEntity[product.id]?.[fieldId]?.value ?? "");

        return valueSet.has(fieldValue);
      });
    });

    // Apply sorting
    if (productSort.key) {
      result.sort((a, b) => {
        let aVal = "";
        let bVal = "";

        if (productSort.key === "base-name") {
          aVal = normalize(a.name);
          bVal = normalize(b.name);
        } else if (productSort.key === "base-description") {
          aVal = normalize(a.description ?? "");
          bVal = normalize(b.description ?? "");
        } else {
          aVal = normalize(productsDynamic.valuesByEntity[a.id]?.[productSort.key]?.value ?? "");
          bVal = normalize(productsDynamic.valuesByEntity[b.id]?.[productSort.key]?.value ?? "");
        }

        if (productSort.dir === "asc") {
          return aVal.localeCompare(bVal);
        } else {
          return bVal.localeCompare(aVal);
        }
      });
    }

    return result;
  }, [products, productFilters, productSort, productsDynamic.valuesByEntity]);

  // Comprehensive assets filtering including dynamic fields
  const filteredAssets = useMemo(() => {
    let result = [...assets];

    // Apply filters for each field
    Object.entries(assetFilters).forEach(([fieldId, valueSet]) => {
      if (valueSet.size === 0) return;
      result = result.filter((asset) => {
        let fieldValue = "";
        if (fieldId === "base-machineType") fieldValue = normalize(asset.machineType);
        else if (fieldId === "base-machineId") fieldValue = normalize(asset.machineId);
        else if (fieldId === "base-serialNumber") fieldValue = normalize(asset.serialNumber);
        else if (fieldId === "base-pmCount") fieldValue = normalize(asset.pmCount);
        else if (fieldId === "base-comments") fieldValue = normalize(asset.comments ?? "");
        else fieldValue = normalize(assetsDynamic.valuesByEntity[asset.id]?.[fieldId]?.value ?? "");

        return valueSet.has(fieldValue);
      });
    });

    // Apply sorting
    if (assetSort.key) {
      result.sort((a, b) => {
        let aVal = "";
        let bVal = "";

        if (assetSort.key === "base-machineType") {
          aVal = normalize(a.machineType);
          bVal = normalize(b.machineType);
        } else if (assetSort.key === "base-machineId") {
          aVal = normalize(a.machineId);
          bVal = normalize(b.machineId);
        } else if (assetSort.key === "base-serialNumber") {
          aVal = normalize(a.serialNumber);
          bVal = normalize(b.serialNumber);
        } else if (assetSort.key === "base-pmCount") {
          aVal = normalize(a.pmCount);
          bVal = normalize(b.pmCount);
        } else if (assetSort.key === "base-comments") {
          aVal = normalize(a.comments ?? "");
          bVal = normalize(b.comments ?? "");
        } else {
          aVal = normalize(assetsDynamic.valuesByEntity[a.id]?.[assetSort.key]?.value ?? "");
          bVal = normalize(assetsDynamic.valuesByEntity[b.id]?.[assetSort.key]?.value ?? "");
        }

        if (assetSort.dir === "asc") {
          return aVal.localeCompare(bVal);
        } else {
          return bVal.localeCompare(aVal);
        }
      });
    }

    return result;
  }, [assets, assetFilters, assetSort, assetsDynamic.valuesByEntity]);

  const filteredRoles = useMemo(() => {
    const rows = roleLabels.map((role, index) => ({ role, seq: index + 1 }));
    const filtered = applyAutoFilter(rows, roleFilters, roleAccessors);
    return applyAutoSort(filtered, roleSort, roleAccessors);
  }, [roleLabels, roleFilters, roleAccessors, roleSort]);

  const openOrCreateAdminLinkedTab = (fieldName: string) => {
    if (!fieldName.trim()) return;
    const label = `${fieldName.trim()} Table`;
    const existingIndex = adminTabsConfig.findIndex((tabItem) => tabItem.label === label);
    const existingTab = existingIndex >= 0 ? adminTabsConfig[existingIndex] : null;
    const newTab: AdminTab = {
      id: `admin-tab-${Date.now()}`,
      label,
      type: "custom",
      position: adminTabsConfig.length,
      columns: defaultCustomColumns,
      fieldIds: [],
      config: { order: [], hidden: [] }
    };
    const targetTabId = existingTab?.id ?? newTab.id;
    const targetIndex = existingIndex >= 0 ? existingIndex : adminTabsConfig.length;
    if (!existingTab) {
      setAdminTabsConfig((prev) => {
        if (prev.some((tabItem) => tabItem.label === label)) return prev;
        return [...prev, { ...newTab, position: prev.length }];
      });
    }
    setTab(targetIndex);
    setAdminTabRows((prev) => {
      const current = prev[targetTabId] || [];
      return {
        ...prev,
        [targetTabId]: [...current, createDefaultCustomRow(current.length + 1)]
      };
    });
  };

  const customRowDialogTab = customRowDialogTabId
    ? adminTabsConfig.find((tabItem) => tabItem.id === customRowDialogTabId)
    : null;
  const customRowDialogColumns = customRowDialogTab
    ? customRowDialogTab.columns && customRowDialogTab.columns.length > 0
      ? customRowDialogTab.columns
      : defaultCustomColumns
    : [];
  const customRowDialogFields = customRowDialogTab
    ? [
        ...customRowDialogColumns.map((name) => ({
          id: `default:${name}`,
          name,
          type: getDefaultColumnType(name)
        })),
        ...allFieldDefinitions.definitions
          .filter((field) => (customRowDialogTab.fieldIds || []).includes(field.id))
                    .map((field) => ({
                      id: field.id,
                      name: field.name,
                      type: field.fieldType,
                      linkToFieldId: field.linkToFieldId,
                      actionType: field.actionType
                    }))
      ]
    : [];

  const handleCreateUser = async () => {
    const anyWindow = window as typeof window & { __apiDebugLogs?: Array<{ id: string; time: string; method?: string; url?: string; status?: number; error?: string }> };
    if (!anyWindow.__apiDebugLogs) {
      anyWindow.__apiDebugLogs = [];
    }
    anyWindow.__apiDebugLogs.push({
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      method: "UI",
      url: "UserManagement create user",
      status: 0
    });
    window.dispatchEvent(new Event("api-debug-log"));
    try {
      setActionError(null);
      const created = await dispatch(createUser(formData)).unwrap();
      await usersDynamic.upsertForEntity(
        created.id,
        userDynamicValues,
        usersDynamic.valuesByEntity[created.id]
      );
    } catch (error) {
      setActionError(resolveErrorMessage(error, "Failed to create user."));
    }
    setInviteOpen(false);
    setFormData({ fullName: "", email: "", role: "Viewer", office: "USA" });
    setUserDynamicValues({});
  };

  const handleCreateCustomer = async () => {
    const anyWindow = window as typeof window & { __apiDebugLogs?: Array<{ id: string; time: string; method?: string; url?: string; status?: number; error?: string }> };
    if (!anyWindow.__apiDebugLogs) {
      anyWindow.__apiDebugLogs = [];
    }
    anyWindow.__apiDebugLogs.push({
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      method: "UI",
      url: "UserManagement create customer",
      status: 0
    });
    window.dispatchEvent(new Event("api-debug-log"));
    try {
      setActionError(null);
      const created = await dispatch(createCustomer({
        name: customerForm.name,
        customerId: customerForm.customerId,
        office: customerForm.office || "USA"
      })).unwrap();
      await customersDynamic.upsertForEntity(
        created.id,
        customerDynamicValues,
        customersDynamic.valuesByEntity[created.id]
      );
    } catch (error) {
      setActionError(resolveErrorMessage(error, "Failed to create customer."));
    }
    setCustomerOpen(false);
    setCustomerForm({ name: "", customerId: "", office: activeOffice === "All" ? "" : activeOffice });
    setCustomerDynamicValues({});
  };

  const handleCreateProduct = async () => {
    const payload: Omit<Product, "id"> = {
      name: productForm.name,
      description: productForm.description || undefined
    };
    try {
      setActionError(null);
      const created = await dispatch(createProduct(payload)).unwrap();
      await productsDynamic.upsertForEntity(
        created.id,
        productDynamicValues,
        productsDynamic.valuesByEntity[created.id]
      );
    } catch (error) {
      setActionError(resolveErrorMessage(error, "Failed to create product."));
    }
    setProductOpen(false);
    setProductForm({ name: "", description: "" });
    setProductDynamicValues({});
  };

  const handleEditUser = (user: User) => {
    setEditUserForm({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      office: user.office,
      isActive: user.isActive
    });
    const existing = usersDynamic.valuesByEntity[user.id] || {};
    const next: Record<string, string> = {};
    usersDynamic.definitions.forEach((field) => {
      next[field.id] = existing[field.id]?.value || "";
    });
    setEditUserDynamicValues(next);
    setEditUserOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditProductForm({
      id: product.id,
      name: product.name,
      description: product.description || ""
    });
    const existing = productsDynamic.valuesByEntity[product.id] || {};
    const next: Record<string, string> = {};
    productsDynamic.definitions.forEach((field) => {
      next[field.id] = existing[field.id]?.value || "";
    });
    setEditProductDynamicValues(next);
    setEditProductOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editUserForm.id) return;
    try {
      setActionError(null);
      const updated = await dispatch(
        updateUser({
          id: editUserForm.id,
          payload: {
            fullName: editUserForm.fullName,
            email: editUserForm.email,
            role: editUserForm.role,
            office: editUserForm.office,
            isActive: editUserForm.isActive
          }
        })
      ).unwrap();
      await usersDynamic.upsertForEntity(
        updated.id,
        editUserDynamicValues,
        usersDynamic.valuesByEntity[updated.id]
      );
    } catch (error) {
      setActionError(resolveErrorMessage(error, "Failed to update user."));
    }
    setEditUserOpen(false);
  };

  const handleSaveCustomer = async () => {
    if (!editCustomerForm.id) return;
    try {
      setActionError(null);
      const updated = await dispatch(
        updateCustomer({
          id: editCustomerForm.id,
          payload: {
            name: editCustomerForm.name,
            customerId: editCustomerForm.customerId,
            office: editCustomerForm.office
          }
        })
      ).unwrap();
      await customersDynamic.upsertForEntity(
        updated.id,
        editCustomerDynamicValues,
        customersDynamic.valuesByEntity[updated.id]
      );
    } catch (error) {
      setActionError(resolveErrorMessage(error, "Failed to update customer."));
    }
    setEditCustomerOpen(false);
  };

  const handleSaveProduct = async () => {
    if (!editProductForm.id) return;
    try {
      setActionError(null);
      const updated = await dispatch(
        updateProduct({
          id: editProductForm.id,
          payload: {
            name: editProductForm.name,
            description: editProductForm.description || undefined
          }
        })
      ).unwrap();
      await productsDynamic.upsertForEntity(
        updated.id,
        editProductDynamicValues,
        productsDynamic.valuesByEntity[updated.id]
      );
    } catch (error) {
      setActionError(resolveErrorMessage(error, "Failed to update product."));
    }
    setEditProductOpen(false);
  };

  const handleAddOffice = async (office: Omit<Office, "id">) => {
    try {
      const created = await officesService.create(office);
      setGlobalOffices((prev) => [...prev, created]);
    } catch (error) {
      console.error("Failed to add office:", error);
    }
  };

  const handleUpdateOffice = async (id: string, office: Omit<Office, "id">) => {
    try {
      const updated = await officesService.update(id, office);
      setGlobalOffices((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (error) {
      console.error("Failed to update office:", error);
    }
  };

  const handleDeleteOffice = async (id: string) => {
    try {
      await officesService.delete(id);
      setGlobalOffices((prev) => prev.filter((o) => o.id !== id));
    } catch (error) {
      console.error("Failed to delete office:", error);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "user") {
      dispatch(deleteUser(deleteTarget.id));
    }
    if (deleteTarget.type === "customer") {
      dispatch(deleteCustomer(deleteTarget.id));
    }
    if (deleteTarget.type === "product") {
      dispatch(deleteProduct(deleteTarget.id));
    }
    if (deleteTarget.type === "role") {
      setRolesConfig((prev) => {
        const { [deleteTarget.id]: _, ...rest } = prev;
        return rest;
      });
    }
    setDeleteTarget(null);
  };

  const toggleFilterValue = (
    setter: Dispatch<SetStateAction<Record<string, Set<string>>>>,
    key: string,
    value: string
  ) => {
    setter((prev) => {
      const current = new Set(prev[key] ?? []);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      return { ...prev, [key]: current };
    });
  };

  const toggleCustomTabFilterValue = (tabId: string, key: string, value: string) => {
    setCustomTabFilters((prev) => {
      const tabFilters = { ...(prev[tabId] || {}) };
      const current = new Set(tabFilters[key] ?? []);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      tabFilters[key] = current;
      return { ...prev, [tabId]: tabFilters };
    });
  };


  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>Admin</Typography>

        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)}>
            {adminTabsConfig.map((tabConfig) => (
              <Tab key={tabConfig.id} label={tabConfig.label} />
            ))}
          </Tabs>

          <IconButton
            size="small"
            onClick={(event) => {
              setAdminSettingsMenu(event.currentTarget);
              setAdminSettingsMenuOpen(true);
            }}
          >
            <SettingsOutlined fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* Users Tab */}
      {adminTabsConfig[tab]?.type === "users" && (
        <Box>
          <Stack direction="row" sx={{ mb: 2 }}>
            <Button variant="contained" onClick={() => setInviteOpen(true)}>
              Invite user
            </Button>
          </Stack>

          {actionError && <Alert severity="error">{actionError}</Alert>}

          <Table>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Name</span>
                    <IconButton size="small" onClick={(event) => setUserMenu({ anchorEl: event.currentTarget, key: "name" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Email</span>
                    <IconButton size="small" onClick={(event) => setUserMenu({ anchorEl: event.currentTarget, key: "email" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Role</span>
                    <IconButton size="small" onClick={(event) => setUserMenu({ anchorEl: event.currentTarget, key: "role" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Office</span>
                    <IconButton size="small" onClick={(event) => setUserMenu({ anchorEl: event.currentTarget, key: "office" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Status</span>
                    <IconButton size="small" onClick={(event) => setUserMenu({ anchorEl: event.currentTarget, key: "status" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                {usersTableConfig.visibleFields
                  .filter((field) => {
                    const fixed = new Set(
                      ["Name", "Email", "Role", "Office", "Status"].map((value) => value.toLowerCase())
                    );
                    if (fixed.has(field.name.toLowerCase())) return false;
                    const hasValue = Object.values(usersDynamic.valuesByEntity).some(
                      (values) => values[field.id]?.value?.trim()
                    );
                    return hasValue;
                  })
                  .map((field) => (
                  <TableCell key={`users-field-${field.id}`}>{field.name}</TableCell>
                ))}
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>{user.seq}</TableCell>
                  <TableCell>{user.fullName}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <FormControl size="small">
                      <Select
                        value={user.role}
                        onChange={(event) =>
                          dispatch(
                            updateUser({
                              id: user.id,
                              payload: { role: event.target.value as UserRole }
                            })
                          )
                        }
                      >
                        {roles.map((role) => (
                          <MenuItem key={role} value={role}>
                            {role}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <FormControl size="small">
                      <Select
                        value={user.office}
                        onChange={(event) =>
                          dispatch(
                            updateUser({
                              id: user.id,
                              payload: { office: event.target.value as User["office"] }
                            })
                          )
                        }
                      >
                        {offices.filter((office) => office !== "All").map((office) => (
                          <MenuItem key={office} value={office}>
                            {office}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={!user.isActive && user.isFirstLogin ? "Pending" : user.isActive ? "Active" : "Inactive"}
                      color={user.isActive ? "success" : "default"}
                      size="small"
                    />
                  </TableCell>
                  {usersTableConfig.visibleFields
                    .filter((field) => {
                      const fixed = new Set(
                        ["Name", "Email", "Role", "Office", "Status"].map((value) => value.toLowerCase())
                      );
                      if (fixed.has(field.name.toLowerCase())) return false;
                      const hasValue = Object.values(usersDynamic.valuesByEntity).some(
                        (values) => values[field.id]?.value?.trim()
                      );
                      return hasValue;
                    })
                    .map((field) => (
                    <TableCell key={`${user.id}-${field.id}`}>
                      {usersDynamic.valuesByEntity[user.id]?.[field.id]?.value || "-"}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" onClick={() => dispatch(inviteUser(user.id))}>
                        Invite
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => dispatch(deactivateUser(user.id))}
                        disabled={!user.isActive}
                      >
                        Deactivate
                      </Button>
                      <Tooltip title="Edit user">
                        <IconButton size="small" onClick={() => handleEditUser(user)}>
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete user">
                        <IconButton
                          size="small"
                          onClick={() =>
                            setDeleteTarget({
                              type: "user",
                              id: user.id,
                              label: user.fullName
                            })
                          }
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Menu
            anchorEl={userMenu.anchorEl}
            open={Boolean(userMenu.anchorEl)}
            onClose={() => setUserMenu({ anchorEl: null, key: "" })}
            slotProps={{
              paper: {
                sx: { maxHeight: 400 }
              }
            }}
          >
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                if (userMenu.key) setUserSort({ key: userMenu.key, dir: "asc" });
                setUserMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort A → Z
            </MenuItem>
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                if (userMenu.key) setUserSort({ key: userMenu.key, dir: "desc" });
                setUserMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort Z → A
            </MenuItem>
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                setUserSort({ key: "", dir: "asc" });
                setUserMenu({ anchorEl: null, key: "" });
              }}
            >
              Clear sort
            </MenuItem>
            {(userFilterOptions[userMenu.key as keyof typeof userFilterOptions] || []).map((option) => {
              const label = option || "(Blank)";
              const selected = !!userFilters[userMenu.key]?.has(option);
              return (
                <MenuItem
                  dense
                  key={`${userMenu.key}-${option}`}
                  sx={{ py: 0.25, minHeight: "unset" }}
                  onClick={() => {
                    if (!userMenu.key) return;
                    toggleFilterValue(setUserFilters, userMenu.key, option);
                  }}
                >
                  <Checkbox checked={selected} size="small" sx={{ py: 0 }} />
                  <ListItemText
                    primary={label}
                    primaryTypographyProps={{ fontSize: "0.8125rem" }}
                  />
                </MenuItem>
              );
            })}
          </Menu>
        </Box>
      )}

      {/* Roles Tab */}
      {adminTabsConfig[tab]?.type === "roles" && (
        <Box>
          <Stack direction="row" sx={{ mb: 2 }}>
            <Button variant="contained" onClick={() => openRoleDialog()}>
              New role
            </Button>
          </Stack>

          {actionError && <Alert severity="error">{actionError}</Alert>}

          <Table>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Role</span>
                    <IconButton size="small" onClick={(event) => setRoleMenu({ anchorEl: event.currentTarget, key: "role" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>View only</span>
                    <IconButton size="small" onClick={(event) => setRoleMenu({ anchorEl: event.currentTarget, key: "viewOnly" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Create/Delete tables</span>
                    <IconButton size="small" onClick={(event) => setRoleMenu({ anchorEl: event.currentTarget, key: "createDeleteTables" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Create users</span>
                    <IconButton size="small" onClick={(event) => setRoleMenu({ anchorEl: event.currentTarget, key: "createUsers" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Edit fields</span>
                    <IconButton size="small" onClick={(event) => setRoleMenu({ anchorEl: event.currentTarget, key: "editFields" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Modify data</span>
                    <IconButton size="small" onClick={(event) => setRoleMenu({ anchorEl: event.currentTarget, key: "modifyData" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>Edit forms</span>
                    <IconButton size="small" onClick={(event) => setRoleMenu({ anchorEl: event.currentTarget, key: "editForms" })}>
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
                               <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRoles.map((row) => (
                <TableRow key={row.role} hover>
                  <TableCell>{row.seq}</TableCell>
                  <TableCell>{row.role}</TableCell>
                  {[
                    "viewOnly",
                    "createDeleteTables",
                    "createUsers",
                    "editFields",
                    "modifyData",
                    "editForms"
                  ].map((perm) => (
                    <TableCell key={`${row.role}-${perm}`}>
                      <Checkbox
                        checked={!!rolesConfig[row.role]?.[perm]}
                        onChange={(event) =>
                          setRolesConfig((prev) => ({
                            ...prev,
                            [row.role]: {
                              ...prev[row.role],
                              [perm]: event.target.checked
                            }
                          }))
                        }
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Tooltip title="Edit role">
                        <IconButton
                          size="small"
                          onClick={() => openRoleDialog(row.role)}
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete role">
                        <IconButton
                          size="small"
                          onClick={() =>
                            setDeleteTarget({
                              type: "role",
                              id: row.role,
                              label: row.role
                            })
                          }
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Menu
            anchorEl={roleMenu.anchorEl}
            open={Boolean(roleMenu.anchorEl)}
            onClose={() => setRoleMenu({ anchorEl: null, key: "" })}
            slotProps={{
              paper: {
                sx: { maxHeight: 400 }
              }
            }}
          >
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                if (roleMenu.key) setRoleSort({ key: roleMenu.key, dir: "asc" });
                setRoleMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort A → Z
            </MenuItem>
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                if (roleMenu.key) setRoleSort({ key: roleMenu.key, dir: "desc" });
                setRoleMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort Z → A
            </MenuItem>
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                setRoleSort({ key: "", dir: "asc" });
                setRoleMenu({ anchorEl: null, key: "" });
              }}
            >
              Clear sort
            </MenuItem>
            {(roleFilterOptions[roleMenu.key as keyof typeof roleFilterOptions] || []).map((option) => {
              const label = option || "(Blank)";
              const selected = !!roleFilters[roleMenu.key]?.has(option);
              return (
                <MenuItem
                  dense
                  key={`${roleMenu.key}-${option}`}
                  sx={{ py: 0.25, minHeight: "unset" }}
                  onClick={() => {
                    if (!roleMenu.key) return;
                    toggleFilterValue(setRoleFilters, roleMenu.key, option);
                  }}
                >
                  <Checkbox checked={selected} size="small" sx={{ py: 0 }} />
                  <ListItemText
                    primary={label}
                    primaryTypographyProps={{ fontSize: "0.8125rem" }}
                  />
                </MenuItem>
              );
            })}
          </Menu>
        </Box>
      )}

      {/* Customers Tab */}
      {adminTabsConfig[tab]?.type === "customers" && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            {customerViewMode === 'cards' ? (
              <Button
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={async () => {
                  const newCustomerPayload = {
                    name: `New Customer`,
                    customerId: `CUST-${Date.now()}`,
                    office: activeOffice === "All" ? "USA" : activeOffice,
                    logo: null,
                    logoShape: 'round',
                    photoScale: 100,
                    logoSize: 70
                  };

                  try {
                    const response = await api.post('/customers', newCustomerPayload);
                    await dispatch(fetchCustomers());
                    setEditingCustomerId(response.data.id);
                    setEditCustomerName(response.data.name);
                    setEditCustomerIndustry('');
                    setEditCustomerLogo(response.data.logo);
                    setEditCustomerLogoShape(response.data.logoShape || 'round');
                    setEditCustomerLogoSize(response.data.logoSize || 70);
                    setEditCustomerPhotoScale(response.data.photoScale || 100);
                  } catch (err) {
                    console.error("Failed to create customer", err);
                    alert("Failed to create customer");
                  }
                }}
              >
                New Client
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={async () => {
                  // First check if we have any customers
                  if (customersList.length === 0) {
                    alert('Please create a customer first by switching to Cards view');
                    return;
                  }

                  // Create a new site with the first customer as default
                  const defaultCustomer = customersList[0];
                  const newSite = {
                    name: 'New Site',
                    address: '',
                    city: '',
                    state: '',
                    zipCode: null,
                    contactName: '',
                    contactPhone: '',
                    contactEmail: null,
                    notes: '',
                    customerId: defaultCustomer.id
                  };

                  try {
                    const response = await api.post('/sites', newSite);
                    setSitesList(prev => [...prev, response.data]);
                    setEditingSiteId(response.data.id);
                    setEditSiteFormData({
                      name: response.data.name,
                      city: response.data.city,
                      state: response.data.state,
                      notes: response.data.notes,
                    });
                  } catch (err) {
                    console.error('Failed to create site', err);
                    alert('Failed to create site. Make sure the customer exists in the database.');
                  }
                }}
              >
                New Site
              </Button>
            )}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder={customerViewMode === 'cards' ? 'Search customers...' : 'Search sites...'}
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                sx={{ minWidth: 250 }}
              />
              <ToggleButtonGroup
                value={customerViewMode}
                exclusive
                onChange={(_, value) => value && setCustomerViewMode(value)}
                size="small"
              >
                <ToggleButton value="cards">
                  <GridView sx={{ mr: 0.5, fontSize: 18 }} />
                  Cards
                </ToggleButton>
                <ToggleButton value="table">
                  <TableRows sx={{ mr: 0.5, fontSize: 18 }} />
                  Table
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Stack>

          {/* Cards View */}
          {customerViewMode === 'cards' && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: 2,
              }}
            >
            {filteredCustomers
              .filter((customer) => {
                // Search only customer names that start with the search term
                if (!customerSearch) return true;
                const searchLower = customerSearch.toLowerCase();
                return customer.name.toLowerCase().startsWith(searchLower);
              })
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((customer) => {
                const isFlipped = editingCustomerId === customer.id;
                return (
                  <Box
                    key={customer.id}
                    sx={{
                      perspective: '1000px',
                      height: '220px',
                    }}
                  >
                    <Box
                      sx={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        transition: 'transform 0.6s',
                        transformStyle: 'preserve-3d',
                        transform: isFlipped ? 'rotateX(180deg)' : 'rotateX(0deg)',
                      }}
                    >
                      {/* Front Face */}
                      <Paper
                        sx={{
                          position: 'absolute',
                          width: '100%',
                          height: '100%',
                          backfaceVisibility: 'hidden',
                          p: 2,
                          textAlign: 'center',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderBottom: '4px solid',
                          borderBottomColor: 'primary.main',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          '&:hover': {
                            boxShadow: 6,
                            transform: 'translateY(-8px)',
                          },
                        }}
                      >
                        <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          <Tooltip title="Delete customer">
                            <IconButton
                              size="small"
                              sx={{ padding: 0.25 }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Delete customer "${customer.name}"?`)) return;
                                try {
                                  await api.delete(`/customers/${customer.id}`);
                                  await dispatch(fetchCustomers());
                                } catch (err) {
                                  console.error("Failed to delete customer", err);
                                  alert("Failed to delete customer");
                                }
                              }}
                            >
                              <DeleteOutline sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit customer">
                            <IconButton
                              size="small"
                              sx={{ padding: 0.25 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCustomerId(customer.id);
                                setEditCustomerName(customer.name);
                                setEditCustomerIndustry(customer.type);
                                setEditCustomerLogo(customer.logo);
                                setEditCustomerLogoShape(customer.logoShape || 'round');
                                setEditCustomerLogoSize(customer.logoSize || 70);
                                setEditCustomerPhotoScale(customer.photoScale || 100);
                              }}
                            >
                              <EditOutlined sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        {/* Logo Area - Fixed height */}
                        <Box
                          sx={{
                            height: 100,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            mb: 1,
                          }}
                        >
                          {(customer.logoShape || 'round') === 'none' && customer.logo ? (
                            <img
                              src={customer.logo}
                              alt={customer.name}
                              style={{
                                maxWidth: '100%',
                                maxHeight: `${100 * (customer.photoScale || 100) / 100}px`,
                                height: 'auto',
                                width: 'auto',
                                objectFit: 'contain',
                              }}
                            />
                          ) : (
                            <Box
                              sx={{
                                width: (customer.logoShape || 'round') === 'rectangular' ? 140 : (customer.logoSize || 70),
                                height: customer.logoSize || 70,
                                borderRadius: (customer.logoShape || 'round') === 'none' ? '0px' : (customer.logoShape || 'round') === 'round' ? '50%' : '8px',
                                background: customer.logo ? 'transparent' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                backgroundImage: customer.logo ? `url(${customer.logo})` : 'none',
                                backgroundSize: `${customer.photoScale || 100}%`,
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '1.5rem',
                              }}
                            >
                              {!customer.logo && customer.name.charAt(0)}
                            </Box>
                          )}
                        </Box>

                        {/* Text Area - Fixed position */}
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                            {customer.name}
                          </Typography>
                          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
                            {customer.customerId}
                          </Typography>
                          <Box sx={{ mt: 'auto' }}>
                            <Button
                              size="small"
                              variant="contained"
                              fullWidth
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/customers/${customer.id}/sites`);
                              }}
                            >
                              View Sites ({sitesList.filter(s => s.customerId === customer.id).length})
                            </Button>
                          </Box>
                        </Box>
                      </Paper>

                      {/* Back Face */}
                      <Paper
                        sx={{
                          position: 'absolute',
                          width: '100%',
                          height: '100%',
                          backfaceVisibility: 'hidden',
                          transform: 'rotateX(180deg)',
                          p: 2,
                          textAlign: 'center',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderBottom: '4px solid',
                          borderBottomColor: 'secondary.main',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          gap: 1,
                        }}
                      >
                        {editCustomerLogoShape === 'none' && editCustomerLogo ? (
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              margin: '0 auto 8px',
                              maxWidth: '100%',
                              maxHeight: '120px',
                              position: 'relative',
                              cursor: 'pointer',
                              '&:hover::after': {
                                content: '"Upload"',
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0,0,0,0.7)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                color: 'white',
                              },
                            }}
                            onClick={() => setLogoUploadDialogOpen(true)}
                          >
                            <img
                              src={editCustomerLogo}
                              alt={editCustomerName}
                              style={{
                                maxWidth: '100%',
                                maxHeight: '120px',
                                height: 'auto',
                                width: 'auto',
                                objectFit: 'contain',
                              }}
                            />
                          </Box>
                        ) : (
                          <Box
                            sx={{
                              width: editCustomerLogoShape === 'rectangular' ? 140 - 10 : editCustomerLogoSize - 10,
                              height: editCustomerLogoSize - 10,
                              borderRadius: editCustomerLogoShape === 'none' ? '0px' : editCustomerLogoShape === 'round' ? '50%' : '8px',
                              background: editCustomerLogo ? 'transparent' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              backgroundImage: editCustomerLogo ? `url(${editCustomerLogo})` : 'none',
                              backgroundSize: `${editCustomerPhotoScale}%`,
                              backgroundPosition: 'center',
                              backgroundRepeat: 'no-repeat',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              margin: '0 auto 8px',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '1.3rem',
                              position: 'relative',
                              cursor: 'pointer',
                              '&:hover::after': {
                                content: '"Upload"',
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0,0,0,0.7)',
                                borderRadius: editCustomerLogoShape === 'none' ? '0px' : editCustomerLogoShape === 'round' ? '50%' : '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.65rem',
                              },
                            }}
                            onClick={() => setLogoUploadDialogOpen(true)}
                          >
                            {!editCustomerLogo && editCustomerName.charAt(0)}
                          </Box>
                        )}
                        <TextField
                          size="small"
                          value={editCustomerName}
                          onChange={(e) => setEditCustomerName(e.target.value)}
                          placeholder="Customer Name"
                          fullWidth
                          sx={{
                            '& .MuiInputBase-root': {
                              height: 32,
                              fontSize: '1rem',
                              fontWeight: 600
                            }
                          }}
                        />
                        <TextField
                          size="small"
                          value={editCustomerIndustry}
                          onChange={(e) => setEditCustomerIndustry(e.target.value)}
                          placeholder="Industry"
                          fullWidth
                          sx={{
                            '& .MuiInputBase-root': {
                              height: 26,
                              fontSize: '0.75rem'
                            }
                          }}
                        />
                        <Button
                          variant="contained"
                          size="small"
                          onClick={async () => {
                            try {
                              // Save to API with logo fields
                              const customerPayload = {
                                name: editCustomerName,
                                customerId: `CUST-${customer.id}`,
                                office: activeOffice === "All" ? "USA" : activeOffice,
                                logo: editCustomerLogo,
                                logoShape: editCustomerLogoShape,
                                photoScale: editCustomerPhotoScale,
                                logoSize: editCustomerLogoSize
                              };

                              // Update existing customer
                              await api.put(`/customers/${customer.id}`, customerPayload);

                              // Refresh from API
                              await dispatch(fetchCustomers());
                            } catch (err) {
                              console.error("Failed to save customer", err);
                              alert("Failed to save customer");
                            }

                            setEditingCustomerId(null);
                            setEditCustomerName("");
                            setEditCustomerIndustry("");
                            setEditCustomerLogo(null);
                            setEditCustomerLogoShape('round');
                            setEditCustomerLogoSize(70);
                            setEditCustomerPhotoScale(100);
                          }}
                        >
                          Save
                        </Button>
                      </Paper>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Table View */}
          {customerViewMode === 'table' && (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell width="60">#</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Site Name</TableCell>
                    <TableCell>City</TableCell>
                    <TableCell>State/Country</TableCell>
                    <TableCell>Comments</TableCell>
                    <TableCell width="120" align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sitesList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No sites found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sitesList
                      .filter((site) => {
                        if (!customerSearch) return true;
                        const searchLower = customerSearch.toLowerCase();
                        const customerName = getCustomerName(site.customerId).toLowerCase();
                        const siteName = site.name.toLowerCase();
                        const city = (site.city || '').toLowerCase();
                        const state = (site.state || '').toLowerCase();
                        return customerName.includes(searchLower) ||
                               siteName.includes(searchLower) ||
                               city.includes(searchLower) ||
                               state.includes(searchLower);
                      })
                      .map((site, index) => {
                      const isEditing = editingSiteId === site.id;
                      const customer = getCustomerData(site.customerId);

                      return (
                        <TableRow key={site.id} hover={!isEditing}>
                          <TableCell>{index + 1}</TableCell>

                          {/* Customer */}
                          <TableCell>
                            {isEditing ? (
                              <FormControl fullWidth size="small">
                                <Select
                                  value={editSiteFormData.customerId || ''}
                                  onChange={(e) => setEditSiteFormData(prev => ({ ...prev, customerId: e.target.value }))}
                                >
                                  {customersList.map((cust) => (
                                    <MenuItem key={cust.id} value={cust.id}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {cust.logo ? (
                                          cust.logoShape === 'none' ? (
                                            <img
                                              src={cust.logo}
                                              alt={cust.name}
                                              style={{
                                                maxHeight: '20px',
                                                maxWidth: '40px',
                                                objectFit: 'contain',
                                              }}
                                            />
                                          ) : (
                                            <Box
                                              sx={{
                                                width: cust.logoShape === 'rectangular' ? 40 : 20,
                                                height: 20,
                                                borderRadius: cust.logoShape === 'round' ? '50%' : '4px',
                                                backgroundImage: `url(${cust.logo})`,
                                                backgroundSize: `${cust.photoScale || 100}%`,
                                                backgroundPosition: 'center',
                                                backgroundRepeat: 'no-repeat',
                                              }}
                                            />
                                          )
                                        ) : (
                                          <Box
                                            sx={{
                                              width: 20,
                                              height: 20,
                                              borderRadius: '50%',
                                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              color: 'white',
                                              fontSize: '0.625rem',
                                              fontWeight: 'bold',
                                            }}
                                          >
                                            {cust.name.charAt(0)}
                                          </Box>
                                        )}
                                        <Typography variant="body2">{cust.name}</Typography>
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {customer?.logo ? (
                                  customer.logoShape === 'none' ? (
                                    <img
                                      src={customer.logo}
                                      alt={customer.name}
                                      style={{
                                        maxHeight: '30px',
                                        maxWidth: '60px',
                                        objectFit: 'contain',
                                      }}
                                    />
                                  ) : (
                                    <Box
                                      sx={{
                                        width: customer.logoShape === 'rectangular' ? 60 : 30,
                                        height: 30,
                                        borderRadius: customer.logoShape === 'round' ? '50%' : '4px',
                                        backgroundImage: `url(${customer.logo})`,
                                        backgroundSize: `${customer.photoScale || 100}%`,
                                        backgroundPosition: 'center',
                                        backgroundRepeat: 'no-repeat',
                                      }}
                                    />
                                  )
                                ) : (
                                  <Box
                                    sx={{
                                      width: 30,
                                      height: 30,
                                      borderRadius: '50%',
                                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: 'white',
                                      fontSize: '0.75rem',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    {getCustomerName(site.customerId).charAt(0)}
                                  </Box>
                                )}
                                <Typography variant="body2">
                                  {getCustomerName(site.customerId)}
                                </Typography>
                              </Box>
                            )}
                          </TableCell>

                          {/* Site Name */}
                          <TableCell>
                            {isEditing ? (
                              <TextField
                                size="small"
                                value={editSiteFormData.name || ''}
                                onChange={(e) => setEditSiteFormData(prev => ({ ...prev, name: e.target.value }))}
                                fullWidth
                              />
                            ) : (
                              site.name
                            )}
                          </TableCell>

                          {/* City */}
                          <TableCell>
                            {isEditing ? (
                              <TextField
                                size="small"
                                value={editSiteFormData.city || ''}
                                onChange={(e) => setEditSiteFormData(prev => ({ ...prev, city: e.target.value }))}
                                fullWidth
                              />
                            ) : (
                              site.city || '-'
                            )}
                          </TableCell>

                          {/* State/Country */}
                          <TableCell>
                            {isEditing ? (
                              <TextField
                                size="small"
                                value={editSiteFormData.state || ''}
                                onChange={(e) => setEditSiteFormData(prev => ({ ...prev, state: e.target.value }))}
                                fullWidth
                              />
                            ) : (
                              site.state || '-'
                            )}
                          </TableCell>

                          {/* Comments */}
                          <TableCell>
                            {isEditing ? (
                              <TextField
                                size="small"
                                value={editSiteFormData.notes || ''}
                                onChange={(e) => setEditSiteFormData(prev => ({ ...prev, notes: e.target.value }))}
                                fullWidth
                                multiline
                                rows={2}
                              />
                            ) : (
                              site.notes || '-'
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell align="center">
                            {isEditing ? (
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                <Button size="small" variant="contained" onClick={handleSaveSite}>
                                  Save
                                </Button>
                                <Button size="small" variant="outlined" onClick={handleCancelSiteEdit}>
                                  Cancel
                                </Button>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                <Tooltip title="Edit">
                                  <IconButton size="small" onClick={() => handleEditSite(site)}>
                                    <EditOutlined fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton size="small" onClick={() => handleDeleteSite(site.id)} color="error">
                                    <DeleteOutline fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* Global Offices Tab */}
      {adminTabsConfig[tab]?.type === "offices" && (
        <Box>
          <GlobalOfficeMap
            offices={globalOffices}
            onAddOffice={handleAddOffice}
            onUpdateOffice={handleUpdateOffice}
            onDeleteOffice={handleDeleteOffice}
          />
        </Box>
      )}

      {/* Products Tab */}
      {adminTabsConfig[tab]?.type === "products" && (
        <Box>
          <Stack direction="row" sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setProductOpen(true)}>
              New Product
            </Button>
          </Stack>

          {actionError && <Alert severity="error">{actionError}</Alert>}

          <Table>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                {productsTableConfig.visibleFields.map((field) => (
                  <TableCell key={`products-header-${field.id}`}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>{field.name}</span>
                      <IconButton
                        size="small"
                        onClick={(event) => setProductMenu({ anchorEl: event.currentTarget, key: field.id })}
                      >
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                ))}
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2 + productsTableConfig.visibleFields.length} align="center">
                    <Typography variant="body2" color="text.secondary">
                      {products.length === 0 ? "No products yet" : "No products match the current filters"}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product, index) => {
                  const getProductFieldValue = (fieldId: string) => {
                    if (fieldId === "base-name") return product.name;
                    if (fieldId === "base-description") return product.description || "-";
                    return productsDynamic.valuesByEntity[product.id]?.[fieldId]?.value || "-";
                  };

                  return (
                    <TableRow key={product.id} hover>
                      <TableCell>{index + 1}</TableCell>
                      {productsTableConfig.visibleFields.map((field) => (
                        <TableCell key={`${product.id}-${field.id}`}>
                          {getProductFieldValue(field.id)}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Edit product">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setEditProductForm({
                                  id: product.id,
                                  name: product.name,
                                  description: product.description || ""
                                });
                                const dynamicVals = productsDynamic.valuesByEntity[product.id] || {};
                                setEditProductDynamicValues(dynamicVals);
                                setEditProductOpen(true);
                              }}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete product">
                            <IconButton
                              size="small"
                              onClick={() =>
                                setDeleteTarget({ type: "product", id: product.id, label: product.name })
                              }
                            >
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <Menu
            anchorEl={productMenu.anchorEl}
            open={Boolean(productMenu.anchorEl)}
            onClose={() => setProductMenu({ anchorEl: null, key: "" })}
            slotProps={{
              paper: {
                sx: { maxHeight: 400 }
              }
            }}
          >
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                if (productMenu.key) setProductSort({ key: productMenu.key, dir: "asc" });
                setProductMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort A → Z
            </MenuItem>
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                if (productMenu.key) setProductSort({ key: productMenu.key, dir: "desc" });
                setProductMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort Z → A
            </MenuItem>
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                setProductSort({ key: "", dir: "asc" });
                setProductMenu({ anchorEl: null, key: "" });
              }}
            >
              Clear sort
            </MenuItem>
            {(productFilterOptions[productMenu.key as keyof typeof productFilterOptions] || []).map((option) => {
              const label = option || "(Blank)";
              const selected = !!productFilters[productMenu.key]?.has(option);
              return (
                <MenuItem
                  dense
                  key={`${productMenu.key}-${option}`}
                  sx={{ py: 0.25, minHeight: "unset" }}
                  onClick={() => {
                    if (!productMenu.key) return;
                    toggleFilterValue(setProductFilters, productMenu.key, option);
                  }}
                >
                  <Checkbox checked={selected} size="small" sx={{ py: 0 }} />
                  <ListItemText
                    primary={label}
                    primaryTypographyProps={{ fontSize: "0.8125rem" }}
                  />
                </MenuItem>
              );
            })}
          </Menu>
        </Box>
      )}

      {/* Assets Tab */}
      {adminTabsConfig[tab]?.type === "assets" && (
        <Box>
          <Stack direction="row" sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => {
              setEditingAssetId(null);
              setAssetForm({
                machineType: "",
                machineId: "",
                serialNumber: "",
                pmCount: "1",
                comments: ""
              });
              setAssetDynamicValues({});
              setAssetOpen(true);
            }}>
              New Asset
            </Button>
          </Stack>

          {actionError && <Alert severity="error">{actionError}</Alert>}

          <Table>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                {assetsTableConfig.visibleFields.map((field) => (
                  <TableCell key={`assets-header-${field.id}`}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>{field.name}</span>
                      <IconButton
                        size="small"
                        onClick={(event) => setAssetMenu({ anchorEl: event.currentTarget, key: field.id })}
                      >
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                ))}
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAssets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2 + assetsTableConfig.visibleFields.length} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No assets yet
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAssets.map((asset, index) => {
                  const getAssetFieldValue = (fieldId: string) => {
                    if (fieldId === "base-machineType") return asset.machineType;
                    if (fieldId === "base-machineId") return asset.machineId;
                    if (fieldId === "base-serialNumber") return asset.serialNumber;
                    if (fieldId === "base-pmCount") return asset.pmCount;
                    if (fieldId === "base-comments") return asset.comments || "-";
                    return assetsDynamic.valuesByEntity[asset.id]?.[fieldId]?.value || "-";
                  };

                  return (
                    <TableRow key={asset.id} hover>
                      <TableCell>{index + 1}</TableCell>
                      {assetsTableConfig.visibleFields.map((field) => (
                        <TableCell key={`${asset.id}-${field.id}`}>
                          {getAssetFieldValue(field.id)}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Edit asset">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setAssetForm({
                                  machineType: asset.machineType,
                                  machineId: asset.machineId,
                                  serialNumber: asset.serialNumber,
                                  pmCount: asset.pmCount,
                                  comments: asset.comments
                                });
                                const dynamicVals = assetsDynamic.valuesByEntity[asset.id] || {};
                                const next: Record<string, string> = {};
                                assetsDynamic.definitions.forEach((field) => {
                                  next[field.id] = dynamicVals[field.id]?.value || "";
                                });
                                setAssetDynamicValues(next);
                                setEditingAssetId(asset.id);
                                setAssetOpen(true);
                              }}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete asset">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setAssets((prev) => prev.filter((a) => a.id !== asset.id));
                              }}
                            >
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <Menu
            anchorEl={assetMenu.anchorEl}
            open={Boolean(assetMenu.anchorEl)}
            onClose={() => setAssetMenu({ anchorEl: null, key: "" })}
            slotProps={{
              paper: {
                sx: { maxHeight: 400 }
              }
            }}
          >
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                if (assetMenu.key) setAssetSort({ key: assetMenu.key, dir: "asc" });
                setAssetMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort A → Z
            </MenuItem>
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                if (assetMenu.key) setAssetSort({ key: assetMenu.key, dir: "desc" });
                setAssetMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort Z → A
            </MenuItem>
            <MenuItem
              dense
              sx={{ fontSize: "0.875rem", py: 0.5 }}
              onClick={() => {
                setAssetSort({ key: "", dir: "asc" });
                setAssetMenu({ anchorEl: null, key: "" });
              }}
            >
              Clear sort
            </MenuItem>
            {(assetFilterOptions[assetMenu.key as keyof typeof assetFilterOptions] || []).map((option) => {
              const label = option || "(Blank)";
              const selected = !!assetFilters[assetMenu.key]?.has(option);
              return (
                <MenuItem
                  dense
                  key={`${assetMenu.key}-${option}`}
                  sx={{ py: 0.25, minHeight: "unset" }}
                  onClick={() => {
                    if (!assetMenu.key) return;
                    toggleFilterValue(setAssetFilters, assetMenu.key, option);
                  }}
                >
                  <Checkbox checked={selected} size="small" sx={{ py: 0 }} />
                  <ListItemText
                    primary={label}
                    primaryTypographyProps={{ fontSize: "0.8125rem" }}
                  />
                </MenuItem>
              );
            })}
          </Menu>
        </Box>
      )}

      {/* Custom Tabs - Dynamically Rendered */}
      {adminTabsConfig
        .filter((tabConfig) => tabConfig.type === "custom")
        .map((tabConfig) => {
          // Calculate tab index
          const tabIndex = adminTabsConfig.findIndex((t) => t.id === tabConfig.id);
          if (tab !== tabIndex) return null;

          const rows = adminTabRows[tabConfig.id] || [];
          const columns = tabConfig.columns && tabConfig.columns.length > 0 ? tabConfig.columns : ["ID", "Name", "Created Date"];

          // Compute filter options for this tab
          const filterOptions: Record<string, string[]> = {};
          columns.forEach((col) => {
            const values = new Set<string>();
            rows.forEach((row) => {
              values.add(normalize(row[col] ?? ""));
            });
            filterOptions[col] = Array.from(values).sort();
          });

          // Apply filters and sorting
          let filteredRows = [...rows];
          const tabFilters = customTabFilters[tabConfig.id] || {};
          Object.entries(tabFilters).forEach(([colKey, valueSet]) => {
            if (valueSet.size === 0) return;
            filteredRows = filteredRows.filter((row) => {
              const cellValue = normalize(row[colKey] ?? "");
              return valueSet.has(cellValue);
            });
          });

          const tabSort = customTabSorts[tabConfig.id];
          if (tabSort && tabSort.key) {
            filteredRows.sort((a, b) => {
              const aVal = normalize(a[tabSort.key] ?? "");
              const bVal = normalize(b[tabSort.key] ?? "");
              return tabSort.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            });
          }

          return (
            <Box key={tabConfig.id}>
              {/* Table */}
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    {columns.map((col) => (
                      <TableCell key={col}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <span>{col}</span>
                          <IconButton
                            size="small"
                            onClick={(event) =>
                              setCustomTabMenu({ tabId: tabConfig.id, anchorEl: event.currentTarget, key: col })
                            }
                          >
                            <ArrowDropDown fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    ))}
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length + 2} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No data yet. Click "Add Row" to create the first entry.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row, index) => (
                      <TableRow key={row.ID || index} hover>
                        <TableCell>{index + 1}</TableCell>
                        {columns.map((col) => (
                          <TableCell key={col}>{row[col] || ""}</TableCell>
                        ))}
                        <TableCell>
                          <Stack direction="row" spacing={1}>
                            <Tooltip title="Edit row">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  const tabItem = tabConfig;
                                  const columns =
                                    tabItem.columns && tabItem.columns.length > 0 ? tabItem.columns : ["ID", "Name", "Created Date"];
                                  const tabFieldIds = tabItem.fieldIds || [];
                                  const nextForm: Record<string, string> = {};
                                  columns.forEach((name) => {
                                    nextForm[`default:${name}`] = row[name] ?? "";
                                  });
                                  tabFieldIds.forEach((fieldId) => {
                                    nextForm[fieldId] = row[fieldId] ?? "";
                                  });
                                  setCustomRowForm(nextForm);
                                  setCustomRowDialogTabId(tabItem.id);
                                  setCustomRowDialogIndex(index);
                                  setCustomRowDialogOpen(true);
                                }}
                              >
                                <EditOutlined fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete row">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setAdminTabRows((prev) => ({
                                    ...prev,
                                    [tabConfig.id]: prev[tabConfig.id].filter((_, i) => i !== index)
                                  }));
                                }}
                              >
                                <DeleteOutline fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <Menu
                anchorEl={customTabMenu.tabId === tabConfig.id ? customTabMenu.anchorEl : null}
                open={Boolean(customTabMenu.tabId === tabConfig.id && customTabMenu.anchorEl)}
                onClose={() => setCustomTabMenu({ tabId: "", anchorEl: null, key: "" })}
                slotProps={{
                  paper: {
                    sx: { maxHeight: 400 }
                  }
                }}
              >
                <MenuItem
                  dense
                  sx={{ fontSize: "0.875rem", py: 0.5 }}
                  onClick={() => {
                    if (customTabMenu.key) {
                      setCustomTabSorts((prev) => ({
                        ...prev,
                        [tabConfig.id]: { key: customTabMenu.key, dir: "asc" }
                      }));
                    }
                    setCustomTabMenu({ tabId: "", anchorEl: null, key: "" });
                  }}
                >
                  Sort A → Z
                </MenuItem>
                <MenuItem
                  dense
                  sx={{ fontSize: "0.875rem", py: 0.5 }}
                  onClick={() => {
                    if (customTabMenu.key) {
                      setCustomTabSorts((prev) => ({
                        ...prev,
                        [tabConfig.id]: { key: customTabMenu.key, dir: "desc" }
                      }));
                    }
                    setCustomTabMenu({ tabId: "", anchorEl: null, key: "" });
                  }}
                >
                  Sort Z → A
                </MenuItem>
                <MenuItem
                  dense
                  sx={{ fontSize: "0.875rem", py: 0.5 }}
                  onClick={() => {
                    setCustomTabSorts((prev) => ({
                      ...prev,
                      [tabConfig.id]: { key: "", dir: "asc" }
                    }));
                    setCustomTabMenu({ tabId: "", anchorEl: null, key: "" });
                  }}
                >
                  Clear sort
                </MenuItem>
                {(filterOptions[customTabMenu.key] || []).map((option) => {
                  const label = option || "(Blank)";
                  const selected = !!(customTabFilters[tabConfig.id]?.[customTabMenu.key]?.has(option));
                  return (
                    <MenuItem
                      dense
                      key={`${customTabMenu.key}-${option}`}
                      sx={{ py: 0.25, minHeight: "unset" }}
                      onClick={() => {
                        if (!customTabMenu.key) return;
                        setCustomTabFilters((prev) => {
                          const tabFilters = prev[tabConfig.id] || {};
                          const currentSet = tabFilters[customTabMenu.key] || new Set<string>();
                          const newSet = new Set(currentSet);
                          if (newSet.has(option)) {
                            newSet.delete(option);
                          } else {
                            newSet.add(option);
                          }
                          return {
                            ...prev,
                            [tabConfig.id]: {
                              ...tabFilters,
                              [customTabMenu.key]: newSet
                            }
                          };
                        });
                      }}
                    >
                      <Checkbox checked={selected} size="small" sx={{ py: 0 }} />
                      <ListItemText
                        primary={label}
                        primaryTypographyProps={{ fontSize: "0.8125rem" }}
                      />
                    </MenuItem>
                  );
                })}
              </Menu>
            </Box>
          );
        })}

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Invite new user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Full name"
              value={formData.fullName}
              onChange={(event) => setFormData((prev) => ({ ...prev, fullName: event.target.value }))}
            />
            <TextField
              label="Email"
              type="email"
              value={formData.email}
              onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
            />
            <FormControl>
              <Select
                value={formData.role}
                onChange={(event) => setFormData((prev) => ({ ...prev, role: event.target.value as UserRole }))}
              >
                {roles.map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <Select
                value={formData.office}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, office: event.target.value as User["office"] }))
                }
              >
                {offices.filter((office) => office !== "All").map((office) => (
                  <MenuItem key={office} value={office}>
                    {office}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DynamicFieldsForm
              definitions={orderedUsersDefinitions}
              values={userDynamicValues}
              onChange={setUserDynamicValues}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setInviteOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreateUser}>
            Send invite
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{roleForm.originalName ? "Edit role" : "Create role"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Role name"
              value={roleForm.name}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <Typography variant="subtitle2">Permissions</Typography>
            {[
              { key: "viewOnly", label: "View only" },
              { key: "createDeleteTables", label: "Create/Delete tables" },
              { key: "createUsers", label: "Create users" },
              { key: "editFields", label: "Edit fields" },
              { key: "modifyData", label: "Modify data" },
              { key: "editForms", label: "Edit forms" }
            ].map((perm) => (
              <Stack key={perm.key} direction="row" spacing={1} alignItems="center">
                <Checkbox
                  checked={!!roleForm.permissions[perm.key]}
                  onChange={(event) =>
                    setRoleForm((prev) => ({
                      ...prev,
                      permissions: { ...prev.permissions, [perm.key]: event.target.checked }
                    }))
                  }
                />
                <Typography variant="body2">{perm.label}</Typography>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setRoleDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const name = roleForm.name.trim();
              if (!name) return;
              setRolesConfig((prev) => {
                const next = { ...prev };
                if (roleForm.originalName && roleForm.originalName !== name) {
                  delete next[roleForm.originalName];
                }
                next[name] = { ...roleForm.permissions };
                return next;
              });
              setRoleDialogOpen(false);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <TableConfigDialog
        open={tableConfigOpen}
        onClose={() => setTableConfigOpen(false)}
        title={`Table configuration: ${tableConfigTarget}`}
        availableFields={availableFieldsForAdminTable.map((field) => ({
          id: field.id,
          name: field.name,
          fieldType: field.fieldType,
          linkToFieldId: field.linkToFieldId,
          actionType: field.actionType
        }))}
        fields={
          tableConfigTarget === "users"
            ? usersTableConfig.orderedFields
            : tableConfigTarget === "customers"
              ? customersTableConfig.orderedFields
              : tableConfigTarget === "products"
                ? productsTableConfig.orderedFields
                : assetsTableConfig.orderedFields
        }
        config={
          tableConfigTarget === "users"
            ? usersTableConfig.config
            : tableConfigTarget === "customers"
              ? customersTableConfig.config
              : tableConfigTarget === "products"
                ? productsTableConfig.config
                : assetsTableConfig.config
        }
        onChange={(next) => {
          if (tableConfigTarget === "users") usersTableConfig.setConfig(next);
          if (tableConfigTarget === "customers") customersTableConfig.setConfig(next);
          if (tableConfigTarget === "products") productsTableConfig.setConfig(next);
          if (tableConfigTarget === "assets") assetsTableConfig.setConfig(next);
        }}
        onAddField={async (fieldId) => {
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes(tableConfigTarget)
            ? existing.tables
            : [...existing.tables, tableConfigTarget];
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          if (tableConfigTarget === "users") await usersDynamic.reload();
          if (tableConfigTarget === "customers") await customersDynamic.reload();
          if (tableConfigTarget === "products") await productsDynamic.reload();
          if (tableConfigTarget === "assets") await assetsDynamic.reload();
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          try {
            await fieldService.createDefinition({
              id: "",
              name,
              fieldType: type,
              linkToFieldId: linkToFieldId || null,
              actionType: actionType || null,
              tables: [tableConfigTarget],
              sortOrder: allFieldDefinitions.definitions.length + 1,
              isActive: true
            });
            await allFieldDefinitions.reload();
            if (tableConfigTarget === "users") await usersDynamic.reload();
            if (tableConfigTarget === "customers") await customersDynamic.reload();
            if (tableConfigTarget === "products") await productsDynamic.reload();
            if (tableConfigTarget === "assets") await assetsDynamic.reload();
            if (type === "lookup field" && actionType === "create linked table") {
              openOrCreateAdminLinkedTab(name);
            }
          } catch (error) {
            console.error("Error creating field:", error);
            setActionError(resolveErrorMessage(error, "Failed to create field. Please try again."));
          }
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          try {
            // Handle base fields - update local config only, no API call
            if (fieldId.startsWith("base-")) {
              setBaseFieldNames((prev) => ({
                ...prev,
                [tableConfigTarget]: {
                  ...(prev[tableConfigTarget] || {}),
                  [fieldId]: name
                }
              }));
              return;
            }
            const defs =
              tableConfigTarget === "users"
                ? usersDynamic.definitions
                : tableConfigTarget === "customers"
                  ? customersDynamic.definitions
                  : tableConfigTarget === "products"
                    ? productsDynamic.definitions
                    : assetsDynamic.definitions;
            const existing = defs.find((item) => item.id === fieldId);
            if (!existing) return;
            await fieldService.updateDefinition(fieldId, {
              ...existing,
              name,
              fieldType: type,
              linkToFieldId: linkToFieldId || null,
              actionType: actionType || null
            });
            if (tableConfigTarget === "users") await usersDynamic.reload();
            if (tableConfigTarget === "customers") await customersDynamic.reload();
            if (tableConfigTarget === "products") await productsDynamic.reload();
            if (tableConfigTarget === "assets") await assetsDynamic.reload();
            if (type === "lookup field" && actionType === "create linked table") {
              openOrCreateAdminLinkedTab(name);
            }
          } catch (error) {
            console.error("Error editing field:", error);
            setActionError(resolveErrorMessage(error, "Failed to edit field. Please try again."));
          }
        }}
        onDeleteField={async (fieldId) => {
          try {
            // Skip API calls for base fields - they can't be deleted
            if (fieldId.startsWith("base-")) return;
            await fieldService.deleteDefinition(fieldId);
            if (tableConfigTarget === "users") await usersDynamic.reload();
            if (tableConfigTarget === "customers") await customersDynamic.reload();
            if (tableConfigTarget === "products") await productsDynamic.reload();
            if (tableConfigTarget === "assets") await assetsDynamic.reload();
          } catch (error) {
            console.error("Error deleting field:", error);
            setActionError(resolveErrorMessage(error, "Failed to delete field. Please try again."));
          }
        }}
      />

      <TableConfigDialog
        open={customTableConfigOpen}
        onClose={() => {
          setCustomTableConfigOpen(false);
          setCustomTableConfigTabId(null);
        }}
        title={
          customTableConfigTabId
            ? `Table configuration: ${adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.label || "Custom"}`
            : "Table configuration"
        }
        availableFields={
          customTableConfigTabId
            ? allFieldDefinitions.definitions
                .filter(
                  (field) =>
                    !(adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.fieldIds || []).includes(
                      field.id
                    )
                )
                  .map((field) => ({
                    id: field.id,
                    name: field.name,
                    fieldType: field.fieldType,
                    linkToFieldId: field.linkToFieldId,
                    actionType: field.actionType
                  }))
            : []
        }
          fields={
            customTableConfigTabId
              ? [
                  ...(
                    adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.columns ||
                    defaultCustomColumns
                  ).map((name) => ({ id: `default:${name}`, name, type: getDefaultColumnType(name) })),
                  ...allFieldDefinitions.definitions
                    .filter(
                      (field) =>
                      (adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.fieldIds || []).includes(
                        field.id
                      )
                  )
                  .map((field) => ({ id: field.id, name: field.name, type: field.fieldType }))
              ]
            : []
        }
        config={customTableConfigTabId ? customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] } : { order: [], hidden: [] }}
        onChange={(next) => {
          if (!customTableConfigTabId) return;
          setCustomTabConfigs((prev) => ({ ...prev, [customTableConfigTabId]: next }));
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId ? { ...tabItem, config: next } : tabItem
            )
          );
        }}
        onAddField={async (fieldId) => {
          if (!customTableConfigTabId) return;
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes(customTableConfigTabId)
            ? existing.tables
            : [...existing.tables, customTableConfigTabId];
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId
                ? {
                    ...tabItem,
                    fieldIds: [...(tabItem.fieldIds || []), fieldId],
                    config: customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] }
                  }
                : tabItem
            )
          );
          setAdminTabRows((prev) => ({
            ...prev,
            [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => ({
              ...row,
              [fieldId]: row[fieldId] ?? ""
            }))
          }));
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          if (!customTableConfigTabId) return;
          const created = await fieldService.createDefinition({
            id: "",
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null,
            tables: [],
            sortOrder: allFieldDefinitions.definitions.length + 1,
            isActive: true
          });
          await allFieldDefinitions.reload();
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId
                ? {
                    ...tabItem,
                    fieldIds: [...(tabItem.fieldIds || []), created.id],
                    config: customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] }
                  }
                : tabItem
            )
          );
          setAdminTabRows((prev) => ({
            ...prev,
            [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => ({
              ...row,
              [created.id]: row[created.id] ?? ""
            }))
          }));
          if (type === "lookup field" && actionType === "create linked table") {
            openOrCreateAdminLinkedTab(name);
          }
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          try {
            if (!customTableConfigTabId) return;
            if (fieldId.startsWith("default:")) {
              const oldName = fieldId.replace("default:", "");
              const nextName = name.trim() || oldName;
              setAdminTabsConfig((prev) =>
                prev.map((tabItem) =>
                  tabItem.id === customTableConfigTabId
                    ? {
                        ...tabItem,
                        columns: (tabItem.columns || []).map((col) => (col === oldName ? nextName : col)),
                        config: {
                          order: (customTabConfigs[customTableConfigTabId]?.order || []).map((id) =>
                            id === fieldId ? `default:${nextName}` : id
                          ),
                          hidden: (customTabConfigs[customTableConfigTabId]?.hidden || []).map((id) =>
                            id === fieldId ? `default:${nextName}` : id
                          )
                        }
                      }
                    : tabItem
                )
              );
              setAdminTabRows((prev) => ({
                ...prev,
                [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => {
                  const nextRow = { ...row };
                  nextRow[nextName] = nextRow[oldName] ?? "";
                  delete nextRow[oldName];
                  return nextRow;
                })
              }));
              setCustomTabConfigs((prev) => ({
                ...prev,
                [customTableConfigTabId]: {
                  order: (prev[customTableConfigTabId]?.order || []).map((id) =>
                    id === fieldId ? `default:${nextName}` : id
                  ),
                  hidden: (prev[customTableConfigTabId]?.hidden || []).map((id) =>
                    id === fieldId ? `default:${nextName}` : id
                  )
                }
              }));
              return;
            }
            const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
            if (!existing) return;
            await fieldService.updateDefinition(fieldId, {
              ...existing,
              name,
              fieldType: type,
              linkToFieldId: linkToFieldId || null,
              actionType: actionType || null
            });
            await allFieldDefinitions.reload();
            if (type === "lookup field" && actionType === "create linked table") {
              openOrCreateAdminLinkedTab(name);
            }
          } catch (error) {
            console.error("Error editing field:", error);
            setActionError(resolveErrorMessage(error, "Failed to edit field. Please try again."));
          }
        }}
        onDeleteField={async (fieldId) => {
          try {
            if (!customTableConfigTabId) return;
            if (fieldId.startsWith("default:")) {
              const name = fieldId.replace("default:", "");
              setAdminTabsConfig((prev) =>
                prev.map((tabItem) =>
                  tabItem.id === customTableConfigTabId
                    ? { ...tabItem, columns: (tabItem.columns || []).filter((col) => col !== name) }
                    : tabItem
                )
              );
              setAdminTabRows((prev) => ({
                ...prev,
                [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => {
                  const nextRow = { ...row };
                  delete nextRow[name];
                  return nextRow;
                })
              }));
              setCustomTabConfigs((prev) => ({
                ...prev,
                [customTableConfigTabId]: {
                  order: (prev[customTableConfigTabId]?.order || []).filter((id) => id !== fieldId),
                  hidden: (prev[customTableConfigTabId]?.hidden || []).filter((id) => id !== fieldId)
                }
              }));
              return;
            }
            setAdminTabsConfig((prev) =>
              prev.map((tabItem) =>
                tabItem.id === customTableConfigTabId
                  ? {
                      ...tabItem,
                      fieldIds: (tabItem.fieldIds || []).filter((id) => id !== fieldId),
                      config: {
                        order: (customTabConfigs[customTableConfigTabId]?.order || []).filter((id) => id !== fieldId),
                        hidden: (customTabConfigs[customTableConfigTabId]?.hidden || []).filter((id) => id !== fieldId)
                      }
                    }
                  : tabItem
              )
            );
            setCustomTabConfigs((prev) => ({
              ...prev,
              [customTableConfigTabId]: {
                order: (prev[customTableConfigTabId]?.order || []).filter((id) => id !== fieldId),
                hidden: (prev[customTableConfigTabId]?.hidden || []).filter((id) => id !== fieldId)
              }
            }));
            setAdminTabRows((prev) => ({
              ...prev,
              [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => {
                const nextRow = { ...row };
                delete nextRow[fieldId];
                return nextRow;
              })
            }));
          } catch (error) {
            console.error("Error deleting field:", error);
            setActionError(resolveErrorMessage(error, "Failed to delete field. Please try again."));
          }
        }}
      />

      <Dialog open={customerOpen} onClose={() => setCustomerOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add customer</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <FormControl>
              <Typography variant="caption" color="text.secondary">
                Customer name
              </Typography>
              <TextField
                value={customerForm.name}
                onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </FormControl>
            <FormControl>
              <Typography variant="caption" color="text.secondary">
                Customer ID
              </Typography>
              <TextField
                value={customerForm.customerId}
                onChange={(event) => setCustomerForm((prev) => ({ ...prev, customerId: event.target.value }))}
              />
            </FormControl>
            <FormControl>
              <Typography variant="caption" color="text.secondary">
                Office
              </Typography>
              <Select
                value={customerForm.office}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, office: event.target.value as Customer["office"] }))
                }
                displayEmpty
              >
                <MenuItem value="">Select office</MenuItem>
                {offices.map((office) => (
                  <MenuItem key={office} value={office}>
                    {office}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DynamicFieldsForm
              definitions={orderedCustomersDefinitions}
              values={customerDynamicValues}
              onChange={setCustomerDynamicValues}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setCustomerOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreateCustomer}>
            Save customer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={productOpen} onClose={() => setProductOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add product</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Product name"
              value={productForm.name}
              onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextField
              label="Description (optional)"
              value={productForm.description}
              onChange={(event) => setProductForm((prev) => ({ ...prev, description: event.target.value }))}
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setAdminSettingsOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <TableConfigDialog
        open={tableConfigOpen}
        onClose={() => setTableConfigOpen(false)}
        title={`Table configuration: ${tableConfigTarget}`}
        availableFields={availableFieldsForAdminTable.map((field) => ({
          id: field.id,
          name: field.name,
          fieldType: field.fieldType,
          linkToFieldId: field.linkToFieldId,
          actionType: field.actionType
        }))}
        fields={
          tableConfigTarget === "users"
            ? usersTableConfig.orderedFields
            : tableConfigTarget === "products"
              ? productsTableConfig.orderedFields
              : assetsTableConfig.orderedFields
        }
        config={
          tableConfigTarget === "users"
            ? usersTableConfig.config
            : tableConfigTarget === "products"
              ? productsTableConfig.config
              : assetsTableConfig.config
        }
        onChange={(next) => {
          if (tableConfigTarget === "users") usersTableConfig.setConfig(next);
          if (tableConfigTarget === "products") productsTableConfig.setConfig(next);
          if (tableConfigTarget === "assets") assetsTableConfig.setConfig(next);
        }}
        onAddField={async (fieldId) => {
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes(tableConfigTarget)
            ? existing.tables
            : [...existing.tables, tableConfigTarget];
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          if (tableConfigTarget === "users") await usersDynamic.reload();
          if (tableConfigTarget === "products") await productsDynamic.reload();
          if (tableConfigTarget === "assets") await assetsDynamic.reload();
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          await fieldService.createDefinition({
            id: "",
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null,
            tables: [tableConfigTarget],
            sortOrder: allFieldDefinitions.definitions.length + 1,
            isActive: true
          });
          await allFieldDefinitions.reload();
          if (tableConfigTarget === "users") await usersDynamic.reload();
          if (tableConfigTarget === "products") await productsDynamic.reload();
          if (tableConfigTarget === "assets") await assetsDynamic.reload();
          if (type === "lookup field" && actionType === "create linked table") {
            openOrCreateAdminLinkedTab(name);
          }
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          try {
            // Handle base fields - update local config only, no API call
            if (fieldId.startsWith("base-")) {
              setBaseFieldNames((prev) => ({
                ...prev,
                [tableConfigTarget]: {
                  ...(prev[tableConfigTarget] || {}),
                  [fieldId]: name
                }
              }));
              return;
            }
            const defs =
              tableConfigTarget === "users"
                ? usersDynamic.definitions
                : tableConfigTarget === "products"
                  ? productsDynamic.definitions
                  : assetsDynamic.definitions;
            const existing = defs.find((item) => item.id === fieldId);
            if (!existing) return;
            await fieldService.updateDefinition(fieldId, {
              ...existing,
              name,
              fieldType: type,
              linkToFieldId: linkToFieldId || null,
              actionType: actionType || null
            });
            if (tableConfigTarget === "users") await usersDynamic.reload();
            if (tableConfigTarget === "products") await productsDynamic.reload();
            if (tableConfigTarget === "assets") await assetsDynamic.reload();
            if (type === "lookup field" && actionType === "create linked table") {
              openOrCreateAdminLinkedTab(name);
            }
          } catch (error) {
            console.error("Error editing field:", error);
            setActionError(resolveErrorMessage(error, "Failed to edit field. Please try again."));
          }
        }}
        onDeleteField={async (fieldId) => {
          try {
            // Skip API calls for base fields - they can't be deleted
            if (fieldId.startsWith("base-")) return;
            await fieldService.deleteDefinition(fieldId);
            if (tableConfigTarget === "users") await usersDynamic.reload();
            if (tableConfigTarget === "products") await productsDynamic.reload();
            if (tableConfigTarget === "assets") await assetsDynamic.reload();
          } catch (error) {
            console.error("Error deleting field:", error);
            setActionError(resolveErrorMessage(error, "Failed to delete field. Please try again."));
          }
        }}
      />

      <TableConfigDialog
        open={customTableConfigOpen}
        onClose={() => {
          setCustomTableConfigOpen(false);
          setCustomTableConfigTabId(null);
        }}
        title={
          customTableConfigTabId
            ? `Table configuration: ${adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.label || "Custom"}`
            : "Table configuration"
        }
        availableFields={
          customTableConfigTabId
            ? allFieldDefinitions.definitions
                .filter(
                  (field) =>
                    !(adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.fieldIds || []).includes(
                      field.id
                    )
                )
                  .map((field) => ({
                    id: field.id,
                    name: field.name,
                    fieldType: field.fieldType,
                    linkToFieldId: field.linkToFieldId,
                    actionType: field.actionType
                  }))
            : []
        }
          fields={
            customTableConfigTabId
              ? [
                  ...(
                    adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.columns ||
                    defaultCustomColumns
                  ).map((name) => ({ id: `default:${name}`, name, type: getDefaultColumnType(name) })),
                  ...allFieldDefinitions.definitions
                    .filter(
                      (field) =>
                      (adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.fieldIds || []).includes(
                        field.id
                      )
                  )
                  .map((field) => ({ id: field.id, name: field.name, type: field.fieldType }))
              ]
            : []
        }
        config={customTableConfigTabId ? customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] } : { order: [], hidden: [] }}
        onChange={(next) => {
          if (!customTableConfigTabId) return;
          setCustomTabConfigs((prev) => ({ ...prev, [customTableConfigTabId]: next }));
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId ? { ...tabItem, config: next } : tabItem
            )
          );
        }}
        onAddField={async (fieldId) => {
          if (!customTableConfigTabId) return;
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes(customTableConfigTabId)
            ? existing.tables
            : [...existing.tables, customTableConfigTabId];
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId
                ? {
                    ...tabItem,
                    fieldIds: [...(tabItem.fieldIds || []), fieldId],
                    config: customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] }
                  }
                : tabItem
            )
          );
          setAdminTabRows((prev) => ({
            ...prev,
            [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => ({
              ...row,
              [fieldId]: row[fieldId] ?? ""
            }))
          }));
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          if (!customTableConfigTabId) return;
          const created = await fieldService.createDefinition({
            id: "",
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null,
            tables: [],
            sortOrder: allFieldDefinitions.definitions.length + 1,
            isActive: true
          });
          await allFieldDefinitions.reload();
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId
                ? {
                    ...tabItem,
                    fieldIds: [...(tabItem.fieldIds || []), created.id],
                    config: customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] }
                  }
                : tabItem
            )
          );
          setAdminTabRows((prev) => ({
            ...prev,
            [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => ({
              ...row,
              [created.id]: row[created.id] ?? ""
            }))
          }));
          if (type === "lookup field" && actionType === "create linked table") {
            openOrCreateAdminLinkedTab(name);
          }
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          if (!customTableConfigTabId) return;
          if (fieldId.startsWith("default:")) {
            const oldName = fieldId.replace("default:", "");
            const nextName = name.trim() || oldName;
            setAdminTabsConfig((prev) =>
              prev.map((tabItem) =>
                tabItem.id === customTableConfigTabId
                  ? {
                      ...tabItem,
                      columns: (tabItem.columns || []).map((col) => (col === oldName ? nextName : col)),
                      config: {
                        order: (customTabConfigs[customTableConfigTabId]?.order || []).map((id) =>
                          id === fieldId ? `default:${nextName}` : id
                        ),
                        hidden: (customTabConfigs[customTableConfigTabId]?.hidden || []).map((id) =>
                          id === fieldId ? `default:${nextName}` : id
                        )
                      }
                    }
                  : tabItem
              )
            );
            setAdminTabRows((prev) => ({
              ...prev,
              [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => {
                const { [oldName]: oldValue, ...rest } = row;
                return { ...rest, [nextName]: oldValue ?? "" };
              })
            }));
          }
        }}
        onDeleteField={async (fieldId) => {
          // Delete field implementation would go here
        }}
      />

      <TableConfigDialog
        open={tableConfigOpen}
        onClose={() => setTableConfigOpen(false)}
        title={`Table configuration: ${tableConfigTarget}`}
        availableFields={availableFieldsForAdminTable.map((field) => ({
          id: field.id,
          name: field.name,
          fieldType: field.fieldType,
          linkToFieldId: field.linkToFieldId,
          actionType: field.actionType
        }))}
        fields={
          tableConfigTarget === "users"
            ? usersTableConfig.orderedFields
            : tableConfigTarget === "customers"
              ? customersTableConfig.orderedFields
              : tableConfigTarget === "products"
                ? productsTableConfig.orderedFields
                : assetsTableConfig.orderedFields
        }
        config={
          tableConfigTarget === "users"
            ? usersTableConfig.config
            : tableConfigTarget === "customers"
              ? customersTableConfig.config
              : tableConfigTarget === "products"
                ? productsTableConfig.config
                : assetsTableConfig.config
        }
        onChange={(next) => {
          if (tableConfigTarget === "users") usersTableConfig.setConfig(next);
          if (tableConfigTarget === "customers") customersTableConfig.setConfig(next);
          if (tableConfigTarget === "products") productsTableConfig.setConfig(next);
          if (tableConfigTarget === "assets") assetsTableConfig.setConfig(next);
        }}
        onAddField={async (fieldId) => {
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes(tableConfigTarget)
            ? existing.tables
            : [...existing.tables, tableConfigTarget];
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          if (tableConfigTarget === "users") await usersDynamic.reload();
          if (tableConfigTarget === "customers") await customersDynamic.reload();
          if (tableConfigTarget === "products") await productsDynamic.reload();
          if (tableConfigTarget === "assets") await assetsDynamic.reload();
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          try {
            await fieldService.createDefinition({
              id: "",
              name,
              fieldType: type,
              linkToFieldId: linkToFieldId || null,
              actionType: actionType || null,
              tables: [tableConfigTarget],
              sortOrder: allFieldDefinitions.definitions.length + 1,
              isActive: true
            });
            await allFieldDefinitions.reload();
            if (tableConfigTarget === "users") await usersDynamic.reload();
            if (tableConfigTarget === "customers") await customersDynamic.reload();
            if (tableConfigTarget === "products") await productsDynamic.reload();
            if (tableConfigTarget === "assets") await assetsDynamic.reload();
            if (type === "lookup field" && actionType === "create linked table") {
              openOrCreateAdminLinkedTab(name);
            }
          } catch (error) {
            console.error("Error creating field:", error);
            setActionError(resolveErrorMessage(error, "Failed to create field. Please try again."));
          }
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          try {
            // Handle base fields - update local config only, no API call
            if (fieldId.startsWith("base-")) {
              setBaseFieldNames((prev) => ({
                ...prev,
                [tableConfigTarget]: {
                  ...(prev[tableConfigTarget] || {}),
                  [fieldId]: name
                }
              }));
              return;
            }
            const defs =
              tableConfigTarget === "users"
                ? usersDynamic.definitions
                : tableConfigTarget === "customers"
                  ? customersDynamic.definitions
                  : tableConfigTarget === "products"
                    ? productsDynamic.definitions
                    : assetsDynamic.definitions;
            const existing = defs.find((item) => item.id === fieldId);
            if (!existing) return;
            await fieldService.updateDefinition(fieldId, {
              ...existing,
              name,
              fieldType: type,
              linkToFieldId: linkToFieldId || null,
              actionType: actionType || null
            });
            if (tableConfigTarget === "users") await usersDynamic.reload();
            if (tableConfigTarget === "customers") await customersDynamic.reload();
            if (tableConfigTarget === "products") await productsDynamic.reload();
            if (tableConfigTarget === "assets") await assetsDynamic.reload();
            if (type === "lookup field" && actionType === "create linked table") {
              openOrCreateAdminLinkedTab(name);
            }
          } catch (error) {
            console.error("Error editing field:", error);
            setActionError(resolveErrorMessage(error, "Failed to edit field. Please try again."));
          }
        }}
        onDeleteField={async (fieldId) => {
          try {
            // Skip API calls for base fields - they can't be deleted
            if (fieldId.startsWith("base-")) return;
            await fieldService.deleteDefinition(fieldId);
            if (tableConfigTarget === "users") await usersDynamic.reload();
            if (tableConfigTarget === "customers") await customersDynamic.reload();
            if (tableConfigTarget === "products") await productsDynamic.reload();
            if (tableConfigTarget === "assets") await assetsDynamic.reload();
          } catch (error) {
            console.error("Error deleting field:", error);
            setActionError(resolveErrorMessage(error, "Failed to delete field. Please try again."));
          }
        }}
      />

      <TableConfigDialog
        open={customTableConfigOpen}
        onClose={() => {
          setCustomTableConfigOpen(false);
          setCustomTableConfigTabId(null);
        }}
        title={
          customTableConfigTabId
            ? `Table configuration: ${adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.label || "Custom"}`
            : "Table configuration"
        }
        availableFields={
          customTableConfigTabId
            ? allFieldDefinitions.definitions
                .filter(
                  (field) =>
                    !(adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.fieldIds || []).includes(
                      field.id
                    )
                )
                  .map((field) => ({
                    id: field.id,
                    name: field.name,
                    fieldType: field.fieldType,
                    linkToFieldId: field.linkToFieldId,
                    actionType: field.actionType
                  }))
            : []
        }
          fields={
            customTableConfigTabId
              ? [
                  ...(
                    adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.columns ||
                    defaultCustomColumns
                  ).map((name) => ({ id: `default:${name}`, name, type: getDefaultColumnType(name) })),
                  ...allFieldDefinitions.definitions
                    .filter(
                      (field) =>
                      (adminTabsConfig.find((tabItem) => tabItem.id === customTableConfigTabId)?.fieldIds || []).includes(
                        field.id
                      )
                  )
                  .map((field) => ({ id: field.id, name: field.name, type: field.fieldType }))
              ]
            : []
        }
        config={customTableConfigTabId ? customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] } : { order: [], hidden: [] }}
        onChange={(next) => {
          if (!customTableConfigTabId) return;
          setCustomTabConfigs((prev) => ({ ...prev, [customTableConfigTabId]: next }));
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId ? { ...tabItem, config: next } : tabItem
            )
          );
        }}
        onAddField={async (fieldId) => {
          if (!customTableConfigTabId) return;
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes(customTableConfigTabId)
            ? existing.tables
            : [...existing.tables, customTableConfigTabId];
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId
                ? {
                    ...tabItem,
                    fieldIds: [...(tabItem.fieldIds || []), fieldId],
                    config: customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] }
                  }
                : tabItem
            )
          );
          setAdminTabRows((prev) => ({
            ...prev,
            [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => ({
              ...row,
              [fieldId]: row[fieldId] ?? ""
            }))
          }));
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          if (!customTableConfigTabId) return;
          const created = await fieldService.createDefinition({
            id: "",
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null,
            tables: [],
            sortOrder: allFieldDefinitions.definitions.length + 1,
            isActive: true
          });
          await allFieldDefinitions.reload();
          setAdminTabsConfig((prev) =>
            prev.map((tabItem) =>
              tabItem.id === customTableConfigTabId
                ? {
                    ...tabItem,
                    fieldIds: [...(tabItem.fieldIds || []), created.id],
                    config: customTabConfigs[customTableConfigTabId] || { order: [], hidden: [] }
                  }
                : tabItem
            )
          );
          setAdminTabRows((prev) => ({
            ...prev,
            [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => ({
              ...row,
              [created.id]: row[created.id] ?? ""
            }))
          }));
          if (type === "lookup field" && actionType === "create linked table") {
            openOrCreateAdminLinkedTab(name);
          }
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          try {
            if (!customTableConfigTabId) return;
            if (fieldId.startsWith("default:")) {
              const oldName = fieldId.replace("default:", "");
              const nextName = name.trim() || oldName;
              setAdminTabsConfig((prev) =>
                prev.map((tabItem) =>
                  tabItem.id === customTableConfigTabId
                    ? {
                        ...tabItem,
                        columns: (tabItem.columns || []).map((col) => (col === oldName ? nextName : col)),
                        config: {
                          order: (customTabConfigs[customTableConfigTabId]?.order || []).map((id) =>
                            id === fieldId ? `default:${nextName}` : id
                          ),
                          hidden: (customTabConfigs[customTableConfigTabId]?.hidden || []).map((id) =>
                            id === fieldId ? `default:${nextName}` : id
                          )
                        }
                      }
                    : tabItem
                )
              );
              setAdminTabRows((prev) => ({
                ...prev,
                [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => {
                  const nextRow = { ...row };
                  nextRow[nextName] = nextRow[oldName] ?? "";
                  delete nextRow[oldName];
                  return nextRow;
                })
              }));
              setCustomTabConfigs((prev) => ({
                ...prev,
                [customTableConfigTabId]: {
                  order: (prev[customTableConfigTabId]?.order || []).map((id) =>
                    id === fieldId ? `default:${nextName}` : id
                  ),
                  hidden: (prev[customTableConfigTabId]?.hidden || []).map((id) =>
                    id === fieldId ? `default:${nextName}` : id
                  )
                }
              }));
              return;
            }
            const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
            if (!existing) return;
            await fieldService.updateDefinition(fieldId, {
              ...existing,
              name,
              fieldType: type,
              linkToFieldId: linkToFieldId || null,
              actionType: actionType || null
            });
            await allFieldDefinitions.reload();
            if (type === "lookup field" && actionType === "create linked table") {
              openOrCreateAdminLinkedTab(name);
            }
          } catch (error) {
            console.error("Error editing field:", error);
            setActionError(resolveErrorMessage(error, "Failed to edit field. Please try again."));
          }
        }}
        onDeleteField={async (fieldId) => {
          try {
            if (!customTableConfigTabId) return;
            if (fieldId.startsWith("default:")) {
              const name = fieldId.replace("default:", "");
              setAdminTabsConfig((prev) =>
                prev.map((tabItem) =>
                  tabItem.id === customTableConfigTabId
                    ? { ...tabItem, columns: (tabItem.columns || []).filter((col) => col !== name) }
                    : tabItem
                )
              );
              setAdminTabRows((prev) => ({
                ...prev,
                [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => {
                  const nextRow = { ...row };
                  delete nextRow[name];
                  return nextRow;
                })
              }));
              setCustomTabConfigs((prev) => ({
                ...prev,
                [customTableConfigTabId]: {
                  order: (prev[customTableConfigTabId]?.order || []).filter((id) => id !== fieldId),
                  hidden: (prev[customTableConfigTabId]?.hidden || []).filter((id) => id !== fieldId)
                }
              }));
              return;
            }
            setAdminTabsConfig((prev) =>
              prev.map((tabItem) =>
                tabItem.id === customTableConfigTabId
                  ? {
                      ...tabItem,
                      fieldIds: (tabItem.fieldIds || []).filter((id) => id !== fieldId),
                      config: {
                        order: (customTabConfigs[customTableConfigTabId]?.order || []).filter((id) => id !== fieldId),
                        hidden: (customTabConfigs[customTableConfigTabId]?.hidden || []).filter((id) => id !== fieldId)
                      }
                    }
                  : tabItem
              )
            );
            setCustomTabConfigs((prev) => ({
              ...prev,
              [customTableConfigTabId]: {
                order: (prev[customTableConfigTabId]?.order || []).filter((id) => id !== fieldId),
                hidden: (prev[customTableConfigTabId]?.hidden || []).filter((id) => id !== fieldId)
              }
            }));
            setAdminTabRows((prev) => ({
              ...prev,
              [customTableConfigTabId]: (prev[customTableConfigTabId] || []).map((row) => {
                const nextRow = { ...row };
                delete nextRow[fieldId];
                return nextRow;
              })
            }));
          } catch (error) {
            console.error("Error deleting field:", error);
            setActionError(resolveErrorMessage(error, "Failed to delete field. Please try again."));
          }
        }}
      />

      <Dialog open={customerOpen} onClose={() => setCustomerOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add customer</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <FormControl>
              <Typography variant="caption" color="text.secondary">
                Customer name
              </Typography>
              <TextField
                value={customerForm.name}
                onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </FormControl>
            <FormControl>
              <Typography variant="caption" color="text.secondary">
                Customer ID
              </Typography>
              <TextField
                value={customerForm.customerId}
                onChange={(event) => setCustomerForm((prev) => ({ ...prev, customerId: event.target.value }))}
              />
            </FormControl>
            <FormControl>
              <Typography variant="caption" color="text.secondary">
                Office
              </Typography>
              <Select
                value={customerForm.office}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, office: event.target.value as Customer["office"] }))
                }
                displayEmpty
              >
                <MenuItem value="">Select office</MenuItem>
                {offices.map((office) => (
                  <MenuItem key={office} value={office}>
                    {office}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DynamicFieldsForm
              definitions={orderedCustomersDefinitions}
              values={customerDynamicValues}
              onChange={setCustomerDynamicValues}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setCustomerOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreateCustomer}>
            Save customer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={productOpen} onClose={() => setProductOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add product</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label={baseFieldNames.products?.["base-name"] || "Product name"}
              value={productForm.name}
              onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextField
              label={`${baseFieldNames.products?.["base-description"] || "Description"} (optional)`}
              value={productForm.description}
              onChange={(event) => setProductForm((prev) => ({ ...prev, description: event.target.value }))}
              multiline
              rows={2}
            />
            <DynamicFieldsForm
              definitions={orderedProductsDefinitions}
              values={productDynamicValues}
              onChange={setProductDynamicValues}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setProductOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreateProduct} disabled={!productForm.name.trim()}>
            Save product
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editUserOpen} onClose={() => setEditUserOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Full name"
              value={editUserForm.fullName}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, fullName: event.target.value }))}
            />
            <TextField
              label="Email"
              type="email"
              value={editUserForm.email}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <FormControl>
              <Select
                value={editUserForm.role}
                onChange={(event) =>
                  setEditUserForm((prev) => ({ ...prev, role: event.target.value as UserRole }))
                }
              >
                {roles.map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <Select
                value={editUserForm.office}
                onChange={(event) =>
                  setEditUserForm((prev) => ({ ...prev, office: event.target.value as User["office"] }))
                }
              >
                {offices.filter((office) => office !== "All").map((office) => (
                  <MenuItem key={office} value={office}>
                    {office}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DynamicFieldsForm
              definitions={orderedUsersDefinitions}
              values={editUserDynamicValues}
              onChange={setEditUserDynamicValues}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEditUserOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveUser} disabled={!editUserForm.fullName.trim()}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editCustomerOpen} onClose={() => setEditCustomerOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit customer</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Customer name"
              value={editCustomerForm.name}
              onChange={(event) => setEditCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextField
              label="Customer ID"
              value={editCustomerForm.customerId}
              onChange={(event) => setEditCustomerForm((prev) => ({ ...prev, customerId: event.target.value }))}
            />
            <FormControl>
              <Select
                value={editCustomerForm.office}
                onChange={(event) =>
                  setEditCustomerForm((prev) => ({ ...prev, office: event.target.value as Customer["office"] }))
                }
              >
                {offices.map((office) => (
                  <MenuItem key={office} value={office}>
                    {office}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DynamicFieldsForm
              definitions={orderedCustomersDefinitions}
              values={editCustomerDynamicValues}
              onChange={setEditCustomerDynamicValues}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEditCustomerOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveCustomer} disabled={!editCustomerForm.name.trim()}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editProductOpen} onClose={() => setEditProductOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit product</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label={baseFieldNames.products?.["base-name"] || "Product name"}
              value={editProductForm.name}
              onChange={(event) => setEditProductForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextField
              label={`${baseFieldNames.products?.["base-description"] || "Description"} (optional)`}
              value={editProductForm.description}
              onChange={(event) => setEditProductForm((prev) => ({ ...prev, description: event.target.value }))}
              multiline
              rows={2}
            />
            <DynamicFieldsForm
              definitions={orderedProductsDefinitions}
              values={editProductDynamicValues}
              onChange={setEditProductDynamicValues}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEditProductOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveProduct} disabled={!editProductForm.name.trim()}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={assetOpen}
        onClose={() => {
          setAssetOpen(false);
          setEditingAssetId(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingAssetId ? "Edit asset" : "Create asset"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label={baseFieldNames.assets?.["base-machineType"] || "Machine Type"}
              value={assetForm.machineType}
              onChange={(event) => setAssetForm((prev) => ({ ...prev, machineType: event.target.value }))}
            />
            <TextField
              label={baseFieldNames.assets?.["base-machineId"] || "Machine ID"}
              value={assetForm.machineId}
              onChange={(event) => setAssetForm((prev) => ({ ...prev, machineId: event.target.value }))}
            />
            <TextField
              label={baseFieldNames.assets?.["base-serialNumber"] || "Serial Number"}
              value={assetForm.serialNumber}
              onChange={(event) => setAssetForm((prev) => ({ ...prev, serialNumber: event.target.value }))}
            />
            <FormControl fullWidth>
              <InputLabel>{baseFieldNames.assets?.["base-pmCount"] || "PM Count"}</InputLabel>
              <Select
                label={baseFieldNames.assets?.["base-pmCount"] || "PM Count"}
                value={assetForm.pmCount}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, pmCount: event.target.value }))}
              >
                {["1", "2", "3", "4", "5"].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={baseFieldNames.assets?.["base-comments"] || "Comments"}
              value={assetForm.comments}
              onChange={(event) => setAssetForm((prev) => ({ ...prev, comments: event.target.value }))}
              multiline
              rows={2}
            />
            <DynamicFieldsForm
              definitions={orderedAssetsDefinitions}
              values={assetDynamicValues}
              onChange={setAssetDynamicValues}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setAssetOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const targetId = editingAssetId || crypto.randomUUID();
              setAssets((prev) => {
                if (editingAssetId) {
                  return prev.map((item) =>
                    item.id === editingAssetId ? { ...item, ...assetForm } : item
                  );
                }
                const nextSeq = prev.length ? Math.max(...prev.map((item) => item.seq)) + 1 : 1;
                return [
                  {
                    id: targetId,
                    seq: nextSeq,
                    ...assetForm
                  },
                  ...prev
                ];
              });
              assetsDynamic.upsertForEntity(
                targetId,
                assetDynamicValues,
                assetsDynamic.valuesByEntity[targetId]
              );
              setAssetForm({
                machineType: "",
                machineId: "",
                serialNumber: "",
                pmCount: "1",
                comments: ""
              });
              setAssetDynamicValues({});
              setEditingAssetId(null);
              setAssetOpen(false);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

        <Menu
          anchorEl={adminSettingsMenu}
          open={adminSettingsMenuOpen}
          onClose={() => setAdminSettingsMenuOpen(false)}
        >
        {adminTabsConfig[tab]?.type !== "customers" && (
          <MenuItem
            onClick={() => {
              setAdminSettingsMenuOpen(false);
              const selected = adminTabsConfig[tab];
              if (!selected) return;
              if (selected.type === "custom") {
                setCustomTableConfigTabId(selected.id);
                setCustomTableConfigOpen(true);
                return;
              }
              if (selected.type === "users") setTableConfigTarget("users");
              if (selected.type === "products") setTableConfigTarget("products");
              if (selected.type === "assets") setTableConfigTarget("assets");
              setTableConfigOpen(true);
            }}
          >
            Table configuration
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setAdminSettingsMenuOpen(false);
            const selected = adminTabsConfig[tab];
            if (!selected) return;
            if (selected.type === "users") {
              setInviteOpen(true);
              return;
            }
            if (selected.type === "customers") {
              setCustomerOpen(true);
              return;
            }
            if (selected.type === "products") {
              setProductOpen(true);
              return;
            }
            if (selected.type === "assets") {
              setEditingAssetId(null);
              setAssetForm({
                machineType: "",
                machineId: "",
                serialNumber: "",
                pmCount: "1",
                comments: ""
              });
              setAssetDynamicValues({});
              setAssetOpen(true);
              return;
            }
              if (selected.type === "custom") {
                const tabItem = selected;
                const columns =
                  tabItem.columns && tabItem.columns.length > 0 ? tabItem.columns : defaultCustomColumns;
                const tabFieldIds = tabItem.fieldIds || [];
                const nextForm: Record<string, string> = {};
                const baseDefaults = createDefaultCustomRow((adminTabRows[tabItem.id] || []).length + 1);
                columns.forEach((name) => {
                  nextForm[`default:${name}`] = (baseDefaults as Record<string, string>)[name] ?? "";
                });
                tabFieldIds.forEach((fieldId) => {
                  nextForm[fieldId] = "";
                });
                setCustomRowForm(nextForm);
                setCustomRowDialogTabId(tabItem.id);
                setCustomRowDialogIndex(null);
                setCustomRowDialogOpen(true);
                return;
              }
            if (selected.type === "roles") {
              openRoleDialog();
            }
          }}
        >
          Add/Create/Invite
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAdminSettingsMenuOpen(false);
            setAdminTabManagerOpen(true);
          }}
        >
          Admin Tabs Manager
        </MenuItem>
      </Menu>

      <Dialog
        open={adminTabManagerOpen}
        onClose={() => setAdminTabManagerOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Admin tabs</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Order</TableCell>
                  <TableCell>Tab name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {adminTabsConfig.map((item, index) => (
                  <TableRow
                    key={item.id}
                    draggable
                    onDragStart={() => setAdminTabDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (adminTabDragIndex === null || adminTabDragIndex === index) return;
                      setAdminTabsConfig((prev) => {
                        const next = [...prev];
                        const [moved] = next.splice(adminTabDragIndex, 1);
                        next.splice(index, 0, moved);
                        return next.map((item, position) => ({ ...item, position }));
                      });
                      setAdminTabDragIndex(null);
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        &#x2630;
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={item.label}
                        onChange={(event) => {
                          const value = event.target.value;
                          setAdminTabsConfig((prev) =>
                            prev.map((tabItem) => (tabItem.id === item.id ? { ...tabItem, label: value } : tabItem))
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {item.type === "custom" ? "Custom" : item.type === "users" ? "Users" : item.type === "roles" ? "Roles" : item.type === "customers" ? "Customers" : item.type === "products" ? "Products" : item.type === "assets" ? "Assets" : "Default"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => setAdminTabsConfig((prev) => prev.filter((tabItem) => tabItem.id !== item.id))}
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                label="New tab name"
                size="small"
                value={adminTabDraftName}
                onChange={(event) => setAdminTabDraftName(event.target.value)}
              />
              <Button
                variant="contained"
                onClick={() => {
                  const label = adminTabDraftName.trim() || "New Tab";
                  const newTab = {
                    id: `admin-tab-${Date.now()}`,
                    label,
                    type: "custom",
                    position: adminTabsConfig.length,
                    columns: ["ID", "Name", "Created Date"],
                    fieldIds: [],
                    config: { order: [], hidden: [] }
                  };
                  setAdminTabsConfig((prev) => {
                    const next = [
                      ...prev,
                      { ...newTab, position: prev.length }
                    ];
                    setTab(next.length - 1);
                    return next;
                  });
                  setAdminTabRows((prev) => ({
                    ...prev,
                    [newTab.id]: []
                  }));
                  setAdminTabDraftName("");
                }}
              >
                Create tab
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setAdminTabManagerOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={customRowDialogOpen}
        onClose={() => {
          setCustomRowDialogOpen(false);
          setCustomRowDialogTabId(null);
          setCustomRowDialogIndex(null);
          setCustomRowForm({});
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{customRowDialogIndex !== null ? "Edit row" : "Add row"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            {customRowDialogFields.map((field) => {
              const value = customRowForm[field.id] ?? "";
              const inputType = field.type === "date" ? "date" : "text";
              return (
                <TextField
                  key={field.id}
                  label={field.name}
                  type={inputType}
                  value={value}
                  InputLabelProps={inputType === "date" ? { shrink: true } : undefined}
                  onChange={(event) =>
                    setCustomRowForm((prev) => ({
                      ...prev,
                      [field.id]: event.target.value
                    }))
                  }
                />
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => {
              setCustomRowDialogOpen(false);
              setCustomRowDialogTabId(null);
              setCustomRowDialogIndex(null);
              setCustomRowForm({});
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!customRowDialogTab) return;
              const columns =
                customRowDialogTab.columns && customRowDialogTab.columns.length > 0
                  ? customRowDialogTab.columns
                  : defaultCustomColumns;
              const tabFieldIds = customRowDialogTab.fieldIds || [];
              const nextRow: Record<string, string> = {};
              columns.forEach((name) => {
                nextRow[name] = customRowForm[`default:${name}`] ?? "";
              });
              tabFieldIds.forEach((fieldId) => {
                nextRow[fieldId] = customRowForm[fieldId] ?? "";
              });
              setAdminTabRows((prev) => {
                const current = prev[customRowDialogTab.id] || [];
                if (customRowDialogIndex === null || customRowDialogIndex === undefined) {
                  return {
                    ...prev,
                    [customRowDialogTab.id]: [...current, nextRow]
                  };
                }
                return {
                  ...prev,
                  [customRowDialogTab.id]: current.map((row, index) =>
                    index === customRowDialogIndex ? { ...row, ...nextRow } : row
                  )
                };
              });
              setCustomRowDialogOpen(false);
              setCustomRowDialogTabId(null);
              setCustomRowDialogIndex(null);
              setCustomRowForm({});
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {deleteTarget?.type}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete {deleteTarget?.label}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Logo Upload Dialog */}
      <Dialog
        open={logoUploadDialogOpen}
        onClose={() => setLogoUploadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperComponent={DraggablePaper}
      >
        <DialogTitle>Upload Customer Logo</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {/* Preview - Dynamic size based on settings */}
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2, minHeight: 160 }}>
              {editCustomerLogoShape === 'none' && editCustomerLogo ? (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    maxWidth: '100%',
                    border: '2px dashed',
                    borderColor: 'divider',
                    p: 1,
                  }}
                >
                  <img
                    src={editCustomerLogo}
                    alt="Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: `${150 * (editCustomerPhotoScale / 100)}px`,
                      height: 'auto',
                      width: 'auto',
                      objectFit: 'contain',
                    }}
                  />
                </Box>
              ) : (
                <Box
                  sx={{
                    width: editCustomerLogoShape === 'rectangular' ? editCustomerLogoSize * 2 : editCustomerLogoSize,
                    height: editCustomerLogoSize,
                    borderRadius: editCustomerLogoShape === 'none' ? '0px' : editCustomerLogoShape === 'round' ? '50%' : '8px',
                    background: editCustomerLogo ? 'transparent' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    backgroundImage: editCustomerLogo ? `url(${editCustomerLogo})` : 'none',
                    backgroundSize: `${editCustomerPhotoScale}%`,
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '2rem',
                    border: '2px dashed',
                    borderColor: 'divider',
                  }}
                >
                  {!editCustomerLogo && editCustomerName.charAt(0)}
                </Box>
              )}
            </Box>

            {/* Shape Selector */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Logo Shape</Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  variant={editCustomerLogoShape === 'none' ? 'contained' : 'outlined'}
                  onClick={() => setEditCustomerLogoShape('none')}
                  fullWidth
                  size="small"
                >
                  No Shape
                </Button>
                <Button
                  variant={editCustomerLogoShape === 'round' ? 'contained' : 'outlined'}
                  onClick={() => setEditCustomerLogoShape('round')}
                  fullWidth
                  size="small"
                >
                  Round
                </Button>
                <Button
                  variant={editCustomerLogoShape === 'rectangular' ? 'contained' : 'outlined'}
                  onClick={() => setEditCustomerLogoShape('rectangular')}
                  fullWidth
                  size="small"
                >
                  Rectangular
                </Button>
              </Stack>
              {editCustomerLogoShape === 'rectangular' && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
                  140w × 70h pixels
                </Typography>
              )}
              {editCustomerLogoShape === 'none' && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
                  Photo will display at full size (max 150px height on card)
                </Typography>
              )}
            </Box>

            {/* Logo Size Slider - Only show for round and rectangular */}
            {editCustomerLogoShape !== 'none' && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Logo Size: {editCustomerLogoSize}px {editCustomerLogoShape === 'rectangular' ? '(height)' : ''}
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="caption">40</Typography>
                  <input
                    type="range"
                    min="40"
                    max="120"
                    value={editCustomerLogoSize}
                    onChange={(e) => setEditCustomerLogoSize(Number(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                  <Typography variant="caption">120</Typography>
                </Stack>
              </Box>
            )}

            {/* Photo Scale Slider - Available for all shapes when logo is uploaded */}
            {editCustomerLogo && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Photo Scale: {editCustomerPhotoScale}%
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {editCustomerLogoShape === 'none'
                    ? 'Adjust photo display size'
                    : 'Adjust to fit photo inside logo area'}
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="caption">50</Typography>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={editCustomerPhotoScale}
                    onChange={(e) => setEditCustomerPhotoScale(Number(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                  <Typography variant="caption">200</Typography>
                </Stack>
              </Box>
            )}

            {/* File Upload */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Upload Image
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Accepted: PNG, JPG, JPEG, GIF, SVG
              </Typography>
              <Button
                variant="contained"
                component="label"
                fullWidth
              >
                Choose File
                <input
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setEditCustomerLogo(reader.result as string);
                        setEditCustomerPhotoScale(100);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </Button>
            </Box>

            {editCustomerLogo && (
              <Button
                variant="outlined"
                color="error"
                onClick={() => {
                  setEditCustomerLogo(null);
                  setEditCustomerPhotoScale(100);
                }}
                fullWidth
              >
                Remove Logo
              </Button>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoUploadDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => setLogoUploadDialogOpen(false)}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default UserManagement;
