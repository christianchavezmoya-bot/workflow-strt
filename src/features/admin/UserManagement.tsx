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
} from "@mui/material";
import {
  AddOutlined,
  DeleteOutline,
  EditOutlined,
  ArrowDropDown,
  SettingsOutlined
} from "@mui/icons-material";
import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
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
    const anyError = error as { message?: string; response?: { data?: string } };
    return anyError.response?.data || anyError.message || fallback;
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

export const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const { activeOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
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
    user?.id || "anonymous",
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
    user?.id || "anonymous",
    customersDynamic.definitions.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  const productsTableConfig = useTableConfig(
    "products",
    user?.id || "anonymous",
    productsDynamic.definitions.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  const assetsTableConfig = useTableConfig(
    "assets",
    user?.id || "anonymous",
    assetsDynamic.definitions.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const [tableConfigTarget, setTableConfigTarget] = useState<"users" | "customers" | "products" | "assets">("users");

  const availableFieldsForAdminTable = useMemo(() => {
    const tableName = tableConfigTarget;
    return allFieldDefinitions.definitions.filter((field) => !field.tables.includes(tableName));
  }, [allFieldDefinitions.definitions, tableConfigTarget]);
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
  const [offices, setOffices] = useState<Office[]>([]);

  useEffect(() => {
    officesService.getAll().then(setOffices).catch(console.error);
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
          id: "admin-products",
          label: "Products",
          type: "products",
          position: 2,
          columns: [],
          fieldIds: [],
          config: { order: [], hidden: [] }
        },
        {
          id: "admin-assets",
          label: "Assets",
          type: "assets",
          position: 3,
          columns: [],
          fieldIds: [],
          config: { order: [], hidden: [] }
        },
        {
          id: "admin-roles",
          label: "Roles",
          type: "roles",
          position: 4,
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
  const productFilterOptions = useMemo(
    () => ({
      name: Array.from(new Set(numberedProducts.map((row) => productAccessors.name(row)))).sort(),
      description: Array.from(new Set(numberedProducts.map((row) => productAccessors.description(row)))).sort()
    }),
    [numberedProducts, productAccessors]
  );

  const assetAccessors = useMemo(() => {
    const base = {
      machineType: (asset: typeof assets[number]) => normalize(asset.machineType),
      machineId: (asset: typeof assets[number]) => normalize(asset.machineId),
      serialNumber: (asset: typeof assets[number]) => normalize(asset.serialNumber),
      pmCount: (asset: typeof assets[number]) => normalize(asset.pmCount),
      comments: (asset: typeof assets[number]) => normalize(asset.comments)
    } as Record<string, (asset: typeof assets[number]) => string>;
    customAssetColumns.forEach((col) => {
      base[`custom:${col}`] = () => "-";
    });
    return base;
  }, [assets, customAssetColumns]);
  const assetFilterOptions = useMemo(() => {
    const base = {
      machineType: Array.from(new Set(assets.map((row) => assetAccessors.machineType(row)))).sort(),
      machineId: Array.from(new Set(assets.map((row) => assetAccessors.machineId(row)))).sort(),
      serialNumber: Array.from(new Set(assets.map((row) => assetAccessors.serialNumber(row)))).sort(),
      pmCount: Array.from(new Set(assets.map((row) => assetAccessors.pmCount(row)))).sort(),
      comments: Array.from(new Set(assets.map((row) => assetAccessors.comments(row)))).sort()
    } as Record<string, string[]>;
    customAssetColumns.forEach((col) => {
      base[`custom:${col}`] = ["-"];
    });
    return base;
  }, [assets, assetAccessors, customAssetColumns]);

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

  const filteredAssetRows = useMemo(() => {
    const filtered = applyAutoFilter(assets, assetFilters, assetAccessors);
    return applyAutoSort(filtered, assetSort, assetAccessors);
  }, [assets, assetFilters, assetSort, assetAccessors]);

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
      setOffices((prev) => [...prev, created]);
    } catch (error) {
      console.error("Failed to add office:", error);
    }
  };

  const handleUpdateOffice = async (id: string, office: Omit<Office, "id">) => {
    try {
      const updated = await officesService.update(id, office);
      setOffices((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (error) {
      console.error("Failed to update office:", error);
    }
  };

  const handleDeleteOffice = async (id: string) => {
    try {
      await officesService.delete(id);
      setOffices((prev) => prev.filter((o) => o.id !== id));
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
          >
            <MenuItem
              onClick={() => {
                if (userMenu.key) setUserSort({ key: userMenu.key, dir: "asc" });
                setUserMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort A ? Z
            </MenuItem>
            <MenuItem
              onClick={() => {
                if (userMenu.key) setUserSort({ key: userMenu.key, dir: "desc" });
                setUserMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort Z ? A
            </MenuItem>
            <MenuItem
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
                  key={`${userMenu.key}-${option}`}
                  onClick={() => {
                    if (!userMenu.key) return;
                    toggleFilterValue(setUserFilters, userMenu.key, option);
                  }}
                >
                  <Checkbox checked={selected} />
                  <ListItemText primary={label} />
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
          >
            <MenuItem
              onClick={() => {
                if (roleMenu.key) setRoleSort({ key: roleMenu.key, dir: "asc" });
                setRoleMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort A ? Z
            </MenuItem>
            <MenuItem
              onClick={() => {
                if (roleMenu.key) setRoleSort({ key: roleMenu.key, dir: "desc" });
                setRoleMenu({ anchorEl: null, key: "" });
              }}
            >
              Sort Z ? A
            </MenuItem>
            <MenuItem
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
                  key={`${roleMenu.key}-${option}`}
                  onClick={() => {
                    if (!roleMenu.key) return;
                    toggleFilterValue(setRoleFilters, roleMenu.key, option);
                  }}
                >
                  <Checkbox checked={selected} />
                  <ListItemText primary={label} />
                </MenuItem>
              );
            })}
          </Menu>
        </Box>
      )}

      {/* Customers Tab */}
      {adminTabsConfig[tab]?.type === "customers" && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<AddOutlined />}>
              New Client
            </Button>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 2,
            }}
          >
            {[
              { id: 101, name: "Apex Industries", type: "Manufacturing", sites: 2 },
              { id: 102, name: "BeeHealthy Foods", type: "Retail", sites: 2 },
              { id: 103, name: "SolarTech Energy", type: "Energy", sites: 2 },
              { id: 104, name: "Zenith Data Systems", type: "Technology", sites: 2 },
              { id: 105, name: "Kappa Telecoms", type: "Technology", sites: 1 },
              { id: 106, name: "Omega Softworks", type: "Technology", sites: 2 },
              { id: 107, name: "Delta Dental", type: "Healthcare", sites: 1 },
              { id: 108, name: "Pi Pharmaceuticals", type: "Healthcare", sites: 2 },
              { id: 109, name: "Theta Care", type: "Healthcare", sites: 1 },
              { id: 110, name: "Lambda Financial", type: "Finance", sites: 2 },
              { id: 111, name: "Sigma Capital", type: "Finance", sites: 1 },
              { id: 112, name: "Phi Bank", type: "Finance", sites: 1 },
              { id: 113, name: "Alpha Logistics", type: "Transport", sites: 2 },
              { id: 114, name: "Beta Shipping", type: "Transport", sites: 1 },
              { id: 115, name: "Mu Freight", type: "Transport", sites: 1 },
              { id: 116, name: "Gamma Agritech", type: "Manufacturing", sites: 2 },
              { id: 117, name: "Rho Education", type: "Education", sites: 2 },
              { id: 118, name: "Xi Hospitality", type: "Retail", sites: 2 },
            ].map((customer) => (
              <Paper
                key={customer.id}
                sx={{
                  p: 2,
                  textAlign: 'center',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderBottom: '4px solid',
                  borderBottomColor: 'primary.main',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, boxShadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 3,
                  },
                }}
              >
                <Box
                  sx={{
                    width: 70,
                    height: 70,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '1.5rem',
                  }}
                >
                  {customer.name.charAt(0)}
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {customer.name}
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
                  {customer.type} • {customer.sites} Sites
                </Typography>
                <Button size="small" variant="contained" fullWidth>
                  View Sites
                </Button>
              </Paper>
            ))}
          </Box>
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

          // Check if this is an office map tab
          const isOfficeTab = tabConfig.label.toLowerCase().includes("office");

          return (
            <Box key={tabConfig.id}>
              {isOfficeTab ? (
                <GlobalOfficeMap
                  offices={offices}
                  onAddOffice={handleAddOffice}
                  onUpdateOffice={handleUpdateOffice}
                  onDeleteOffice={handleDeleteOffice}
                />
              ) : (
                <>
              {/* Table */}
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Created Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No data yet. Click "Add Row" to create the first entry.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, index) => (
                      <TableRow key={row.ID || index} hover>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{row.ID || ""}</TableCell>
                        <TableCell>{row.Name || ""}</TableCell>
                        <TableCell>{row["Created Date"] || ""}</TableCell>
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
              </>
              )}
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
              definitions={usersDynamic.definitions}
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
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
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
        }}
        onDeleteField={async (fieldId) => {
          await fieldService.deleteDefinition(fieldId);
          if (tableConfigTarget === "users") await usersDynamic.reload();
          if (tableConfigTarget === "customers") await customersDynamic.reload();
          if (tableConfigTarget === "products") await productsDynamic.reload();
          if (tableConfigTarget === "assets") await assetsDynamic.reload();
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
        }}
        onDeleteField={async (fieldId) => {
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
              definitions={customersDynamic.definitions}
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
        }}
        onDeleteField={async (fieldId) => {
          await fieldService.deleteDefinition(fieldId);
          if (tableConfigTarget === "users") await usersDynamic.reload();
          if (tableConfigTarget === "products") await productsDynamic.reload();
          if (tableConfigTarget === "assets") await assetsDynamic.reload();
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
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
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
        }}
        onDeleteField={async (fieldId) => {
          await fieldService.deleteDefinition(fieldId);
          if (tableConfigTarget === "users") await usersDynamic.reload();
          if (tableConfigTarget === "customers") await customersDynamic.reload();
          if (tableConfigTarget === "products") await productsDynamic.reload();
          if (tableConfigTarget === "assets") await assetsDynamic.reload();
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
        }}
        onDeleteField={async (fieldId) => {
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
              definitions={customersDynamic.definitions}
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
            <DynamicFieldsForm
              definitions={productsDynamic.definitions}
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
              definitions={usersDynamic.definitions}
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
              definitions={customersDynamic.definitions}
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
              label="Product name"
              value={editProductForm.name}
              onChange={(event) => setEditProductForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextField
              label="Description (optional)"
              value={editProductForm.description}
              onChange={(event) => setEditProductForm((prev) => ({ ...prev, description: event.target.value }))}
              multiline
              rows={2}
            />
            <DynamicFieldsForm
              definitions={productsDynamic.definitions}
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
              label="Machine Type"
              value={assetForm.machineType}
              onChange={(event) => setAssetForm((prev) => ({ ...prev, machineType: event.target.value }))}
            />
            <TextField
              label="Machine ID"
              value={assetForm.machineId}
              onChange={(event) => setAssetForm((prev) => ({ ...prev, machineId: event.target.value }))}
            />
            <TextField
              label="Serial Number"
              value={assetForm.serialNumber}
              onChange={(event) => setAssetForm((prev) => ({ ...prev, serialNumber: event.target.value }))}
            />
            <FormControl>
              <Select
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
              label="Comments"
              value={assetForm.comments}
              onChange={(event) => setAssetForm((prev) => ({ ...prev, comments: event.target.value }))}
              multiline
              rows={2}
            />
            <DynamicFieldsForm
              definitions={assetsDynamic.definitions}
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
            if (selected.type === "customers") setTableConfigTarget("customers");
            if (selected.type === "products") setTableConfigTarget("products");
            if (selected.type === "assets") setTableConfigTarget("assets");
            setTableConfigOpen(true);
          }}
        >
          Table configuration
        </MenuItem>
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
    </Container>
  );
};

export default UserManagement;
