import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Alert,
  Autocomplete,
  FormControl,
  Grid,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { ArrowDropDown, DeleteOutline, EditOutlined, SettingsOutlined } from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DynamicFieldsForm from "../../components/DynamicFieldsForm";
import TableConfigDialog from "../../components/TableConfigDialog";
import DeleteConfirmDialog from "../../components/ui/DeleteConfirmDialog";
import { useAuth } from "../../hooks/useAuth";
import { useDynamicFields } from "../../hooks/useDynamicFields";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useTableConfig } from "../../hooks/useTableConfig";
import { useFieldDefinitions } from "../../hooks/useFieldDefinitions";
import { fieldService } from "../../services/fieldService";
import { officesService } from "../../services/officesService";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { installationTabsService, InstallationTab, InstallationTabRow } from "../../services/installationTabsService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { createInstallation, deleteInstallation, fetchInstallations, updateInstallation } from "../../store/installationSlice";
import { fetchProjects } from "../../store/projectSlice";
import { fetchProducts } from "../../store/productsSlice";
import { createUser, fetchUsers } from "../../store/usersSlice";
import { Installation } from "../../types/installation";
import { inspectionService, Inspection } from "../../services/inspectionService";
import { customFieldService, CustomFieldDefinition } from "../../services/customFieldService";

// Style for field definition labels (yellow bold)
const fieldLabelStyle = {
  color: '#FFD700',
  fontWeight: 'bold'
};

const normalize = (value: string | number | undefined | null) => String(value ?? "");
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

const InstallationList = () => {
  const { user } = useAuth();
  const { activeOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
  const { items, loading } = useAppSelector((state) => state.installations);
  const projectsState = useAppSelector((state) => state.projects);
  const [searchParams, setSearchParams] = useSearchParams();
  const usersState = useAppSelector((state) => state.users);
  const productsState = useAppSelector((state) => state.products);
  const [localInstallations, setLocalInstallations] = useState<Installation[]>([]);
  const [globalOffices, setGlobalOffices] = useState<Office[]>([]);

  useEffect(() => {
    officesService.getAll().then(setGlobalOffices);
  }, []);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [tab, setTab] = useState(() => {
    const stored = localStorage.getItem("installation_active_tab");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [installationTabsConfig, setInstallationTabsConfig] = useState<InstallationTab[]>([]);
  const [installationTabsLoaded, setInstallationTabsLoaded] = useState(false);
  const [installationTabManagerOpen, setInstallationTabManagerOpen] = useState(false);
  const [installationTabDragIndex, setInstallationTabDragIndex] = useState<number | null>(null);
  const [installationSettingsMenu, setInstallationSettingsMenu] = useState<HTMLElement | null>(null);
  const [installationSettingsMenuOpen, setInstallationSettingsMenuOpen] = useState(false);
  const [newInstallationTabName, setNewInstallationTabName] = useState("");
  const [newInstallationTabType, setNewInstallationTabType] = useState<
    "installations"
  >("installations");
  const [installationTabRows, setInstallationTabRows] = useState<Record<string, Array<Record<string, string>>>>({});
  const [customInstallSorts, setCustomInstallSorts] = useState<Record<string, { key: string; dir: "asc" | "desc" }>>(
    {}
  );
  const [customInstallFilters, setCustomInstallFilters] = useState<Record<string, Record<string, Set<string>>>>({});
  const [customInstallMenu, setCustomInstallMenu] = useState<{
    tabId: string;
    anchorEl: HTMLElement | null;
    key: string;
  }>({ tabId: "", anchorEl: null, key: "" });
  const [customInstallRowDialogOpen, setCustomInstallRowDialogOpen] = useState(false);
  const [customInstallRowDialogTabId, setCustomInstallRowDialogTabId] = useState<string | null>(null);
  const [customInstallRowDialogIndex, setCustomInstallRowDialogIndex] = useState<number | null>(null);
  const [customInstallRowForm, setCustomInstallRowForm] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"table" | "form">("table");
  const [activeProduct, setActiveProduct] = useState("Strata Protech");
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [newInstallationOpen, setNewInstallationOpen] = useState(false);
  const [newInspectionOpen, setNewInspectionOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [installationProgress, setInstallationProgress] = useState(0);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newInstallationForm, setNewInstallationForm] = useState({
    installationName: "",
    installationNumber: "",
    siteLocation: "",
    machineType: "",
    pm1Serial: "",
    pm2Serial: "",
    pm3Serial: "",
    pm4Serial: "",
    installer: "",
    inspector: ""
  });
  const [formInstallation, setFormInstallation] = useState({
    installationName: "",
    installationNumber: "",
    siteLocation: "",
    machineType: "",
    pm1Serial: "",
    pm2Serial: "",
    pm3Serial: "",
    pm4Serial: "",
    installer: "",
    inspector: "",
    notes: ""
  });
  const [installerDialogOpen, setInstallerDialogOpen] = useState(false);
  const [installerDialogData, setInstallerDialogData] = useState({
    fullName: "",
    email: ""
  });
  const [installationSort, setInstallationSort] = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [installationFilters, setInstallationFilters] = useState<Record<string, Set<string>>>({});
  const [installationMenu, setInstallationMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({
    anchorEl: null,
    key: ""
  });
  const [inspectionSort, setInspectionSort] = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [inspectionFilters, setInspectionFilters] = useState<Record<string, Set<string>>>({});
  const [inspectionMenu, setInspectionMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({
    anchorEl: null,
    key: ""
  });
  const [selectedJobNumber, setSelectedJobNumber] = useState("");
  const [showAllInstallations, setShowAllInstallations] = useState(false);
  const [newInspection, setNewInspection] = useState({
    name: "",
    installation: "",
    inspector: "",
    date: ""
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [modalErrors, setModalErrors] = useState<Record<string, string>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Installation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Installation | null>(null);
  const [deleteSavingId, setDeleteSavingId] = useState<string | null>(null);
  const [placeholderNoticeOpen, setPlaceholderNoticeOpen] = useState(false);
  const [inspections, setInspections] = useState<
    Array<Inspection & { installationLabel: string }>
  >([]);
  const [installationChecks, setInstallationChecks] = useState<Record<string, boolean>>({});
  const [formInstallationDynamic, setFormInstallationDynamic] = useState<Record<string, string>>({});
  const [modalInstallationDynamic, setModalInstallationDynamic] = useState<Record<string, string>>({});
  const [editInstallationDynamic, setEditInstallationDynamic] = useState<Record<string, string>>({});
  const [newInspectionDynamic, setNewInspectionDynamic] = useState<Record<string, string>>({});
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const [tableConfigTarget, setTableConfigTarget] = useState<"installations" | "inspections">("installations");

  useEffect(() => {
    const loadTabs = async () => {
      try {
        const data = await installationTabsService.getAll();
        if (data.length > 0) {
          const filtered = data
            .filter(
              (tabItem) =>
                tabItem.type !== "inspections" &&
                tabItem.type !== "issues" &&
                tabItem.type !== "documents" &&
                tabItem.id !== "inspections" &&
                tabItem.id !== "issues" &&
                tabItem.id !== "documents"
            )
            .map((tabItem, index) => ({ ...tabItem, position: index }));
          setInstallationTabsConfig(filtered);
          if (filtered.length !== data.length) {
            await installationTabsService.saveAll(filtered);
          }
          setInstallationTabsLoaded(true);
          return;
        }
      } catch {
        // ignore
      }
      const defaults: InstallationTab[] = [
        { id: "installations", label: "Installations", type: "installations", position: 0 }
      ];
      setInstallationTabsConfig(defaults);
      try {
        await installationTabsService.saveAll(defaults);
      } catch {
        // ignore
      }
      setInstallationTabsLoaded(true);
    };
    loadTabs();
  }, []);

  useEffect(() => {
    if (!installationTabsLoaded) return;
    const normalized = installationTabsConfig.map((tabItem, index) => ({
      ...tabItem,
      position: index
    }));
    installationTabsService.saveAll(normalized).catch(() => {
      // ignore
    });
  }, [installationTabsConfig, installationTabsLoaded]);

  useEffect(() => {
    const loadRows = async () => {
      const customTabs = installationTabsConfig.filter((tabItem) => tabItem.id.startsWith("install-tab-"));
      await Promise.all(
        customTabs.map(async (tabItem) => {
          try {
            const rows = await installationTabsService.getRows(tabItem.id);
            const today = new Date().toISOString().slice(0, 10);
            setInstallationTabRows((prev) => ({
              ...prev,
              [tabItem.id]: rows.map((row) => {
                const data = { ...row.data, _rowId: row.id };
                // Backfill empty "Created Date" on existing rows
                if ("Created Date" in data && !data["Created Date"]) {
                  data["Created Date"] = today;
                }
                return data;
              })
            }));
          } catch {
            // ignore
          }
        })
      );
    };
    if (installationTabsLoaded) {
      loadRows();
    }
  }, [installationTabsConfig, installationTabsLoaded]);

  useEffect(() => {
    if (!installationTabsLoaded) return;
    const customTabs = installationTabsConfig.filter((tabItem) => tabItem.id.startsWith("install-tab-"));
    customTabs.forEach((tabItem) => {
      const rows = installationTabRows[tabItem.id] || [];
      let didAssignIds = false;
      const payload: InstallationTabRow[] = rows.map((row, index) => {
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
        setInstallationTabRows((prev) => ({
          ...prev,
          [tabItem.id]: rows.map((row, index) => ({
            ...row,
            _rowId: payload[index]?.id
          }))
        }));
      }
      if (payload.length === 0) return;
      installationTabsService.saveRows(tabItem.id, payload).catch(() => {
        // ignore
      });
    });
  }, [installationTabRows, installationTabsConfig, installationTabsLoaded]);

  useEffect(() => {
    if (tab >= installationTabsConfig.length) {
      setTab(Math.max(0, installationTabsConfig.length - 1));
    }
  }, [tab, installationTabsConfig.length]);

  const toggleCustomInstallFilterValue = (tabId: string, key: string, value: string) => {
    setCustomInstallFilters((prev) => {
      const tabFilters = { ...(prev[tabId] || {}) };
      const current = new Set(tabFilters[key] ?? []);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      return { ...prev, [tabId]: { ...tabFilters, [key]: current } };
    });
  };

  const installationsDynamic = useDynamicFields("installations");
  const inspectionsDynamic = useDynamicFields("inspections");
  const allFieldDefinitions = useFieldDefinitions();
  const installationsTableConfig = useTableConfig(
    "installations",
    installationsDynamic.definitions.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  const inspectionsTableConfig = useTableConfig(
    "inspections",
    inspectionsDynamic.definitions.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );

  const installationFixedColumns = useMemo(
    () =>
      new Set(
        [
          "Job Number",
          "Site Name",
          "Start Date",
          "Status",
          "Progress",
          "Installer",
          "Done",
          "Machine Type",
          "PM-1 S/N",
          "PM-2 S/N",
          "PM-3 S/N",
          "PM-4 S/N"
        ].map((value) => value.toLowerCase())
      ),
    []
  );
  const inspectionFixedColumns = useMemo(
    () => new Set(["Inspection", "Installer", "Inspector", "Status", "Photos"].map((value) => value.toLowerCase())),
    []
  );

  const installationDynamicColumns = useMemo(
    () =>
      installationsTableConfig.visibleFields.filter((field) => {
        if (installationFixedColumns.has(field.name.toLowerCase())) return false;
        const hasValue = Object.values(installationsDynamic.valuesByEntity).some(
          (values) => values[field.id]?.value?.trim()
        );
        return hasValue;
      }),
    [installationsTableConfig.visibleFields, installationsDynamic.valuesByEntity, installationFixedColumns]
  );
  const inspectionDynamicColumns = useMemo(
    () =>
      inspectionsTableConfig.visibleFields.filter((field) => {
        if (inspectionFixedColumns.has(field.name.toLowerCase())) return false;
        const hasValue = Object.values(inspectionsDynamic.valuesByEntity).some(
          (values) => values[field.id]?.value?.trim()
        );
        return hasValue;
      }),
    [inspectionsTableConfig.visibleFields, inspectionsDynamic.valuesByEntity, inspectionFixedColumns]
  );

  const availableFieldsForTable = useMemo(() => {
    const tableName = tableConfigTarget;
    return allFieldDefinitions.definitions.filter((field) => !field.tables.includes(tableName));
  }, [allFieldDefinitions.definitions, tableConfigTarget]);

  const productComponents: Record<string, string[]> = {
    "Strata Protech": ["Generator", "Battery bank", "Controller", "Comms module"],
    "Strata Connect": ["Core server", "Edge gateway", "Switch", "Rack"],
    "Strata AI": ["Camera array", "Inference server", "Storage node", "Sensor kit"]
  };

  useEffect(() => {
    dispatch(fetchInstallations());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);

  useEffect(() => {
    dispatch(
      fetchProjects({
        country: activeOffice !== "All" ? activeOffice : undefined,
        page: 1,
        pageSize: 200
      })
    );
  }, [dispatch, activeOffice]);

  useEffect(() => {
    const storedJob = localStorage.getItem("selected_job_number") || "";
    const storedShowAll = localStorage.getItem("show_all_installations") === "true";
    const jobParam = searchParams.get("job") || "";
    if (jobParam) {
      setSelectedJobNumber(jobParam);
      localStorage.setItem("selected_job_number", jobParam);
      setShowAllInstallations(false);
      localStorage.setItem("show_all_installations", "false");
      return;
    }
    if (storedJob) {
      setSelectedJobNumber(storedJob);
    }
    setShowAllInstallations(storedShowAll);
  }, [searchParams]);

  useEffect(() => {
    if (selectedJobNumber) {
      localStorage.setItem("selected_job_number", selectedJobNumber);
    }
  }, [selectedJobNumber]);

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem("installation_active_tab", String(tab));
  }, [tab]);

  useEffect(() => {
    const storedAssets = localStorage.getItem("admin_assets");
    if (storedAssets) {
      try {
        const parsed = JSON.parse(storedAssets) as Array<{ machineType: string }>;
        const types = Array.from(new Set(parsed.map((item) => item.machineType).filter(Boolean)));
        setAssetTypes(types);
      } catch {
        setAssetTypes([]);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedJobNumber && !showAllInstallations) {
      setFormInstallation((prev) => ({ ...prev, installationNumber: selectedJobNumber }));
      setNewInstallationForm((prev) => ({ ...prev, installationNumber: selectedJobNumber }));
    }
  }, [selectedJobNumber, showAllInstallations]);

  useEffect(() => {
    inspectionService
      .getInspections()
      .then((data) =>
        setInspections(
          data.map((row) => ({
            ...row,
            installationLabel: row.installationId
          }))
        )
      )
      .catch(() => {
        setInspections([]);
      });

  }, []);

  useEffect(() => {
    customFieldService
      .getFields("installation", activeProduct)
      .then((fields) => {
        setCustomFields(fields);
      })
      .catch(() => {
        setCustomFields([]);
      });
  }, [activeProduct]);

  useEffect(() => {
    if (installationsDynamic.definitions.length === 0) return;
    setFormInstallationDynamic((prev) => {
      const next = { ...prev };
      installationsDynamic.definitions.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
    setModalInstallationDynamic((prev) => {
      const next = { ...prev };
      installationsDynamic.definitions.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
  }, [installationsDynamic.definitions]);

  useEffect(() => {
    if (!editForm) return;
    const existing = installationsDynamic.valuesByEntity[editForm.id] || {};
    const next: Record<string, string> = {};
    installationsDynamic.definitions.forEach((field) => {
      next[field.id] = existing[field.id]?.value || "";
    });
    setEditInstallationDynamic(next);
  }, [editForm, installationsDynamic.definitions, installationsDynamic.valuesByEntity]);

  useEffect(() => {
    if (inspectionsDynamic.definitions.length === 0) return;
    setNewInspectionDynamic((prev) => {
      const next = { ...prev };
      inspectionsDynamic.definitions.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
  }, [inspectionsDynamic.definitions]);

  const helperText = useMemo(
    () =>
      "Format: Job Number, Installation Name, Site Name, Start Date, Scheduled End, Installer",
    []
  );

  const data = items.length ? items : localInstallations;
  const dataWithSeq = useMemo(() => data.map((row, index) => ({ ...row, seq: index + 1 })), [data]);

  const projects = projectsState.items;
  const selectedProjectIds = useMemo(() => {
    if (!selectedJobNumber || showAllInstallations) return new Set<string>();
    return new Set(
      projects
        .filter((project) => project.jobNumber === selectedJobNumber)
        .map((project) => project.id)
    );
  }, [projects, selectedJobNumber, showAllInstallations]);
  const selectedProjectId = useMemo(() => {
    return projects.find((project) => project.jobNumber === selectedJobNumber)?.id || "";
  }, [projects, selectedJobNumber]);

  // Resolve product names for the selected project
  // Use local state so the name persists even when the office-filtered project list changes
  const selectedProject = useMemo(
    () => projects.find((p) => p.jobNumber === selectedJobNumber),
    [projects, selectedJobNumber]
  );
  const [selectedProductNames, setSelectedProductNames] = useState("");
  useEffect(() => {
    const ids = selectedProject?.productIds ?? [];
    if (ids.length === 0 || productsState.items.length === 0) return;
    const productMap = new Map(productsState.items.map((p) => [p.id, p.name]));
    const names = ids.map((id) => productMap.get(id) || id).join(", ");
    if (names) setSelectedProductNames(names);
  }, [selectedProject, productsState.items]);

  // Clear product names when job number changes
  useEffect(() => {
    if (!selectedJobNumber) setSelectedProductNames("");
  }, [selectedJobNumber]);

  // Find all projects using the same product(s)
  const [sameProductDialogOpen, setSameProductDialogOpen] = useState(false);
  const projectsUsingSameProduct = useMemo(() => {
    const ids = selectedProject?.productIds ?? [];
    if (ids.length === 0) return [];
    const idSet = new Set(ids);
    return projects.filter(
      (p) => p.id !== selectedProject?.id && p.productIds?.some((pid) => idSet.has(pid))
    );
  }, [projects, selectedProject]);

  const installerOptions = useMemo(() => {
    return usersState.items
      .map((user) => user.fullName)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [usersState.items]);
  const installerOptionsWithAdd = useMemo(
    () => [...installerOptions, "Add new installer..."],
    [installerOptions]
  );

  const progressForStatus: Record<string, number> = {
    "Not Started": 0,
    Scheduled: 20,
    "In Progress": 60,
    Completed: 100,
    Cancelled: 0
  };

  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);

  const filteredData = useMemo(() => {
    const officeFiltered = dataWithSeq.filter((row) => {
      if (activeOffice === "All") return true;
      const installationCountry = countryForOffice(row.office);
      return installationCountry === activeOffice || row.office === activeOffice;
    });
    const jobFiltered = selectedProjectIds.size
      ? officeFiltered.filter((row) => selectedProjectIds.has(row.projectId))
      : officeFiltered;
    const filtered = applyAutoFilter(officeFiltered, installationFilters, {
      installationNumber: (row) => normalize(row.installationNumber),
      siteLocation: (row) => normalize(row.siteLocation),
      scheduledDates: (row) => normalize(row.scheduledStart),
      status: (row) => normalize(row.status),
      progress: (row) => normalize(progressForStatus[row.status] ?? 0),
      installer: (row) => normalize(row.assignedTeam),
      machineType: (row) => normalize(row.machineType ?? ""),
      pm1: (row) => normalize(row.pm1Serial ?? ""),
      pm2: (row) => normalize(row.pm2Serial ?? ""),
      pm3: (row) => normalize(row.pm3Serial ?? ""),
      pm4: (row) => normalize(row.pm4Serial ?? "")
    });
    return applyAutoSort(
      selectedProjectIds.size ? filtered.filter((row) => selectedProjectIds.has(row.projectId)) : filtered,
      installationSort,
      {
      installationNumber: (row) => normalize(row.installationNumber),
      siteLocation: (row) => normalize(row.siteLocation),
      scheduledDates: (row) => normalize(row.scheduledStart),
      status: (row) => normalize(row.status),
      progress: (row) => normalize(progressForStatus[row.status] ?? 0),
      installer: (row) => normalize(row.assignedTeam),
      machineType: (row) => normalize(row.machineType ?? ""),
      pm1: (row) => normalize(row.pm1Serial ?? ""),
      pm2: (row) => normalize(row.pm2Serial ?? ""),
      pm3: (row) => normalize(row.pm3Serial ?? ""),
      pm4: (row) => normalize(row.pm4Serial ?? "")
      }
    );
  }, [
    dataWithSeq,
    activeOffice,
    countryForOffice,
    installationFilters,
    installationSort,
    progressForStatus,
    selectedProjectIds
  ]);

  const officeJobInstallationIds = useMemo(() => {
    const officeFiltered = dataWithSeq.filter(
      (row) => {
        if (activeOffice === "All") return true;
        const installationCountry = countryForOffice(row.office);
        return installationCountry === activeOffice || row.office === activeOffice;
      }
    );
    const jobFiltered = selectedProjectIds.size
      ? officeFiltered.filter((row) => selectedProjectIds.has(row.projectId))
      : officeFiltered;
    return new Set(jobFiltered.map((row) => row.id));
  }, [dataWithSeq, activeOffice, selectedProjectIds, countryForOffice]);

  const installationFilterOptions = useMemo(
    () => ({
      installationNumber: Array.from(new Set(dataWithSeq.map((row) => normalize(row.installationNumber)))).sort(),
      siteLocation: Array.from(new Set(dataWithSeq.map((row) => normalize(row.siteLocation)))).sort(),
      scheduledDates: Array.from(
        new Set(dataWithSeq.map((row) => normalize(row.scheduledStart)))
      ).sort(),
      status: Array.from(new Set(dataWithSeq.map((row) => normalize(row.status)))).sort(),
      progress: Array.from(
        new Set(dataWithSeq.map((row) => normalize(progressForStatus[row.status] ?? 0)))
      ).sort(),
      installer: Array.from(new Set(dataWithSeq.map((row) => normalize(row.assignedTeam)))).sort(),
      machineType: Array.from(new Set(dataWithSeq.map((row) => normalize(row.machineType ?? "")))).sort(),
      pm1: Array.from(new Set(dataWithSeq.map((row) => normalize(row.pm1Serial ?? "")))).sort(),
      pm2: Array.from(new Set(dataWithSeq.map((row) => normalize(row.pm2Serial ?? "")))).sort(),
      pm3: Array.from(new Set(dataWithSeq.map((row) => normalize(row.pm3Serial ?? "")))).sort(),
      pm4: Array.from(new Set(dataWithSeq.map((row) => normalize(row.pm4Serial ?? "")))).sort()
    }),
    [dataWithSeq, progressForStatus]
  );

  const inspectionsWithSeq = useMemo(
    () => inspections.map((row, index) => ({ ...row, seq: index + 1 })),
    [inspections]
  );
  const installerByInstallationId = useMemo(() => {
    const map = new Map<string, string>();
    dataWithSeq.forEach((row) => {
      map.set(row.id, row.assignedTeam || "Unassigned");
    });
    return map;
  }, [dataWithSeq]);

  const filteredInspections = useMemo(() => {
    const filtered = applyAutoFilter(inspectionsWithSeq, inspectionFilters, {
      name: (row) => normalize(row.name),
      installation: (row) => normalize(installerByInstallationId.get(row.installationId) || "Unassigned"),
      inspector: (row) => normalize(row.inspector),
      status: (row) => normalize(row.status),
      photos: (row) => normalize(row.photoCount)
    });
    const jobFiltered = selectedProjectIds.size
      ? filtered.filter((row) => officeJobInstallationIds.has(row.installationId))
      : filtered;
    return applyAutoSort(jobFiltered, inspectionSort, {
      name: (row) => normalize(row.name),
      installation: (row) => normalize(installerByInstallationId.get(row.installationId) || "Unassigned"),
      inspector: (row) => normalize(row.inspector),
      status: (row) => normalize(row.status),
      photos: (row) => normalize(row.photoCount)
    });
  }, [
    inspectionsWithSeq,
    inspectionFilters,
    inspectionSort,
    selectedProjectIds,
    officeJobInstallationIds,
    installerByInstallationId
  ]);


  const openOrCreateInstallationLinkedTab = (fieldName: string) => {
    if (!fieldName.trim()) return;
    const label = fieldName.trim();
    const existingIndex = installationTabsConfig.findIndex(
      (tabItem) => tabItem.label === label && tabItem.id.startsWith("install-tab-")
    );
    const existingTab = existingIndex >= 0 ? installationTabsConfig[existingIndex] : null;
    const newTab: InstallationTab = {
      id: `install-tab-${Date.now()}`,
      label,
      type: "installations",
      position: installationTabsConfig.length
    };
    const targetTabId = existingTab?.id ?? newTab.id;
    const targetIndex = existingIndex >= 0 ? existingIndex : installationTabsConfig.length;
    if (!existingTab) {
      setInstallationTabsConfig((prev) => {
        if (prev.some((tabItem) => tabItem.label === label && tabItem.id.startsWith("install-tab-"))) return prev;
        return [...prev, { ...newTab, position: prev.length }];
      });
    }
    setTab(targetIndex);
    setInstallationTabRows((prev) => {
      const current = prev[targetTabId] || [];
      return {
        ...prev,
        [targetTabId]: [...current, createDefaultCustomRow(current.length + 1)]
      };
    });
  };

  const inspectionFilterOptions = useMemo(
    () => ({
      name: Array.from(new Set(inspectionsWithSeq.map((row) => normalize(row.name)))).sort(),
      installation: Array.from(
        new Set(
          inspectionsWithSeq.map((row) =>
            normalize(installerByInstallationId.get(row.installationId) || "Unassigned")
          )
        )
      ).sort(),
      inspector: Array.from(new Set(inspectionsWithSeq.map((row) => normalize(row.inspector)))).sort(),
      status: Array.from(new Set(inspectionsWithSeq.map((row) => normalize(row.status)))).sort(),
      photos: Array.from(new Set(inspectionsWithSeq.map((row) => normalize(row.photoCount)))).sort()
    }),
    [inspectionsWithSeq, installerByInstallationId]
  );

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleCustomFieldDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    setCustomFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      next.forEach((field, order) => {
        if (field.sortOrder !== order) {
          customFieldService.updateField(field.id, { ...field, sortOrder: order });
        }
      });
      return next.map((field, order) => ({ ...field, sortOrder: order }));
    });
    setDragIndex(null);
  };

  const handleBulkAdd = () => {
    const rows = bulkText
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean);

    const parsed = rows.map((row, index) => {
      const [installationNumber, installationName, siteLocation, scheduledStart, scheduledEnd, assignedTeam] =
        row.split(",").map((value) => value.trim());

      return {
        id: `I-BULK-${index}-${Date.now()}`,
        projectId: "P-1024",
        installationNumber,
        installationName,
        siteLocation,
        scheduledStart,
        scheduledEnd,
        status: "Not Started",
        assignedTeam: assignedTeam || "Unassigned",
        office: activeOffice === "All" ? "USA" : activeOffice,
        machineType: "",
        pm1Serial: "",
        pm2Serial: "",
        pm3Serial: "",
        pm4Serial: ""
      } as Installation;
    });

    setLocalInstallations((prev) => [...prev, ...parsed]);
    parsed.forEach((row) => dispatch(createInstallation(row)));
    setBulkText("");
    setBulkOpen(false);
  };

  const validateInstallation = (payload: {
    jobNumber: string;
    name: string;
    siteLocation: string;
    machineType: string;
    installer: string;
  }) => {
    const errors: Record<string, string> = {};
    if (!payload.jobNumber) errors.jobNumber = "Job number is required.";
    if (!payload.name) errors.name = "Installation name is required.";
    if (!payload.siteLocation) errors.siteLocation = "Site name is required.";
    if (!payload.machineType) errors.machineType = "Machine type is required.";
    if (!payload.installer) errors.installer = "Installer is required.";
    return errors;
  };

  const showInstallationsPlaceholder = () => {
    setPlaceholderNoticeOpen(true);
  };


  const activeTab = installationTabsConfig[tab];
  const activeTabType = activeTab?.type ?? "installations";
  const isCustomInstallTab = !!activeTab?.id?.startsWith("install-tab-");

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Installations{selectedProductNames ? ` â€” ${selectedProductNames}` : ""}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Showing {activeOffice === "All" ? "all offices" : activeOffice} installations.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="outlined"
            onClick={showInstallationsPlaceholder}
          >
            Add new installation
          </Button>
          <Button variant="outlined" onClick={() => setBulkOpen(true)}>
            Bulk add
          </Button>
          <IconButton
            size="small"
            onMouseEnter={(event) => {
              setInstallationSettingsMenu(event.currentTarget);
              setInstallationSettingsMenuOpen(true);
            }}
            onClick={(event) => {
              setInstallationSettingsMenu(event.currentTarget);
              setInstallationSettingsMenuOpen(true);
            }}
          >
            <SettingsOutlined fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
        <Button
          variant="outlined"
          sx={{ opacity: showAllInstallations ? 0.5 : 1 }}
          onClick={() => {
            if (showAllInstallations) {
              setShowAllInstallations(false);
              localStorage.setItem("show_all_installations", "false");
              if (selectedJobNumber) {
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("job", selectedJobNumber);
                  return next;
                });
              }
              window.location.reload();
              return;
            }
            setShowAllInstallations(true);
            localStorage.setItem("show_all_installations", "true");
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete("job");
              return next;
            });
            window.location.reload();
          }}
        >
          {selectedJobNumber ? `Job # ${selectedJobNumber}` : "Job # (not set)"}
        </Button>
        {selectedProductNames && projectsUsingSameProduct.length > 0 && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => setSameProductDialogOpen(true)}
          >
            {projectsUsingSameProduct.length} other project{projectsUsingSameProduct.length !== 1 ? "s" : ""} using same product
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, next) => setTab(next)}>
        {installationTabsConfig.map((tabItem) => (
          <Tab key={tabItem.id} label={tabItem.label} />
        ))}
      </Tabs>

        {isCustomInstallTab && activeTab && (() => {
          const columns = defaultCustomColumns;
          const rows = installationTabRows[activeTab.id] || [];
          const sortConfig = customInstallSorts[activeTab.id] ?? { key: "", dir: "asc" };
          const filters = customInstallFilters[activeTab.id] ?? {};
          const defaultFields = columns.map((name) => ({ id: `default:${name}`, name, type: getDefaultColumnType(name) }));
          const accessors = Object.fromEntries(
            defaultFields.map((field) => [
              field.id,
              (entry: { row: Record<string, string> }) => normalize(entry.row[field.name])
            ])
          );
          const filterOptions = Object.fromEntries(
            defaultFields.map((field) => [
              field.id,
              Array.from(new Set(rows.map((row) => normalize(row[field.name])))).sort()
            ])
          ) as Record<string, string[]>;
          const rowsWithIndex = rows.map((row, index) => ({ row, index }));
          const filteredRows = applyAutoSort(applyAutoFilter(rowsWithIndex, filters, accessors), sortConfig, accessors);
          return (
            <Box className="glass-card" sx={{ padding: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    {defaultFields.map((field) => (
                      <TableCell key={`${activeTab.id}-${field.id}`}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <span style={fieldLabelStyle}>{field.name}</span>
                          <IconButton
                            size="small"
                            onClick={(event) =>
                              setCustomInstallMenu({ tabId: activeTab.id, anchorEl: event.currentTarget, key: field.id })
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
                  {filteredRows.map((entry, displayIndex) => (
                    <TableRow key={`${activeTab.id}-${entry.index}`}>
                      <TableCell>{displayIndex + 1}</TableCell>
                      {defaultFields.map((field) => (
                        <TableCell key={`${activeTab.id}-${entry.index}-${field.id}`}>
                          <Typography variant="body2">{entry.row[field.name] || "-"}</Typography>
                        </TableCell>
                      ))}
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              const baseDefaults = createDefaultCustomRow(entry.index + 1);
                              const nextForm: Record<string, string> = {};
                              defaultFields.forEach((field) => {
                                nextForm[field.id] = entry.row[field.name] ?? (baseDefaults as Record<string, string>)[field.name] ?? "";
                              });
                              setCustomInstallRowForm(nextForm);
                              setCustomInstallRowDialogTabId(activeTab.id);
                              setCustomInstallRowDialogIndex(entry.index);
                              setCustomInstallRowDialogOpen(true);
                            }}
                          >
                            <EditOutlined fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() =>
                              setInstallationTabRows((prev) => ({
                                ...prev,
                                [activeTab.id]: (prev[activeTab.id] || []).filter((_, index) => index !== entry.index)
                              }))
                            }
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Menu
                anchorEl={customInstallMenu.anchorEl}
                open={Boolean(customInstallMenu.anchorEl) && customInstallMenu.tabId === activeTab.id}
                onClose={() => setCustomInstallMenu({ tabId: "", anchorEl: null, key: "" })}
              >
                <MenuItem
                  onClick={() => {
                    if (customInstallMenu.key) {
                      setCustomInstallSorts((prev) => ({
                        ...prev,
                        [activeTab.id]: { key: customInstallMenu.key, dir: "asc" }
                      }));
                    }
                    setCustomInstallMenu({ tabId: "", anchorEl: null, key: "" });
                  }}
                >
                  Sort A â†’ Z
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    if (customInstallMenu.key) {
                      setCustomInstallSorts((prev) => ({
                        ...prev,
                        [activeTab.id]: { key: customInstallMenu.key, dir: "desc" }
                      }));
                    }
                    setCustomInstallMenu({ tabId: "", anchorEl: null, key: "" });
                  }}
                >
                  Sort Z â†’ A
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setCustomInstallSorts((prev) => ({ ...prev, [activeTab.id]: { key: "", dir: "asc" } }));
                    setCustomInstallMenu({ tabId: "", anchorEl: null, key: "" });
                  }}
                >
                  Clear sort
                </MenuItem>
                {(filterOptions[customInstallMenu.key] || []).map((option) => {
                  const label = option || "(Blank)";
                  const selected = !!filters[customInstallMenu.key]?.has(option);
                  return (
                    <MenuItem
                      key={`${customInstallMenu.key}-${option}`}
                      onClick={() => {
                        if (!customInstallMenu.key) return;
                        toggleCustomInstallFilterValue(activeTab.id, customInstallMenu.key, option);
                      }}
                    >
                      <Checkbox checked={selected} />
                      <ListItemText primary={label} />
                    </MenuItem>
                  );
                })}
              </Menu>
            </Box>
          );
        })()}

      {!isCustomInstallTab && activeTabType === "installations" && (
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select value={viewMode} onChange={() => showInstallationsPlaceholder()}>
                <MenuItem value="table">Table view</MenuItem>
                <MenuItem value="form">Form view</MenuItem>
              </Select>
            </FormControl>
            <Button variant="outlined">Download report</Button>
            <Button variant="contained">Create report</Button>
            <Button
              variant="outlined"
              onClick={showInstallationsPlaceholder}
            >
              Table configuration
            </Button>
          </Stack>

          {false && viewMode === "table" && (
            <Box className="glass-card" sx={{ padding: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={filteredData.length > 0 && filteredData.every((row) => installationChecks[row.id])}
                        indeterminate={
                          filteredData.some((row) => installationChecks[row.id]) &&
                          !filteredData.every((row) => installationChecks[row.id])
                        }
                        onChange={(event) => {
                          const nextChecked = event.target.checked;
                          setInstallationChecks((prev) => {
                            const next = { ...prev };
                            filteredData.forEach((row) => {
                              next[row.id] = nextChecked;
                            });
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>Job Number</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "installationNumber" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>Site Name</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "siteLocation" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>Start Date</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "scheduledDates" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>Status</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "status" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>Progress</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "progress" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>Installer</span>
                      <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "installer" })}>
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>Machine Type</span>
                      <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "machineType" })}>
                        <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>PM-1 S/N</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "pm1" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>PM-2 S/N</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "pm2" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>PM-3 S/N</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "pm3" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>PM-4 S/N</span>
                        <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: "pm4" })}>
                          <ArrowDropDown fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                    {installationDynamicColumns.map((field) => (
                      <TableCell key={`installations-field-${field.id}`}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <span style={fieldLabelStyle}>{field.name}</span>
                          <IconButton size="small" onClick={(event) => setInstallationMenu({ anchorEl: event.currentTarget, key: `dyn-${field.id}` })}>
                            <ArrowDropDown fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    ))}
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                {filteredData.map((row) => (
                  <TableRow key={row.id} hover>
                      <TableCell>{row.seq}</TableCell>
                    <TableCell>
                      <Checkbox
                        checked={!!installationChecks[row.id]}
                        onChange={(event) =>
                          setInstallationChecks((prev) => ({ ...prev, [row.id]: event.target.checked }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Box
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: 999,
                          px: 1,
                          py: 0.25,
                          backgroundColor: "rgba(255, 193, 7, 0.2)",
                          fontWeight: 600
                        }}
                      >
                        {row.installationNumber}
                      </Box>
                    </TableCell>
                      <TableCell>{row.siteLocation}</TableCell>
                      <TableCell>{row.scheduledStart || "-"}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{progressForStatus[row.status] ?? 0}%</TableCell>
                    <TableCell>{row.assignedTeam}</TableCell>
                    <TableCell>{row.machineType || "-"}</TableCell>
                      <TableCell>{row.pm1Serial || "-"}</TableCell>
                      <TableCell>{row.pm2Serial || "-"}</TableCell>
                      <TableCell>{row.pm3Serial || "-"}</TableCell>
                      <TableCell>{row.pm4Serial || "-"}</TableCell>
                      {installationDynamicColumns.map((field) => (
                        <TableCell key={`${row.id}-${field.id}`}>
                          {installationsDynamic.valuesByEntity[row.id]?.[field.id]?.value || "-"}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditForm(row);
                              setEditOpen(true);
                            }}
                          >
                            <EditOutlined fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <Menu
              anchorEl={installationMenu.anchorEl}
              open={Boolean(installationMenu.anchorEl)}
              onClose={() => setInstallationMenu({ anchorEl: null, key: "" })}
            >
              <MenuItem
                onClick={() => {
                  if (installationMenu.key) setInstallationSort({ key: installationMenu.key, dir: "asc" });
                  setInstallationMenu({ anchorEl: null, key: "" });
                }}
              >
                Sort A â†’ Z
              </MenuItem>
              <MenuItem
                onClick={() => {
                  if (installationMenu.key) setInstallationSort({ key: installationMenu.key, dir: "desc" });
                  setInstallationMenu({ anchorEl: null, key: "" });
                }}
              >
                Sort Z â†’ A
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setInstallationSort({ key: "", dir: "asc" });
                  setInstallationMenu({ anchorEl: null, key: "" });
                }}
              >
                Clear sort
              </MenuItem>
              {(installationFilterOptions[installationMenu.key as keyof typeof installationFilterOptions] || []).map(
                (option) => {
                  const label = option || "(Blank)";
                  const selected = !!installationFilters[installationMenu.key]?.has(option);
                  return (
                    <MenuItem
                      key={`${installationMenu.key}-${option}`}
                      onClick={() => {
                        if (!installationMenu.key) return;
                        setInstallationFilters((prev) => {
                          const current = new Set(prev[installationMenu.key] ?? []);
                          if (current.has(option)) {
                            current.delete(option);
                          } else {
                            current.add(option);
                          }
                          return { ...prev, [installationMenu.key]: current };
                        });
                      }}
                    >
                      <Checkbox checked={selected} />
                      <ListItemText primary={label} />
                    </MenuItem>
                  );
                }
              )}
            </Menu>
            </Box>
          )}

          {viewMode === "form" && (
            <Box className="glass-card" sx={{ padding: 2 }}>
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <Select value={activeProduct} onChange={(event) => setActiveProduct(event.target.value)}>
                      {["Strata Protech", "Strata Connect", "Strata AI"].map((product) => (
                        <MenuItem key={product} value={product}>
                          {product}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="text.secondary">
                    Product components + custom fields will be configurable in Phase 2.
                  </Typography>
                </Stack>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Installation name"
                      fullWidth
                      value={formInstallation.installationName}
                      onChange={(event) =>
                        setFormInstallation((prev) => ({ ...prev, installationName: event.target.value }))
                      }
                      error={!!formErrors.name}
                      helperText={formErrors.name}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Job number"
                      fullWidth
                      value={formInstallation.installationNumber}
                      onChange={(event) =>
                        setFormInstallation((prev) => ({ ...prev, installationNumber: event.target.value }))
                      }
                      disabled
                      error={!!formErrors.jobNumber}
                      helperText={formErrors.jobNumber}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
            <TextField
              label="Site Name"
              fullWidth
              value={formInstallation.siteLocation}
              onChange={(event) =>
                setFormInstallation((prev) => ({ ...prev, siteLocation: event.target.value }))
              }
                      error={!!formErrors.siteLocation}
                      helperText={formErrors.siteLocation}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      options={assetTypes}
                      freeSolo
                      value={formInstallation.machineType}
                      onChange={(_, value) =>
                        setFormInstallation((prev) => ({
                          ...prev,
                          machineType: typeof value === "string" ? value : value || ""
                        }))
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Machine Type"
                          fullWidth
                          error={!!formErrors.machineType}
                          helperText={formErrors.machineType}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      options={installerOptionsWithAdd}
                      freeSolo={false}
                      value={formInstallation.installer || null}
                      onChange={(_, value) => {
                        const nextValue = typeof value === "string" ? value : value || "";
                        if (nextValue === "Add new installer...") {
                          setInstallerDialogData({ fullName: "", email: "" });
                          setInstallerDialogOpen(true);
                          return;
                        }
                        setFormInstallation((prev) => ({ ...prev, installer: nextValue }));
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Installer"
                          fullWidth
                          error={!!formErrors.installer}
                          helperText={formErrors.installer}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Inspector"
                      fullWidth
                      value={formInstallation.inspector}
                      onChange={(event) =>
                        setFormInstallation((prev) => ({ ...prev, inspector: event.target.value }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="PM-1 S/N"
                      fullWidth
                      value={formInstallation.pm1Serial}
                      onChange={(event) =>
                        setFormInstallation((prev) => ({ ...prev, pm1Serial: event.target.value }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="PM-2 S/N"
                      fullWidth
                      value={formInstallation.pm2Serial}
                      onChange={(event) =>
                        setFormInstallation((prev) => ({ ...prev, pm2Serial: event.target.value }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="PM-3 S/N"
                      fullWidth
                      value={formInstallation.pm3Serial}
                      onChange={(event) =>
                        setFormInstallation((prev) => ({ ...prev, pm3Serial: event.target.value }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="PM-4 S/N"
                      fullWidth
                      value={formInstallation.pm4Serial}
                      onChange={(event) =>
                        setFormInstallation((prev) => ({ ...prev, pm4Serial: event.target.value }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Notes / description"
                      fullWidth
                      multiline
                      rows={3}
                      value={formInstallation.notes}
                      onChange={(event) =>
                        setFormInstallation((prev) => ({ ...prev, notes: event.target.value }))
                      }
                    />
                  </Grid>
                </Grid>
                <Box sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", p: 2 }}>
                  <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
                    Components for {activeProduct}
                  </Typography>
                  <Grid container spacing={2}>
                    {(productComponents[activeProduct] || []).map((component) => (
                      <Grid key={component} item xs={12} md={4}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "rgba(255,255,255,0.04)" }}>
                          <Typography variant="body2">{component}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Serial Â· Firmware Â· Checks
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
                <Box sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", p: 2 }}>
                  <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
                    Progress
                  </Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <TextField
                      type="number"
                      label="Percent complete"
                      value={installationProgress}
                      onChange={(event) => setInstallationProgress(Number(event.target.value))}
                      inputProps={{ min: 0, max: 100 }}
                      sx={{ maxWidth: 200 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {installationProgress}% complete
                    </Typography>
                  </Stack>
                </Box>
                <Box sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", p: 2 }}>
                  <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
                    Admin form builder (drag to reorder)
                  </Typography>
                  <Stack spacing={1}>
                    {customFields.map((field, index) => (
                      <Box
                        key={field.id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleCustomFieldDrop(index)}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          cursor: "move"
                        }}
                      >
                        <Typography variant="body2">
                          {field.name} Â· {field.fieldType}
                        </Typography>
                      </Box>
                    ))}
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small"
                        placeholder="New field name"
                        value={newFieldName}
                        onChange={(event) => setNewFieldName(event.target.value)}
                      />
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <Select value={newFieldType} onChange={(event) => setNewFieldType(event.target.value)}>
                          {["text", "number", "date", "checkbox"].map((type) => (
                            <MenuItem key={type} value={type}>
                              {type}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          if (!newFieldName.trim()) return;
                          const payload: CustomFieldDefinition = {
                            id: `field-${Date.now()}`,
                            name: newFieldName.trim(),
                            fieldType: newFieldType,
                            scope: "installation",
                            product: activeProduct,
                            sortOrder: customFields.length,
                            options: [],
                            isActive: true
                          };
                          customFieldService.createField(payload).then((created) => {
                            setCustomFields((prev) => [...prev, created]);
                          });
                          setNewFieldName("");
                        }}
                      >
                        Add field
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
                <Box sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", p: 2 }}>
                  <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
                    Custom fields
                  </Typography>
                  <DynamicFieldsForm
                    definitions={installationsDynamic.definitions}
                    values={formInstallationDynamic}
                    onChange={setFormInstallationDynamic}
                  />
                </Box>
                <Box sx={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", p: 2 }}>
                  <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
                    Product custom fields
                  </Typography>
                  <Grid container spacing={2}>
                    {customFields.map((field) => (
                      <Grid key={field.id} item xs={12} md={6}>
                        <TextField
                          label={field.name}
                          fullWidth
                          value={customFieldValues[field.name] || ""}
                          onChange={(event) =>
                            setCustomFieldValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                          }
                          InputLabelProps={{ sx: fieldLabelStyle }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
                <Stack direction="row" spacing={2}>
                  <Button variant="outlined">Save draft</Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      const jobNumber = selectedJobNumber;
                      const errors = validateInstallation({
                        jobNumber,
                        name: formInstallation.installationName.trim(),
                        siteLocation: formInstallation.siteLocation.trim(),
                        machineType: formInstallation.machineType.trim(),
                        installer: formInstallation.installer.trim()
                      });
                      setFormErrors(errors);
                      if (Object.keys(errors).length > 0) return;

                      const entry: Installation = {
                        id: `inst-${Date.now()}`,
                        projectId: selectedProjectId || "P-1000",
                        installationNumber: jobNumber || `INST-${Date.now()}`,
                        installationName: formInstallation.installationName || undefined,
                        siteLocation: formInstallation.siteLocation || "Unassigned",
                        scheduledStart: "",
                        scheduledEnd: "",
                        status: "Not Started",
                        assignedTeam: formInstallation.installer || "Unassigned",
                        office: selectedProject?.office || (activeOffice === "All" ? "USA" : activeOffice),
                        machineType: formInstallation.machineType,
                        pm1Serial: formInstallation.pm1Serial,
                        pm2Serial: formInstallation.pm2Serial,
                        pm3Serial: formInstallation.pm3Serial,
                        pm4Serial: formInstallation.pm4Serial
                      };
                      try {
                        const result = await dispatch(createInstallation(entry)).unwrap();
                        setLocalInstallations((prev) => [result, ...prev]);
                        const createdInspection = await inspectionService.createInspection({
                          id: `insp-${Date.now()}`,
                          installationId: result.id,
                          name: `Inspection - ${result.installationNumber}`,
                          inspector: formInstallation.inspector || "Unassigned",
                          status: "Scheduled",
                          photoCount: 0,
                          scheduledDate: undefined
                        });
                        setInspections((prev) => [
                          { ...createdInspection, installationLabel: createdInspection.installationId },
                          ...prev
                        ]);
                        await installationsDynamic.upsertForEntity(
                          result.id,
                          formInstallationDynamic,
                          installationsDynamic.valuesByEntity[result.id]
                        );
                        setFormInstallation({
                          installationName: "",
                          installationNumber: jobNumber,
                          siteLocation: "",
                          machineType: "",
                          pm1Serial: "",
                          pm2Serial: "",
                          pm3Serial: "",
                          pm4Serial: "",
                          installer: "",
                          inspector: "",
                          notes: ""
                        });
                        setFormInstallationDynamic({});
                        setFormErrors({});
                      } catch {
                        // keep form data for retry
                      }
                    }}
                  >
                    Save installation
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </Stack>
      )}

      {activeTabType === "__removed_inspections__" && (
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
            <Button variant="outlined" onClick={() => setNewInspectionOpen(true)}>
              New inspection
            </Button>
            <Button variant="outlined">Download report</Button>
            <Button variant="contained">Create report</Button>
            <Button
              variant="outlined"
              onClick={() => {
                setTableConfigTarget("inspections");
                setTableConfigOpen(true);
              }}
            >
              Table configuration
            </Button>
          </Stack>
          <Box className="glass-card" sx={{ padding: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>Inspection</span>
                      <IconButton size="small" onClick={(event) => setInspectionMenu({ anchorEl: event.currentTarget, key: "name" })}>
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>Installer</span>
                      <IconButton size="small" onClick={(event) => setInspectionMenu({ anchorEl: event.currentTarget, key: "installation" })}>
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>Inspector</span>
                      <IconButton size="small" onClick={(event) => setInspectionMenu({ anchorEl: event.currentTarget, key: "inspector" })}>
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>Status</span>
                      <IconButton size="small" onClick={(event) => setInspectionMenu({ anchorEl: event.currentTarget, key: "status" })}>
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>Photos</span>
                      <IconButton size="small" onClick={(event) => setInspectionMenu({ anchorEl: event.currentTarget, key: "photos" })}>
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                  {inspectionDynamicColumns.map((field) => (
                    <TableCell key={`inspections-field-${field.id}`}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span style={fieldLabelStyle}>{field.name}</span>
                      </Stack>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredInspections.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>{row.seq}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{installerByInstallationId.get(row.installationId) || "Unassigned"}</TableCell>
                      <TableCell>{row.inspector}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2">{row.photoCount}</Typography>
                          <Button component="label" size="small" variant="outlined">
                            Add photo
                            <input
                              type="file"
                              hidden
                              accept="image/*"
                              onChange={async (event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                await inspectionService.uploadPhoto(row.id, file);
                                const next = { ...row, photoCount: row.photoCount + 1 };
                                setInspections((prev) => prev.map((item) => (item.id === row.id ? next : item)));
                              }}
                            />
                          </Button>
                        </Stack>
                      </TableCell>
                      {inspectionDynamicColumns.map((field) => (
                        <TableCell key={`${row.id}-${field.id}`}>
                          {inspectionsDynamic.valuesByEntity[row.id]?.[field.id]?.value || "-"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <Menu
              anchorEl={inspectionMenu.anchorEl}
              open={Boolean(inspectionMenu.anchorEl)}
              onClose={() => setInspectionMenu({ anchorEl: null, key: "" })}
            >
              <MenuItem
                onClick={() => {
                  if (inspectionMenu.key) setInspectionSort({ key: inspectionMenu.key, dir: "asc" });
                  setInspectionMenu({ anchorEl: null, key: "" });
                }}
              >
                Sort A â†’ Z
              </MenuItem>
              <MenuItem
                onClick={() => {
                  if (inspectionMenu.key) setInspectionSort({ key: inspectionMenu.key, dir: "desc" });
                  setInspectionMenu({ anchorEl: null, key: "" });
                }}
              >
                Sort Z â†’ A
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setInspectionSort({ key: "", dir: "asc" });
                  setInspectionMenu({ anchorEl: null, key: "" });
                }}
              >
                Clear sort
              </MenuItem>
              {(inspectionFilterOptions[inspectionMenu.key as keyof typeof inspectionFilterOptions] || []).map(
                (option) => {
                  const label = option || "(Blank)";
                  const selected = !!inspectionFilters[inspectionMenu.key]?.has(option);
                  return (
                    <MenuItem
                      key={`${inspectionMenu.key}-${option}`}
                      onClick={() => {
                        if (!inspectionMenu.key) return;
                        setInspectionFilters((prev) => {
                          const current = new Set(prev[inspectionMenu.key] ?? []);
                          if (current.has(option)) {
                            current.delete(option);
                          } else {
                            current.add(option);
                          }
                          return { ...prev, [inspectionMenu.key]: current };
                        });
                      }}
                    >
                      <Checkbox checked={selected} />
                      <ListItemText primary={label} />
                    </MenuItem>
                  );
                }
              )}
            </Menu>
          </Box>
        </Stack>
      )}

      {loading && (
        <Typography variant="caption" color="text.secondary">
          Loading installations...
        </Typography>
      )}

        <Dialog open={installerDialogOpen} onClose={() => setInstallerDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Create new installer</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ marginTop: 1 }}>
              <TextField
              label="Full name"
              fullWidth
              value={installerDialogData.fullName}
              onChange={(event) =>
                setInstallerDialogData((prev) => ({ ...prev, fullName: event.target.value }))
              }
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={installerDialogData.email}
              onChange={(event) =>
                setInstallerDialogData((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setInstallerDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!installerDialogData.fullName.trim() || !installerDialogData.email.trim()}
            onClick={() => {
              dispatch(
                createUser({
                  fullName: installerDialogData.fullName.trim(),
                  email: installerDialogData.email.trim(),
                  role: "Viewer",
                  office: activeOffice === "All" ? "USA" : activeOffice
                })
              );
              setFormInstallation((prev) => ({
                ...prev,
                installer: installerDialogData.fullName.trim()
              }));
              setNewInstallationForm((prev) => ({
                ...prev,
                installer: installerDialogData.fullName.trim()
              }));
              setInstallerDialogData({ fullName: "", email: "" });
              setInstallerDialogOpen(false);
            }}
          >
            Save
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={customInstallRowDialogOpen}
          onClose={() => {
            setCustomInstallRowDialogOpen(false);
            setCustomInstallRowDialogTabId(null);
            setCustomInstallRowDialogIndex(null);
            setCustomInstallRowForm({});
          }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>{customInstallRowDialogIndex !== null ? "Edit row" : "Add row"}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ marginTop: 1 }}>
              {defaultCustomColumns.map((name) => {
                const fieldId = `default:${name}`;
                const isCreatedDate = name === "Created Date";
                const value = customInstallRowForm[fieldId] ?? "";
                const inputType = getDefaultColumnType(name) === "date" ? "date" : "text";
                return (
                  <TextField
                    key={fieldId}
                    label={name}
                    type={inputType}
                    value={value}
                    InputLabelProps={inputType === "date" ? { shrink: true, sx: fieldLabelStyle } : { sx: fieldLabelStyle }}
                    disabled={isCreatedDate}
                    helperText={isCreatedDate ? "Auto-populated on creation" : undefined}
                    onChange={(event) =>
                      setCustomInstallRowForm((prev) => ({
                        ...prev,
                        [fieldId]: event.target.value
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
                setCustomInstallRowDialogOpen(false);
                setCustomInstallRowDialogTabId(null);
                setCustomInstallRowDialogIndex(null);
                setCustomInstallRowForm({});
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (!customInstallRowDialogTabId) return;
                const nextRow: Record<string, string> = {};
                const today = new Date().toISOString().slice(0, 10);
                defaultCustomColumns.forEach((name) => {
                  let val = customInstallRowForm[`default:${name}`] ?? "";
                  // Auto-populate "Created Date" on new rows
                  if (name === "Created Date" && !val && customInstallRowDialogIndex === null) {
                    val = today;
                  }
                  nextRow[name] = val;
                });
                setInstallationTabRows((prev) => {
                  const current = prev[customInstallRowDialogTabId] || [];
                  if (customInstallRowDialogIndex === null || customInstallRowDialogIndex === undefined) {
                    return {
                      ...prev,
                      [customInstallRowDialogTabId]: [...current, nextRow]
                    };
                  }
                  return {
                    ...prev,
                    [customInstallRowDialogTabId]: current.map((row, index) =>
                      index === customInstallRowDialogIndex ? { ...row, ...nextRow } : row
                    )
                  };
                });
                setCustomInstallRowDialogOpen(false);
                setCustomInstallRowDialogTabId(null);
                setCustomInstallRowDialogIndex(null);
                setCustomInstallRowForm({});
              }}
            >
              Save
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Edit installation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Job number"
              fullWidth
              value={editForm?.installationNumber || ""}
              disabled
              helperText="Primary key"
            />
            <TextField
              label="Installation name"
              fullWidth
              value={editForm?.installationName || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, installationName: event.target.value } : prev))
              }
            />
            <TextField
              label="Site Name"
              fullWidth
              value={editForm?.siteLocation || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, siteLocation: event.target.value } : prev))
              }
            />
            <FormControl fullWidth>
              <Select
                value={editForm?.status || "Not Started"}
                onChange={(event) =>
                  setEditForm((prev) => (prev ? { ...prev, status: event.target.value as Installation["status"] } : prev))
                }
              >
                {Object.keys(progressForStatus).map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Start Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={editForm?.scheduledStart || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, scheduledStart: event.target.value } : prev))
              }
            />
            <TextField
              label="Finish Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={editForm?.scheduledEnd || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, scheduledEnd: event.target.value } : prev))
              }
            />
            <Autocomplete
              options={assetTypes}
              freeSolo
              value={editForm?.machineType || ""}
              onChange={(_, value) =>
                setEditForm((prev) =>
                  prev ? { ...prev, machineType: typeof value === "string" ? value : value || "" } : prev
                )
              }
              renderInput={(params) => (
                <TextField {...params} label="Machine Type" fullWidth />
              )}
            />
            <Autocomplete
              options={installerOptionsWithAdd}
              freeSolo={false}
              value={editForm?.assignedTeam || null}
              onChange={(_, value) => {
                const nextValue = typeof value === "string" ? value : value || "";
                if (nextValue === "Add new installer...") {
                  setInstallerDialogData({ fullName: "", email: "" });
                  setInstallerDialogOpen(true);
                  return;
                }
                setEditForm((prev) => (prev ? { ...prev, assignedTeam: nextValue } : prev));
              }}
              renderInput={(params) => (
                <TextField {...params} label="Installer" fullWidth />
              )}
            />
            <TextField
              label="Installer notes"
              fullWidth
              multiline
              rows={3}
              value={editForm?.installerNotes || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, installerNotes: event.target.value } : prev))
              }
            />
            <TextField
              label="PM-1 S/N"
              fullWidth
              value={editForm?.pm1Serial || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, pm1Serial: event.target.value } : prev))
              }
            />
            <TextField
              label="PM-2 S/N"
              fullWidth
              value={editForm?.pm2Serial || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, pm2Serial: event.target.value } : prev))
              }
            />
            <TextField
              label="PM-3 S/N"
              fullWidth
              value={editForm?.pm3Serial || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, pm3Serial: event.target.value } : prev))
              }
            />
            <TextField
              label="PM-4 S/N"
              fullWidth
              value={editForm?.pm4Serial || ""}
              onChange={(event) =>
                setEditForm((prev) => (prev ? { ...prev, pm4Serial: event.target.value } : prev))
              }
            />
            <DynamicFieldsForm
              definitions={installationsDynamic.definitions}
              values={editInstallationDynamic}
              onChange={setEditInstallationDynamic}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEditOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!editForm) return;
              const updated = { ...editForm };
              try {
                const result = await dispatch(updateInstallation({ id: updated.id, payload: updated })).unwrap();
                setLocalInstallations((prev) =>
                  prev.map((item) => (item.id === result.id ? result : item))
                );
                await installationsDynamic.upsertForEntity(
                  result.id,
                  editInstallationDynamic,
                  installationsDynamic.valuesByEntity[result.id]
                );
              } catch {
                // ignore
              }
              setEditOpen(false);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        entityType="installation"
        entityLabel={deleteTarget?.installationId || deleteTarget?.installationNumber || deleteTarget?.id}
        loading={!!deleteTarget && deleteSavingId === deleteTarget.id}
        onClose={() => {
          if (deleteSavingId) return;
          setDeleteTarget(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            setDeleteSavingId(deleteTarget.id);
            await dispatch(deleteInstallation(deleteTarget.id)).unwrap();
            setLocalInstallations((prev) => prev.filter((item) => item.id !== deleteTarget.id));
            setDeleteTarget(null);
          } finally {
            setDeleteSavingId(null);
          }
        }}
      />

      <Menu
        anchorEl={installationSettingsMenu}
        open={installationSettingsMenuOpen}
        onClose={() => setInstallationSettingsMenuOpen(false)}
      >
        <MenuItem
          onClick={() => {
            setInstallationSettingsMenuOpen(false);
            setInstallationTabManagerOpen(true);
          }}
        >
          Installation Tabs Manager
        </MenuItem>
        <MenuItem
          onClick={() => {
            setInstallationSettingsMenuOpen(false);
            if (activeTabType === "installations") {
              showInstallationsPlaceholder();
              return;
            }
            setTableConfigTarget(activeTabType as "installations" | "inspections");
            setTableConfigOpen(true);
          }}
        >
          Table configuration
        </MenuItem>
        <MenuItem
            onClick={() => {
              setInstallationSettingsMenuOpen(false);
              if (activeTab?.id?.startsWith("install-tab-")) {
                const baseDefaults = createDefaultCustomRow((installationTabRows[activeTab.id] || []).length + 1);
                const nextForm: Record<string, string> = {};
                defaultCustomColumns.forEach((name) => {
                  nextForm[`default:${name}`] = (baseDefaults as Record<string, string>)[name] ?? "";
                });
                setCustomInstallRowForm(nextForm);
                setCustomInstallRowDialogTabId(activeTab.id);
                setCustomInstallRowDialogIndex(null);
                setCustomInstallRowDialogOpen(true);
                return;
              }
            if (activeTabType === "installations") {
              showInstallationsPlaceholder();
            }
          }}
        >
          Add/Create/New
        </MenuItem>
        <MenuItem onClick={() => setInstallationSettingsMenuOpen(false)}>Option 4</MenuItem>
      </Menu>

      <Dialog open={installationTabManagerOpen} onClose={() => setInstallationTabManagerOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Installation tabs</DialogTitle>
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
                {installationTabsConfig.map((item, index) => (
                  <TableRow
                    key={item.id}
                    draggable
                    onDragStart={() => setInstallationTabDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (installationTabDragIndex === null || installationTabDragIndex === index) return;
                      setInstallationTabsConfig((prev) => {
                        const next = [...prev];
                        const [moved] = next.splice(installationTabDragIndex, 1);
                        next.splice(index, 0, moved);
                        return next.map((item, position) => ({ ...item, position }));
                      });
                      setInstallationTabDragIndex(null);
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
                          setInstallationTabsConfig((prev) =>
                            prev.map((tabItem) => (tabItem.id === item.id ? { ...tabItem, label: value } : tabItem))
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" fullWidth>
                        <Select
                          value={item.type}
                          onChange={(event) => {
                            const value = event.target.value as typeof item.type;
                            setInstallationTabsConfig((prev) =>
                              prev.map((tabItem) => (tabItem.id === item.id ? { ...tabItem, type: value } : tabItem))
                            );
                          }}
                        >
                          <MenuItem value="installations">Installations</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() =>
                          setInstallationTabsConfig((prev) => prev.filter((tabItem) => tabItem.id !== item.id))
                        }
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
                value={newInstallationTabName}
                onChange={(event) => setNewInstallationTabName(event.target.value)}
              />
              <FormControl size="small">
                <Select
                  value={newInstallationTabType}
                  onChange={(event) => setNewInstallationTabType(event.target.value as typeof newInstallationTabType)}
                >
                  <MenuItem value="installations">Installations</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                onClick={() => {
                  const label = newInstallationTabName.trim() || "New Tab";
                    const newTab = {
                      id: `install-tab-${Date.now()}`,
                      label,
                      type: newInstallationTabType
                    };
                    setInstallationTabsConfig((prev) => [...prev, { ...newTab, position: prev.length }]);
                    setInstallationTabRows((prev) => ({
                      ...prev,
                      [newTab.id]: [createDefaultCustomRow(1)]
                    }));
                    setNewInstallationTabName("");
                  }}
                >
                Create tab
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setInstallationTabManagerOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkOpen} onClose={() => setBulkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Bulk add installations</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Paste CSV rows below. Each row will create a new installation.
            </Typography>
            <TextField
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              multiline
              minRows={6}
              placeholder={helperText}
              helperText={helperText}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setBulkOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleBulkAdd}>
            Add rows
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newInstallationOpen} onClose={() => setNewInstallationOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New installation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Installation name"
              fullWidth
              value={newInstallationForm.installationName}
              onChange={(event) =>
                setNewInstallationForm((prev) => ({ ...prev, installationName: event.target.value }))
              }
              error={!!modalErrors.name}
              helperText={modalErrors.name}
            />
            <TextField
              label="Job number"
              fullWidth
              value={newInstallationForm.installationNumber}
              onChange={(event) =>
                setNewInstallationForm((prev) => ({ ...prev, installationNumber: event.target.value }))
              }
              disabled
              error={!!modalErrors.jobNumber}
              helperText={modalErrors.jobNumber}
            />
            <TextField
              label="Site Name"
              fullWidth
              value={newInstallationForm.siteLocation}
              onChange={(event) =>
                setNewInstallationForm((prev) => ({ ...prev, siteLocation: event.target.value }))
              }
              error={!!modalErrors.siteLocation}
              helperText={modalErrors.siteLocation}
            />
            <Autocomplete
              options={assetTypes}
              freeSolo
              value={newInstallationForm.machineType}
              onChange={(_, value) =>
                setNewInstallationForm((prev) => ({ ...prev, machineType: typeof value === "string" ? value : value || "" }))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Machine Type"
                  fullWidth
                  error={!!modalErrors.machineType}
                  helperText={modalErrors.machineType}
                />
              )}
            />
            <TextField
              label="PM-1 S/N"
              fullWidth
              value={newInstallationForm.pm1Serial}
              onChange={(event) =>
                setNewInstallationForm((prev) => ({ ...prev, pm1Serial: event.target.value }))
              }
            />
            <TextField
              label="PM-2 S/N"
              fullWidth
              value={newInstallationForm.pm2Serial}
              onChange={(event) =>
                setNewInstallationForm((prev) => ({ ...prev, pm2Serial: event.target.value }))
              }
            />
            <TextField
              label="PM-3 S/N"
              fullWidth
              value={newInstallationForm.pm3Serial}
              onChange={(event) =>
                setNewInstallationForm((prev) => ({ ...prev, pm3Serial: event.target.value }))
              }
            />
            <TextField
              label="PM-4 S/N"
              fullWidth
              value={newInstallationForm.pm4Serial}
              onChange={(event) =>
                setNewInstallationForm((prev) => ({ ...prev, pm4Serial: event.target.value }))
              }
            />
            <Autocomplete
              options={installerOptionsWithAdd}
              freeSolo={false}
              value={newInstallationForm.installer || null}
              onChange={(_, value) => {
                const nextValue = typeof value === "string" ? value : value || "";
                if (nextValue === "Add new installer...") {
                  setInstallerDialogData({ fullName: "", email: "" });
                  setInstallerDialogOpen(true);
                  return;
                }
                setNewInstallationForm((prev) => ({ ...prev, installer: nextValue }));
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Installer"
                  fullWidth
                  error={!!modalErrors.installer}
                  helperText={modalErrors.installer}
                />
              )}
            />
            <TextField
              label="Inspector"
              fullWidth
              value={newInstallationForm.inspector}
              onChange={(event) =>
                setNewInstallationForm((prev) => ({ ...prev, inspector: event.target.value }))
              }
            />
            <DynamicFieldsForm
              definitions={installationsDynamic.definitions}
              values={modalInstallationDynamic}
              onChange={setModalInstallationDynamic}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setNewInstallationOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              const jobNumber = selectedJobNumber;
              const errors = validateInstallation({
                jobNumber,
                name: newInstallationForm.installationName.trim(),
                siteLocation: newInstallationForm.siteLocation.trim(),
                machineType: newInstallationForm.machineType.trim(),
                installer: newInstallationForm.installer.trim()
              });
              setModalErrors(errors);
              if (Object.keys(errors).length > 0) return;

              const entry: Installation = {
                id: `inst-${Date.now()}`,
                projectId: selectedProjectId || "P-1000",
                installationNumber: jobNumber || `INST-${Date.now()}`,
                installationName: newInstallationForm.installationName || undefined,
                siteLocation: newInstallationForm.siteLocation || "Unassigned",
                scheduledStart: "",
                scheduledEnd: "",
                status: "Not Started",
                assignedTeam: newInstallationForm.installer || "Unassigned",
                office: selectedProject?.office || (activeOffice === "All" ? "USA" : activeOffice),
                machineType: newInstallationForm.machineType,
                pm1Serial: newInstallationForm.pm1Serial,
                pm2Serial: newInstallationForm.pm2Serial,
                pm3Serial: newInstallationForm.pm3Serial,
                pm4Serial: newInstallationForm.pm4Serial
              };
              try {
                const result = await dispatch(createInstallation(entry)).unwrap();
                setLocalInstallations((prev) => [result, ...prev]);
                const createdInspection = await inspectionService.createInspection({
                  id: `insp-${Date.now()}`,
                  installationId: result.id,
                  name: `Inspection - ${result.installationNumber}`,
                  inspector: newInstallationForm.inspector || "Unassigned",
                  status: "Scheduled",
                  photoCount: 0,
                  scheduledDate: undefined
                });
                setInspections((prev) => [
                  { ...createdInspection, installationLabel: createdInspection.installationId },
                  ...prev
                ]);
                await installationsDynamic.upsertForEntity(
                  result.id,
                  modalInstallationDynamic,
                  installationsDynamic.valuesByEntity[result.id]
                );
                setNewInstallationForm({
                  installationName: "",
                  installationNumber: jobNumber,
                  siteLocation: "",
                  machineType: "",
                  pm1Serial: "",
                  pm2Serial: "",
                  pm3Serial: "",
                  pm4Serial: "",
                  installer: "",
                  inspector: ""
                });
                setModalInstallationDynamic({});
                setModalErrors({});
                setNewInstallationOpen(false);
              } catch {
                // keep modal open for retry
              }
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newInspectionOpen} onClose={() => setNewInspectionOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New inspection</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Inspection name"
              fullWidth
              value={newInspection.name}
              onChange={(event) => setNewInspection((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextField
              label="Installation"
              fullWidth
              value={newInspection.installation}
              onChange={(event) => setNewInspection((prev) => ({ ...prev, installation: event.target.value }))}
            />
            <TextField
              label="Inspector"
              fullWidth
              value={newInspection.inspector}
              onChange={(event) => setNewInspection((prev) => ({ ...prev, inspector: event.target.value }))}
            />
            <TextField
              label="Scheduled date"
              fullWidth
              value={newInspection.date}
              onChange={(event) => setNewInspection((prev) => ({ ...prev, date: event.target.value }))}
            />
            <DynamicFieldsForm
              definitions={inspectionsDynamic.definitions}
              values={newInspectionDynamic}
              onChange={setNewInspectionDynamic}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setNewInspectionOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const entry: Inspection = {
                id: `insp-${Date.now()}`,
                name: newInspection.name || "New inspection",
                installationId: newInspection.installation || "Unassigned",
                inspector: newInspection.inspector || "Unassigned",
                status: "Scheduled",
                photoCount: 0,
                scheduledDate: newInspection.date || undefined
              };
              inspectionService.createInspection(entry).then((created) => {
                setInspections((prev) => [
                  { ...created, installationLabel: created.installationId },
                  ...prev
                ]);
                inspectionsDynamic.upsertForEntity(
                  created.id,
                  newInspectionDynamic,
                  inspectionsDynamic.valuesByEntity[created.id]
                );
              });
              setNewInspection({ name: "", installation: "", inspector: "", date: "" });
              setNewInspectionDynamic({});
              setNewInspectionOpen(false);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={placeholderNoticeOpen}
        autoHideDuration={2500}
        onClose={() => setPlaceholderNoticeOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="info" onClose={() => setPlaceholderNoticeOpen(false)} sx={{ width: "100%" }}>
          Placeholder only. Backend action is disabled for this control.
        </Alert>
      </Snackbar>

      <TableConfigDialog
        open={tableConfigOpen}
        onClose={() => setTableConfigOpen(false)}
        title={`Table configuration: ${tableConfigTarget}`}
          availableFields={availableFieldsForTable.map((field) => ({
            id: field.id,
            name: field.name,
            fieldType: field.fieldType,
            linkToFieldId: field.linkToFieldId,
            actionType: field.actionType
          }))}
        fields={
          tableConfigTarget === "installations"
            ? installationsTableConfig.orderedFields
            : inspectionsTableConfig.orderedFields
        }
        config={
          tableConfigTarget === "installations"
            ? installationsTableConfig.config
            : inspectionsTableConfig.config
        }
        onChange={(next) => {
          if (tableConfigTarget === "installations") installationsTableConfig.setConfig(next);
          if (tableConfigTarget === "inspections") inspectionsTableConfig.setConfig(next);
        }}
        onAddField={async (fieldId) => {
          const tableName = tableConfigTarget;
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes(tableName)
            ? existing.tables
            : [...existing.tables, tableName];
          await fieldService.updateDefinition(fieldId, {
            ...existing,
            tables
          });
          await allFieldDefinitions.reload();
          if (tableName === "installations") await installationsDynamic.reload();
          if (tableName === "inspections") await inspectionsDynamic.reload();
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          const tableName = tableConfigTarget;
          await fieldService.createDefinition({
            id: "",
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null,
            tables: [tableName],
            sortOrder: allFieldDefinitions.definitions.length + 1,
            isActive: true
          });
          await allFieldDefinitions.reload();
          if (tableName === "installations") await installationsDynamic.reload();
          if (tableName === "inspections") await inspectionsDynamic.reload();
          if (type === "lookup field" && actionType === "create linked table") {
            openOrCreateInstallationLinkedTab(name);
          }
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          const tableName = tableConfigTarget;
          const defs =
            tableName === "installations"
              ? installationsDynamic.definitions
              : inspectionsDynamic.definitions;
          const existing = defs.find((item) => item.id === fieldId);
          if (!existing) return;
          await fieldService.updateDefinition(fieldId, {
            ...existing,
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null
          });
          if (tableName === "installations") await installationsDynamic.reload();
          if (tableName === "inspections") await inspectionsDynamic.reload();
          if (type === "lookup field" && actionType === "create linked table") {
            openOrCreateInstallationLinkedTab(name);
          }
        }}
        onDeleteField={async (fieldId) => {
          await fieldService.deleteDefinition(fieldId);
          if (tableConfigTarget === "installations") await installationsDynamic.reload();
          if (tableConfigTarget === "inspections") await inspectionsDynamic.reload();
        }}
      />

      <Dialog open={sameProductDialogOpen} onClose={() => setSameProductDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Projects using: {selectedProductNames}</DialogTitle>
        <DialogContent>
          {projectsUsingSameProduct.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              No other projects are using this product.
            </Typography>
          ) : (
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Job #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Office</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {projectsUsingSameProduct.map((project) => (
                  <TableRow
                    key={project.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => {
                      setSameProductDialogOpen(false);
                      setSelectedJobNumber(project.jobNumber);
                      setShowAllInstallations(false);
                      localStorage.setItem("selected_job_number", project.jobNumber);
                      localStorage.setItem("show_all_installations", "false");
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set("job", project.jobNumber);
                        return next;
                      });
                    }}
                  >
                    <TableCell>{project.jobNumber}</TableCell>
                    <TableCell>{project.customerName}</TableCell>
                    <TableCell>{project.status}</TableCell>
                    <TableCell>{project.office}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSameProductDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default InstallationList;

