import {
  Alert,
  Box,
  Button,
  Chip,
  Autocomplete,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Grid,
  InputLabel,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router-dom";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useDynamicFields } from "../../hooks/useDynamicFields";
import { useFieldDefinitions } from "../../hooks/useFieldDefinitions";
import { useTableConfig } from "../../hooks/useTableConfig";
import { isDuplicateProjectDynamicField } from "./projectFieldDedupe";
import TableConfigDialog from "../../components/TableConfigDialog";
import { projectService } from "../../services/projectService";
import { fieldService } from "../../services/fieldService";
import { siteService } from "../../services/siteService";
import { officesService } from "../../services/officesService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchCustomers } from "../../store/customersSlice";
import { fetchProducts } from "../../store/productsSlice";
import { fetchUsers } from "../../store/usersSlice";
import { createProject, updateProject } from "../../store/projectSlice";
import {
  ApprovalDecision,
  Office,
  Project,
  ProjectScheduledReport,
  ProjectScheduledReportFrequency,
  ProjectStatus,
} from "../../types/project";
import type { WorkflowType } from "../../types/workflowType";
import { workflowTypeService } from "../../services/workflowTypeService";
import {
  deriveWorkflowMode,
  findWorkflowType,
  isInspectionWorkflowType,
  isInstallationProjectMode,
  resolveProjectWorkflowTypeId,
} from "../../utils/workflowTypeRules";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import type { ProductFeatureDefinition } from "../../types/product";
import type { Office as GlobalOffice } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { randomId } from "../../utils/randomId";
import { getDeviceTimeZone, listTimeZones } from "../../utils/datetime";

const TIMEZONE_OPTIONS = listTimeZones();
import type { Site } from "../../types/site";
import type { FieldDefinition } from "../../services/fieldService";

const getLocalDateString = (offsetDays = 0) => dayjs().add(offsetDays, "day").format("YYYY-MM-DD");
const DEFAULT_WORKFLOW_TYPE_ID = "wftype-installation";
const SCHEDULE_DAY_OPTIONS = [
  { value: "M", label: "M" },
  { value: "T", label: "T" },
  { value: "W", label: "W" },
  { value: "TH", label: "T" },
  { value: "F", label: "F" },
  { value: "S", label: "S" },
  { value: "SU", label: "S" },
] as const;

function defaultScheduledReport(): ProjectScheduledReport {
  return {
    enabled: false,
    frequency: "weekly",
    daysOfWeek: ["M", "W", "F"],
    sendTimeLocal: "08:00",
    recipientEmails: [],
    assetClosedNotificationEnabled: false,
    lastSentAtUtc: null,
  };
}

function normalizeRecipientEmails(input: string): string[] {
  return input
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

const schema = z
  .object({
    customerName: z.string().optional(),
    customerId: z.string().optional(),
    siteId: z.string().optional(),
    jobNumber: z.string().optional(),
    purchaseOrderNumber: z.string().optional(),
    description: z.string().optional(),
    startDate: z.string().optional(),
    finishDate: z.string().optional(),
    office: z.string().optional(),
    region: z.string().optional(),
    timeZoneId: z.string().optional(),
    projectManager: z.string().optional(),
    projectType: z.enum(["Internal", "External"]).optional(),
    status: z
      .enum([
        "Draft",
        "In Planning",
        "Pending Approval",
        "Approved",
        "In Progress",
        "On Hold",
        "Completed",
        "Closed",
        "Cancelled"
      ])
      .optional(),
    approvalDecision: z
      .union([
        z.enum(["Approved", "Rejected"] as [ApprovalDecision, ...ApprovalDecision[]]),
        z.literal("")
      ])
      .optional(),
    workflowTypeId: z.string().min(1, "Select a workflow type"),
    productIds: z.array(z.string()).optional(),
    teamMemberIds: z.array(z.string()).optional()
  });

type FormValues = z.infer<typeof schema>;

type ProjectFormProps = {
  projectId?: string;
  embedded?: boolean;
  onClose?: () => void;
  onSaved?: (project: Project) => void;
};

const ProjectForm = ({ projectId, embedded = false, onClose, onSaved }: ProjectFormProps) => {
  const { id: routeId } = useParams();
  const id = projectId ?? routeId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const can = usePermissions();
  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.projects);
  const customersState = useAppSelector((state) => state.customers);
  const productsState = useAppSelector((state) => state.products);
  const usersState = useAppSelector((state) => state.users);
  const projectsDynamic = useDynamicFields("projects");
  const allFieldDefinitions = useFieldDefinitions();
  // Same name/id overlaps as the Projects list — otherwise built-ins render again
  // as custom fields at the bottom of the form.
  const projectsDynamicFieldDefs = useMemo(
    () => projectsDynamic.definitions.filter((field) => !isDuplicateProjectDynamicField(field)),
    [projectsDynamic.definitions],
  );
  const projectsTableConfig = useTableConfig(
    "projects",
    projectsDynamicFieldDefs.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  const availableFieldsForProjects = useMemo(
    () =>
      allFieldDefinitions.definitions.filter(
        (field) => !field.tables.includes("projects") && !isDuplicateProjectDynamicField(field),
      ),
    [allFieldDefinitions.definitions],
  );
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const saveModeRef = useRef<"draft" | "final">("final");
  const builtInLabel = useMemo(() => {
    const overrides = projectsTableConfig.config.baseFieldNames || {};
    return (id: string, fallback: string) => {
      const value = overrides[id];
      const trimmed = (value || "").trim();
      return trimmed || fallback;
    };
  }, [projectsTableConfig.config.baseFieldNames]);
  const [projectDynamicValues, setProjectDynamicValues] = useState<Record<string, string>>({});
  const [globalOffices, setGlobalOffices] = useState<GlobalOffice[]>([]);
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
  const sortedGlobalOffices = useMemo(
    () =>
      [...globalOffices].sort((a, b) =>
        (a.city || "").localeCompare(b.city || "", undefined, { numeric: true, sensitivity: "base" })
      ),
    [globalOffices]
  );
  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);
  const customers = customersState.items;
  const filteredCustomers = useMemo(() => {
    return customers;
  }, [customers]);
  const products = productsState.items;
  const editingProject = useMemo(() => items.find((item) => item.id === id) ?? null, [id, items]);
  const canEditExistingProject = useMemo(() => {
    if (!id) return true;
    if (!editingProject || !user) return false;
    if (can.projects?.editScope === "all") return true;
    if (can.projects?.editScope === "own") return editingProject.assignedPmUserId === user.id;
    return false;
  }, [editingProject, id, user, can.projects?.editScope]);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
    setError,
    setValue,
    setFocus,
    getValues,
    clearErrors
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "",
      customerId: "",
      siteId: "",
      jobNumber: "",
      purchaseOrderNumber: "",
      description: "",
      startDate: getLocalDateString(),
      finishDate: "",
      office: "",
      region: "",
      timeZoneId: getDeviceTimeZone(),
      projectManager: "",
      projectType: "Internal",
      status: "Draft",
      approvalDecision: "",
      workflowTypeId: DEFAULT_WORKFLOW_TYPE_ID,
      productIds: [],
      teamMemberIds: []
    }
  });

  const handleClose = () => {
    if (embedded) {
      onClose?.();
      return;
    }
    navigate("/projects");
  };

  useEffect(() => {
    dispatch(fetchCustomers());
    dispatch(fetchProducts());
    dispatch(fetchUsers());
  }, [dispatch]);

  useEffect(() => {
    officesService.getAll().then(setGlobalOffices);
    workflowTypeService.list().then(setWorkflowTypes).catch(() => setWorkflowTypes([]));
  }, []);

  useEffect(() => {
    if (!id) {
      setScheduledReport(defaultScheduledReport());
      setScheduledRecipientsInput("");
      reset({
        customerName: "",
        customerId: "",
        siteId: "",
        jobNumber: "",
        purchaseOrderNumber: "",
        description: "",
        startDate: getLocalDateString(),
        finishDate: "",
        office: "",
        region: "",
        timeZoneId: getDeviceTimeZone(),
        projectManager: "",
        projectType: "Internal",
        status: "Draft",
        approvalDecision: "",
        workflowTypeId: DEFAULT_WORKFLOW_TYPE_ID,
        productIds: [],
        teamMemberIds: []
      });
      return;
    }

    const localProject = items.find((item) => item.id === id);
    if (localProject) {
      reset({
        customerName: localProject.customerName,
        customerId: localProject.customerId,
        siteId: localProject.siteId || "",
        jobNumber: localProject.jobNumber,
        purchaseOrderNumber: localProject.purchaseOrderNumber || "",
        description: localProject.description,
        startDate: localProject.startDate,
        finishDate: localProject.finishDate,
        office: localProject.officeId || globalOffices.find((o) => o.city === localProject.office)?.id || "",
        region: localProject.region,
        timeZoneId: localProject.timeZoneId || getDeviceTimeZone(),
        projectManager: localProject.projectManager,
        projectType: localProject.projectType,
        status: localProject.status,
        approvalDecision: localProject.approvalDecision || "",
        workflowTypeId: resolveProjectWorkflowTypeId(localProject),
        productIds: localProject.productIds ?? [],
        teamMemberIds: localProject.teamMemberIds ?? []
      });
      setProductFeatureValues(localProject.productFeatureValues || {});
      const nextScheduled = localProject.scheduledReport ?? defaultScheduledReport();
      setScheduledReport(nextScheduled);
      setScheduledRecipientsInput((nextScheduled.recipientEmails ?? []).join("\n"));
    }

    projectService.getProject(id).then((project) => {
      if (!project) return;
      reset({
        customerName: project.customerName,
        customerId: project.customerId,
        siteId: project.siteId || "",
        jobNumber: project.jobNumber,
        purchaseOrderNumber: project.purchaseOrderNumber || "",
        description: project.description,
        startDate: project.startDate || getLocalDateString(),
        finishDate: project.finishDate,
        office: project.officeId || globalOffices.find((o) => o.city === project.office)?.id || "",
        region: project.region,
        timeZoneId: project.timeZoneId || getDeviceTimeZone(),
        projectManager: project.projectManager,
        projectType: project.projectType,
        status: project.status,
        approvalDecision: project.approvalDecision || "",
        workflowTypeId: resolveProjectWorkflowTypeId(project),
        productIds: project.productIds ?? [],
        teamMemberIds: project.teamMemberIds ?? []
      });
      setProductFeatureValues(project.productFeatureValues || {});
      const nextScheduled = project.scheduledReport ?? defaultScheduledReport();
      setScheduledReport(nextScheduled);
      setScheduledRecipientsInput((nextScheduled.recipientEmails ?? []).join("\n"));
    });
  }, [id, items, reset, globalOffices]);

  useEffect(() => {
    if (!embedded && id && editingProject && !canEditExistingProject) {
      navigate(`/projects/${id}`);
    }
  }, [canEditExistingProject, editingProject, embedded, id, navigate]);

  useEffect(() => {
    if (projectsDynamicFieldDefs.length === 0) return;
    setProjectDynamicValues((prev) => {
      const next = { ...prev };
      projectsDynamicFieldDefs.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
  }, [projectsDynamicFieldDefs]);

  useEffect(() => {
    if (!id) return;
    const existing = projectsDynamic.valuesByEntity[id] || {};
    const next: Record<string, string> = {};
    projectsDynamicFieldDefs.forEach((field) => {
      next[field.id] = existing[field.id]?.value || "";
    });
    setProjectDynamicValues(next);
  }, [id, projectsDynamicFieldDefs, projectsDynamic.valuesByEntity]);


  const projectType = watch("projectType");
  const workflowTypeId = watch("workflowTypeId");
  const selectedWorkflowType = useMemo(
    () => findWorkflowType(workflowTypes, workflowTypeId),
    [workflowTypeId, workflowTypes],
  );
  const isLegacyMixedProject = Boolean(
    id && items.find((item) => item.id === id)?.workflowMode === "MIXED" && !resolveProjectWorkflowTypeId(items.find((item) => item.id === id)!),
  );
  const customerId = watch("customerId");
  const siteId = watch("siteId");
  const office = watch("office");
  const projectManager = watch("projectManager");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesLoadError, setSitesLoadError] = useState<string | null>(null);
  const [dynamicFieldErrors, setDynamicFieldErrors] = useState<Record<string, string>>({});
  const [globalOfficePrompt, setGlobalOfficePrompt] = useState<{ country: string; managerName: string } | null>(null);
  const [productFeatureValues, setProductFeatureValues] = useState<Record<string, string>>({});
  const [scheduledReport, setScheduledReport] = useState<ProjectScheduledReport>(defaultScheduledReport);
  const [scheduledRecipientsInput, setScheduledRecipientsInput] = useState("");

  useEffect(() => {
    setSitesLoading(true);
    setSitesLoadError(null);
    siteService
      // When no customer is selected yet, show all sites. Once a customer is selected, show only that customer's sites.
      .getSites(selectedCustomerId || undefined)
      .then((rows) => {
        const sorted = [...rows].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" })
        );
        setAllSites(sorted);
      })
      .catch(() => {
        setAllSites([]);
        setSitesLoadError("Unable to load sites (API unavailable).");
      })
      .finally(() => {
        setSitesLoading(false);
      });
  }, [selectedCustomerId]);

  const matchedCustomerId = useMemo(() => {
    if (!customerId) return "";
    return filteredCustomers.find((customer) => customer.customerId === customerId)?.id || "";
  }, [filteredCustomers, customerId]);

  useEffect(() => {
    if (!selectedCustomerId && matchedCustomerId) {
      setSelectedCustomerId(matchedCustomerId);
    }
  }, [matchedCustomerId, selectedCustomerId]);


  useEffect(() => {
    if (!selectedCustomerId) return;
    const selected = filteredCustomers.find((customer) => customer.id === selectedCustomerId);
    if (!selected) return;
    setValue("customerName", selected.name, { shouldValidate: true });
    setValue("customerId", selected.customerId, { shouldValidate: true });
  }, [selectedCustomerId, filteredCustomers, setValue]);

  useEffect(() => {
    const managerName = String(projectManager || "").trim();
    if (!managerName) {
      setValue("region", "", { shouldValidate: true });
      return;
    }
    if (globalOffices.length === 0 || usersState.items.length === 0) return;

    const selectedManager = usersState.items.find(
      (user) => String(user.fullName || "").trim().toLowerCase() === managerName.toLowerCase()
    );
    if (!selectedManager) return;

    const managerOfficeRaw = String(selectedManager.office || "").trim();
    if (!managerOfficeRaw || managerOfficeRaw.toLowerCase() === "all") return;

    const managerCountry = countryForOffice(managerOfficeRaw);
    if (!managerCountry) return;

    // Resolve manager's office string (city/country) to a GlobalOffice entity → store its id
    let resolvedOffice: (typeof globalOffices)[number] | undefined;
    resolvedOffice = globalOffices.find(
      (o) => (o.city || "").trim().toLowerCase() === managerOfficeRaw.toLowerCase()
    );
    if (!resolvedOffice) {
      const possibleCity = managerOfficeRaw.split(",")[0]?.trim();
      resolvedOffice = globalOffices.find(
        (o) => (o.city || "").trim().toLowerCase() === String(possibleCity || "").toLowerCase()
      );
    }
    if (!resolvedOffice) {
      resolvedOffice = globalOffices.find(
        (o) => (o.country || "").trim().toLowerCase() === managerCountry.toLowerCase() && !!o.city
      );
    }

    if (resolvedOffice) {
      setValue("office", resolvedOffice.id, { shouldValidate: true });
    }
    setValue("region", managerCountry, { shouldValidate: true });

    if (
      activeOffice !== "All" &&
      managerCountry &&
      activeOffice.toLowerCase() !== managerCountry.toLowerCase()
    ) {
      setGlobalOfficePrompt((prev) => {
        if (prev && prev.country.toLowerCase() === managerCountry.toLowerCase()) return prev;
        return { country: managerCountry, managerName };
      });
    } else {
      setGlobalOfficePrompt(null);
    }
  }, [projectManager, usersState.items, globalOffices, countryForOffice, setValue, activeOffice]);

  const pushUiLog = (message: string, error?: string) => {
    const anyWindow = window as typeof window & { __apiDebugLogs?: Array<{ id: string; time: string; method?: string; url?: string; status?: number; error?: string }> };
    if (!anyWindow.__apiDebugLogs) {
      anyWindow.__apiDebugLogs = [];
    }
    anyWindow.__apiDebugLogs.push({
      id: randomId(),
      time: new Date().toLocaleTimeString(),
      method: "UI",
      url: message,
      status: 0,
      error
    });
    window.dispatchEvent(new Event("api-debug-log"));
  };

  const onSubmit = async (data: FormValues) => {
    setDynamicFieldErrors({});
    setSubmitError(null);
    // Validate required fields based on table configuration (admin-controlled).
    const hiddenSet = new Set(projectsTableConfig.config.hidden || []);
    const meta = projectsTableConfig.config.baseFieldMeta || {};
    const missing: string[] = [];

    const isRequired = (fieldId: string) => !!meta[fieldId]?.required && !hiddenSet.has(fieldId);
    const isBlank = (value: unknown) => String(value ?? "").trim() === "";
    const requestedDecision = data.approvalDecision || undefined;
    const currentSaveMode = saveModeRef.current;
    const derivedStatus: ProjectStatus =
      currentSaveMode === "draft"
        ? "Draft"
        : requestedDecision === "Approved"
        ? "Approved"
        : requestedDecision === "Rejected"
        ? "Cancelled"
        : ((data.status as ProjectStatus | undefined) || "Draft");
    const shouldEnforceRequiredFields = derivedStatus !== "Draft";

    if (shouldEnforceRequiredFields && isRequired("customerName") && !selectedCustomerId) {
      // customerName is driven by the separate Select (selectedCustomerId), so set an explicit form error.
      setError("customerName", { type: "required", message: `${labelCustomer} is required` });
      missing.push(labelCustomer);
    }
    if (shouldEnforceRequiredFields && isRequired("customerId") && isBlank(data.customerId)) {
      setError("customerId", { type: "required", message: `${labelCustomerId} is required` });
      missing.push(labelCustomerId);
    }
    if (shouldEnforceRequiredFields && isRequired("siteName") && isBlank(data.siteId)) {
      setError("siteId", { type: "required", message: `${labelSite} is required` });
      missing.push(labelSite);
    }
    if (shouldEnforceRequiredFields && isRequired("jobNumber") && isBlank(data.jobNumber)) {
      setError("jobNumber", { type: "required", message: `${labelJobNumber} is required` });
      missing.push(labelJobNumber);
    }
    if (shouldEnforceRequiredFields && isRequired("description") && isBlank(data.description)) {
      setError("description", { type: "required", message: `${labelDescription} is required` });
      missing.push(labelDescription);
    }
    if (shouldEnforceRequiredFields && isRequired("startDate") && isBlank(data.startDate)) {
      setError("startDate", { type: "required", message: `${labelStartDate} is required` });
      missing.push(labelStartDate);
    }
    if (shouldEnforceRequiredFields && isRequired("finishDate") && isBlank(data.finishDate)) {
      setError("finishDate", { type: "required", message: `${labelFinishDate} is required` });
      missing.push(labelFinishDate);
    }
    if (shouldEnforceRequiredFields && isRequired("office") && isBlank(data.office)) {
      setError("office", { type: "required", message: `${labelOffice} is required` });
      missing.push(labelOffice);
    }
    if (shouldEnforceRequiredFields && isRequired("region") && isBlank(data.region)) {
      setError("region", { type: "required", message: `${labelRegion} is required` });
      missing.push(labelRegion);
    }
    if (shouldEnforceRequiredFields && isRequired("projectManager") && isBlank(data.projectManager)) {
      setError("projectManager", { type: "required", message: `${labelProjectManager} is required` });
      missing.push(labelProjectManager);
    }
    if (shouldEnforceRequiredFields && isRequired("projectType") && isBlank(data.projectType)) {
      setError("projectType", { type: "required", message: `${labelProjectType} is required` });
      missing.push(labelProjectType);
    }
    if (shouldEnforceRequiredFields && isRequired("products") && (!data.productIds || data.productIds.length === 0)) {
      setError("productIds", { type: "required", message: `${labelProducts} is required` });
      missing.push(labelProducts);
    }

    if (shouldEnforceRequiredFields && isBlank(data.workflowTypeId)) {
      setError("workflowTypeId", { type: "required", message: "Workflow type is required" });
      missing.push("Workflow type");
    }

    const dynamicValueForValidation = (def: FieldDefinition) => {
      const type = (def.fieldType || "").toLowerCase();
      if (type === "lookup field" && def.linkToFieldId) {
        const target = allDefinitionsById.get(def.linkToFieldId);
        const targetIsSites = !!target && (target.tables || []).includes("sites");
        const looksLikeCity = /city/i.test(def.name || "") || /city/i.test(def.id || "");
        if (targetIsSites && looksLikeCity) {
          return allSites.find((s) => s.id === data.siteId)?.city || "";
        }
      }
      return projectDynamicValues[def.id] || "";
    };

    // Dynamic fields required flags are stored in baseFieldMeta by field id.
    if (shouldEnforceRequiredFields) {
      const missingDynamicDefs = projectsDynamicFieldDefs
        .filter((def) => !!meta[def.id]?.required && !hiddenSet.has(def.id))
        .filter((def) => isBlank(dynamicValueForValidation(def)))
        .map((def) => ({ id: def.id, name: def.name }));
      if (missingDynamicDefs.length) {
        const nextErrors: Record<string, string> = {};
        missingDynamicDefs.forEach((def) => {
          nextErrors[def.id] = `${def.name} is required`;
        });
        setDynamicFieldErrors(nextErrors);
        missing.push(...missingDynamicDefs.map((d) => d.name));
      }
    }

    if (missing.length) {
      setSubmitError(`Missing required fields: ${Array.from(new Set(missing)).join(", ")}`);
      pushUiLog("ProjectForm submit blocked", "Missing required fields");
      return;
    }

    const selected = filteredCustomers.find((customer) => customer.id === selectedCustomerId);
    if (shouldEnforceRequiredFields && !selected) {
      // Customer selection can be hidden/optional; only block if a dependent field is required.
      if (isRequired("customerName") || isRequired("customerId") || isRequired("siteName")) {
        setSubmitError(`Select a ${labelCustomer.toLowerCase()} before submitting.`);
        pushUiLog("ProjectForm submit blocked", "Missing customer");
        return;
      }
    }
    pushUiLog("ProjectForm submit");
    const dynamicValuesToSave = { ...projectDynamicValues };
    projectsDynamicFieldDefs.forEach((def) => {
      const type = (def.fieldType || "").toLowerCase();
      if (type !== "lookup field" || !def.linkToFieldId) return;
      const target = allDefinitionsById.get(def.linkToFieldId);
      const targetIsSites = !!target && (target.tables || []).includes("sites");
      const looksLikeCity = /city/i.test(def.name || "") || /city/i.test(def.id || "");
      if (targetIsSites && looksLikeCity) {
        dynamicValuesToSave[def.id] = allSites.find((s) => s.id === data.siteId)?.city || "";
      }
    });

    const selectedType = findWorkflowType(workflowTypes, data.workflowTypeId);
    const derivedMode = selectedType ? deriveWorkflowMode(selectedType) : "INSTALLATION_ONLY";

    const payload: Project = {
      id: id || `P-${Math.floor(Math.random() * 10000)}`,
      customerName: selected?.name || "",
      customerId: selected?.customerId || "",
      siteId: data.siteId || undefined,
      jobNumber: data.jobNumber || "",
      purchaseOrderNumber: data.purchaseOrderNumber || "",
      description: data.description || "",
      startDate: data.startDate || getLocalDateString(),
      finishDate: data.finishDate || "",
      officeId: data.office || undefined,
      office: globalOffices.find((o) => o.id === data.office)?.city || data.office || "",
      region: data.region,
      timeZoneId: data.timeZoneId || undefined,
      projectType: (data.projectType as any) || "Internal",
      status: derivedStatus,
      approvalDecision: requestedDecision,
      workflowTypeId: data.workflowTypeId,
      workflowMode: derivedMode,
      isInstallationProject: isInstallationProjectMode(derivedMode),
      projectManager: data.projectManager,
      productIds: data.productIds ?? [],
      teamMemberIds: data.teamMemberIds ?? [],
      productFeatureValues,
      scheduledReport: {
        ...scheduledReport,
        recipientEmails: normalizeRecipientEmails(scheduledRecipientsInput),
      },
    };

    try {
      let savedProject: Project | null = null;
      if (id && !canEditExistingProject) {
        setSubmitError("You don't have permission to edit this project.");
        return;
      }
      if (id) {
        const result = await dispatch(updateProject({ id, payload })).unwrap();
        savedProject = result;
        await projectsDynamic.upsertForEntity(
          result.id,
          dynamicValuesToSave,
          projectsDynamic.valuesByEntity[result.id]
        );
      } else {
        const result = await dispatch(createProject(payload)).unwrap();
        savedProject = result;
        await projectsDynamic.upsertForEntity(
          result.id,
          dynamicValuesToSave,
          projectsDynamic.valuesByEntity[result.id]
        );
        // Clone assets from selected source project if PM chose one
        if (pendingCloneSourceId) {
          try {
            setCloning(true);
            await projectService.cloneAssetsFrom(result.id, pendingCloneSourceId);
          } catch {
            // Non-fatal: project was created; log but don't block navigation
            console.warn("[ProjectForm] Clone assets failed — project was still created successfully.");
          } finally {
            setCloning(false);
          }
        }
      }
      if (savedProject) onSaved?.(savedProject);
      handleClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) {
        setSubmitError("You don't have permission to save projects. Contact your Project Manager or Admin.");
      } else {
        setSubmitError("Unable to save project. Check API availability.");
      }
      pushUiLog("ProjectForm submit failed", "API error");
    }
  };

  const onInvalid = (formErrors: Record<string, unknown>) => {
    const fields = Object.keys(formErrors).join(", ") || "unknown";
    const keys = Object.keys(formErrors);
    const labelByName: Record<string, string> = {
      customerName: labelCustomer,
      customerId: labelCustomerId,
      siteId: labelSite,
      jobNumber: labelJobNumber,
      description: labelDescription,
      startDate: labelStartDate,
      finishDate: labelFinishDate,
      office: labelOffice,
      region: labelRegion,
      projectManager: labelProjectManager,
      teamMemberIds: labelTeamMembers,
      projectType: labelProjectType,
      status: labelStatus,
      workflowTypeId: "Workflow type",
      productIds: labelProducts,
      approvalDecision: "Approval Decision"
    };
    const missingLabels = keys.map((key) => labelByName[key] || key);
    setSubmitError(
      `Please complete the required fields before submitting.${missingLabels.length ? ` Missing/invalid: ${missingLabels.join(", ")}` : ""}`
    );
    pushUiLog("ProjectForm validation failed", fields);

    // Best-effort focus/scroll to first invalid input.
    const first = keys[0];
    if (first) {
      try {
        // @ts-expect-error setFocus expects a Path<FormValues>
        setFocus(first);
      } catch {
        // ignore
      }
      try {
        const el = document.querySelector(`[name="${CSS.escape(first)}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        // ignore
      }
    }
  };

  const runSave = (mode: "draft" | "final") => {
    saveModeRef.current = mode;
    if (mode === "draft") {
      clearErrors();
      setDynamicFieldErrors({});
      setSubmitError(null);
      setValue("approvalDecision", "", { shouldValidate: false });
      setValue("status", "Draft", { shouldValidate: false });
      void onSubmit({
        ...getValues(),
        approvalDecision: "",
        status: "Draft"
      });
      return;
    }
    void handleSubmit(onSubmit, onInvalid)();
  };

  const handleCustomerSelect = (value: string) => {
    if (!value) {
      setSelectedCustomerId("");
      setValue("customerName", "", { shouldValidate: true });
      setValue("customerId", "", { shouldValidate: true });
      setValue("siteId", "", { shouldValidate: true });
      return;
    }
    const selected = customers.find((customer) => customer.id === value);
    if (selected) {
      setSelectedCustomerId(selected.id);
      setValue("customerName", selected.name, { shouldValidate: true });
      setValue("customerId", selected.customerId, { shouldValidate: true });
      if (selected.office && selected.office !== "All") {
        const officeByCity = globalOffices.find((o) => o.city === selected.office);
        if (officeByCity) {
          setValue("office", officeByCity.id, { shouldValidate: true });
        } else {
          const defaultOffice = globalOffices.find(
            (o) => (o.country || "").toLowerCase() === selected.office.toLowerCase() && !!o.city
          );
          if (defaultOffice) setValue("office", defaultOffice.id, { shouldValidate: true });
        }
      }
    }
  };

  // Keep Site in sync:
  // - If a site is selected and belongs to a different customer, switch customer automatically.
  // - If a customer is selected and no site is selected (or site doesn't belong), auto-pick the first site for that customer.
  useEffect(() => {
    if (!siteId) return;
    const selectedSite = allSites.find((s) => s.id === siteId);
    if (!selectedSite) return;
    if (selectedSite.customerId && selectedSite.customerId !== selectedCustomerId) {
      handleCustomerSelect(selectedSite.customerId);
    }
  }, [siteId, allSites, selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    const currentSite = siteId ? allSites.find((s) => s.id === siteId) : null;
    if (currentSite && currentSite.customerId === selectedCustomerId) return;
    const first = allSites.find((s) => s.customerId === selectedCustomerId);
    if (first) {
      setValue("siteId", first.id, { shouldValidate: true });
    }
  }, [selectedCustomerId, allSites, siteId, setValue]);

  const [submitError, setSubmitError] = useState<string | null>(null);

  // Clone suggestion — shows when a new project shares a customer or site with existing ones
  const [cloneSuggestOpen, setCloneSuggestOpen] = useState(false);
  const [cloneCandidates, setCloneCandidates] = useState<{ id: string; jobNumber: string; customerName: string; siteName?: string; assetCount: number }[]>([]);
  const [pendingCloneSourceId, setPendingCloneSourceId] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  // Detect matching projects whenever customer or site changes on a NEW project
  useEffect(() => {
    if (id) return; // only on create
    const cid = watch("customerId");
    const sid = watch("siteId");
    if (!cid && !sid) { setCloneCandidates([]); return; }
    const matches = items.filter((p) => {
      if (p.id === id) return false;
      if (cid && p.customerId === cid) return true;
      if (sid && p.siteId && p.siteId === sid) return true;
      return false;
    });
    setCloneCandidates(
      matches.map((p) => ({
        id: p.id,
        jobNumber: p.jobNumber,
        customerName: p.customerName,
        siteName: (p as any).siteName || undefined,
        assetCount: (p as any).assetCount || 0,
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId, siteId, id, items]);

  // Open the suggestion dialog once when candidates first appear (new project).
  useEffect(() => {
    if (id) return;
    if (cloneCandidates.length === 0) return;
    setCloneSuggestOpen((prev) => {
      if (prev) return prev; // already open
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloneCandidates.length > 0, id]);

  const labelCustomer = builtInLabel("customerName", "Customer");
  const labelCustomerId = builtInLabel("customerId", "Customer ID");
  const labelSite = builtInLabel("siteName", "Site");
  const labelProducts = builtInLabel("products", "Product name");
  const labelJobNumber = builtInLabel("jobNumber", "Job Number");
  const labelPurchaseOrderNumber = builtInLabel("purchaseOrderNumber", "Purchase Order Number");
  const labelOffice = builtInLabel("office", "Office");
  const labelRegion = builtInLabel("region", "Global office in charge");
  const labelProjectManager = builtInLabel("projectManager", "Project Manager");
  const labelTeamMembers = builtInLabel("teamMembers", "Project Team Members");
  const labelDescription = builtInLabel("description", "Description");
  const labelStartDate = builtInLabel("startDate", "Start Date");
  const labelFinishDate = builtInLabel("finishDate", "Finish Date");
  const labelStatus = builtInLabel("status", "Status");
  const labelProjectType = builtInLabel("projectType", "Project Type");
  const baseFieldIds = useMemo(
    () => [
      "jobNumber",
      "purchaseOrderNumber",
      "customerName",
      "siteName",
      "customerId",
      "products",
      "office",
      "timeZoneId",
      "projectManager",
      "region",
      "teamMembers",
      "description",
      "startDate",
      "finishDate",
      "status",
      "projectType"
    ],
    []
  );
  const hiddenSet = useMemo(() => new Set(projectsTableConfig.config.hidden || []), [projectsTableConfig.config.hidden]);
  const baseFieldMeta = projectsTableConfig.config.baseFieldMeta || {};
  const isRequiredField = (fieldId: string) => !!baseFieldMeta[fieldId]?.required && !hiddenSet.has(fieldId);
  const labelWithRequired = (fieldId: string, label: string) => (isRequiredField(fieldId) ? `${label} *` : label);
  const projectManagerOptions = useMemo(() => {
    const userNames = usersState.items
      .filter((user) => {
        if (!user.isActive) return false;
        const role = String(user.role || "").trim().toLowerCase();
        return role === "project manager" || role === "pm";
      })
      .map((user) => user.fullName)
      .filter((name): name is string => !!name && !!name.trim());
    // Keep a previously saved name selectable even if that user is inactive / role-changed.
    const current = String(projectManager || "").trim();
    if (current && !userNames.some((n) => n.toLowerCase() === current.toLowerCase())) {
      userNames.push(current);
    }
    return Array.from(new Set(userNames)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
    );
  }, [usersState.items, projectManager]);
  const activeUserOptions = useMemo(() => {
    return [...usersState.items]
      .filter((user) => user.isActive && !!String(user.fullName || "").trim())
      .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base", numeric: true }));
  }, [usersState.items]);
  const selectedProductId = watch("productIds")?.[0] || "";
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId),
    [products, selectedProductId]
  );

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const siteOptions = useMemo(() => {
    const selectedFirst = (site: Site) => (selectedCustomerId && site.customerId === selectedCustomerId ? 0 : 1);
    return [...allSites].sort((a, b) => {
      const aGroup = selectedFirst(a);
      const bGroup = selectedFirst(b);
      if (aGroup !== bGroup) return aGroup - bGroup;
      const aCustomer = customerNameById.get(a.customerId) || "";
      const bCustomer = customerNameById.get(b.customerId) || "";
      const byCustomer = aCustomer.localeCompare(bCustomer, undefined, { numeric: true, sensitivity: "base" });
      if (byCustomer !== 0) return byCustomer;
      return (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" });
    });
  }, [allSites, selectedCustomerId, customerNameById]);

  const dynamicDefById = useMemo(
    () => new Map(projectsDynamicFieldDefs.map((def) => [def.id, def])),
    [projectsDynamicFieldDefs]
  );
  const allDefinitionsById = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    allFieldDefinitions.definitions.forEach((def) => map.set(def.id, def));
    return map;
  }, [allFieldDefinitions.definitions]);

  const orderedVisibleIds = useMemo(() => {
    const dynamicIds = projectsDynamicFieldDefs.map((def) => def.id);
    const allIds = [...baseFieldIds, ...dynamicIds];

    let order: string[];
    if (projectsTableConfig.config.order?.length) {
      order = [...projectsTableConfig.config.order];
      const remaining = allIds.filter((id) => !order.includes(id));
      order = [...order, ...remaining];
    } else {
      order = allIds;
    }

    // Filter unknown ids and hidden ids.
    const known = new Set(allIds);
    return order.filter((id) => known.has(id) && !hiddenSet.has(id));
  }, [projectsTableConfig.config.order, baseFieldIds, projectsDynamicFieldDefs, hiddenSet]);
  const visibleIdSet = useMemo(() => new Set(orderedVisibleIds), [orderedVisibleIds]);
  const cityFieldId = useMemo(() => {
    return projectsDynamicFieldDefs.find((def) => {
      const type = (def.fieldType || "").toLowerCase();
      if (type !== "lookup field") return false;
      if (!/city/i.test(def.name || "") && !/city/i.test(def.id || "")) return false;
      if (!def.linkToFieldId) return false;
      const target = allDefinitionsById.get(def.linkToFieldId);
      return !!target && (target.tables || []).includes("sites");
    })?.id;
  }, [projectsDynamicFieldDefs, allDefinitionsById]);
  const extraDynamicIds = useMemo(() => {
    const excluded = new Set([cityFieldId || ""]);
    return orderedVisibleIds.filter((id) => !baseFieldIds.includes(id) && !excluded.has(id));
  }, [orderedVisibleIds, baseFieldIds, cityFieldId]);

  const getDynamicInputType = (fieldType: string) => {
    switch (fieldType) {
      case "number":
      case "currency":
      case "percentage":
        return "number";
      case "date":
        return "date";
      case "email":
        return "email";
      case "phone":
        return "tel";
      default:
        return "text";
    }
  };

  const renderFormField = (fieldId: string) => {
    // Base/built-in fields (form controls).
    switch (fieldId) {
      case "customerName":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <FormControl fullWidth error={!!errors.customerName}>
              <FormLabel>{labelWithRequired("customerName", labelCustomer)}</FormLabel>
              <Select
                value={selectedCustomerId}
                displayEmpty
                onChange={(event) => handleCustomerSelect(event.target.value)}
              >
                <MenuItem value="">Select existing {labelCustomer.toLowerCase()}</MenuItem>
                {filteredCustomers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {errors.customerName?.message ||
                  `Choose a ${labelCustomer.toLowerCase()} to auto-fill ${labelCustomerId.toLowerCase()} and filter sites.`}
              </FormHelperText>
            </FormControl>
          </Grid>
        );
      case "products":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <FormControl fullWidth error={!!errors.productIds}>
              <FormLabel>{labelWithRequired("products", labelProducts)}</FormLabel>
              <Controller
                name="productIds"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value?.[0] ?? ""}
                    onChange={(event) => field.onChange(event.target.value ? [event.target.value as string] : [])}
                    displayEmpty
                  >
                    <MenuItem value="">Select a product</MenuItem>
                    {products.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        <ListItemText primary={product.name} />
                      </MenuItem>
                    ))}
                  </Select>
                )}
              />
              <FormHelperText>
                {errors.productIds?.message || "Select the primary product for this project."}
              </FormHelperText>
            </FormControl>
          </Grid>
        );
      case "customerId":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="customerId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("customerId", labelCustomerId)}
                  fullWidth
                  error={!!errors.customerId}
                  helperText={errors.customerId?.message || `Auto-filled from ${labelCustomer.toLowerCase()}.`}
                  InputProps={{ readOnly: true }}
                />
              )}
            />
          </Grid>
        );
      case "siteName":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="siteId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("siteName", labelSite)}
                  fullWidth
                  select
                  SelectProps={{ native: true }}
                  InputLabelProps={{ shrink: true }}
                  error={!!errors.siteId}
                  helperText={
                    errors.siteId?.message ||
                    sitesLoadError ||
                    (sitesLoading ? "Loading sites..." : "Optional. Link this project to a site.")
                  }
                  onChange={(event) => {
                    const nextId = String(event.target.value || "");
                    // RHF expects the value (string). Passing the full event here can cause state thrash/flicker.
                    field.onChange(nextId);
                    const nextSite = allSites.find((s) => s.id === nextId);
                    if (nextSite && nextSite.customerId && nextSite.customerId !== selectedCustomerId) {
                      handleCustomerSelect(nextSite.customerId);
                    }
                  }}
                >
                  <option value="">(No site)</option>
                  {sitesLoading && <option value="" disabled>(Loading...)</option>}
                  {!sitesLoading && allSites.length === 0 && <option value="" disabled>(No sites found)</option>}
                  {siteOptions.map((site) => {
                    const customerName = customerNameById.get(site.customerId) || "Customer";
                    return (
                      <option key={site.id} value={site.id}>
                        {customerName} - {site.name}
                      </option>
                    );
                  })}
                </TextField>
              )}
            />
          </Grid>
        );
      case "jobNumber":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="jobNumber"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("jobNumber", labelJobNumber)}
                  fullWidth
                  error={!!errors.jobNumber}
                  helperText={
                    errors.jobNumber?.message || "Internal job number used for installations and reporting."
                  }
                />
              )}
            />
          </Grid>
        );
      case "purchaseOrderNumber":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="purchaseOrderNumber"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("purchaseOrderNumber", labelPurchaseOrderNumber)}
                  fullWidth
                  helperText="Customer PO or order reference number (used for Quickbase goods movements lookup)."
                />
              )}
            />
          </Grid>
        );
      case "office":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="office"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("office", labelOffice)}
                  fullWidth
                  select
                  SelectProps={{ native: true }}
                  InputLabelProps={{ shrink: true }}
                  error={!!errors.office}
                  helperText={
                    errors.office?.message || "Office city responsible for this project (sets Country/State)."
                  }
                >
                  <option value="">Select office</option>
                  {sortedGlobalOffices.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.city}{office.country ? `, ${office.country}` : ""}
                    </option>
                  ))}
                </TextField>
              )}
            />
          </Grid>
        );
      case "region":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="region"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("region", labelRegion)}
                  fullWidth
                  error={!!errors.region}
                  helperText={
                    errors.region?.message ||
                    "Auto-filled from the selected project manager's office."
                  }
                  InputProps={{ readOnly: true }}
                />
              )}
            />
          </Grid>
        );
      case "timeZoneId":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="timeZoneId"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={TIMEZONE_OPTIONS}
                  value={field.value || null}
                  onChange={(_, v) => field.onChange(v ?? "")}
                  autoHighlight
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={labelWithRequired("timeZoneId", "Project Time Zone")}
                      fullWidth
                      error={!!errors.timeZoneId}
                      helperText={
                        errors.timeZoneId?.message ||
                        "Reports show wall-clock times in this zone. Defaults to your device zone."
                      }
                    />
                  )}
                />
              )}
            />
          </Grid>
        );
      case "projectManager":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="projectManager"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("projectManager", labelProjectManager)}
                  fullWidth
                  select
                  SelectProps={{ native: true }}
                  InputLabelProps={{ shrink: true }}
                  error={!!errors.projectManager}
                  helperText={
                    errors.projectManager?.message ||
                    (projectManagerOptions.length
                      ? "Select from active project managers."
                      : "No project managers found — add users with the Project Manager role.")
                  }
                >
                  <option value="">Select project manager</option>
                  {projectManagerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </TextField>
              )}
            />
          </Grid>
        );
      case "teamMembers":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="teamMemberIds"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={!!errors.teamMemberIds}>
                  <InputLabel>{labelWithRequired("teamMembers", labelTeamMembers)}</InputLabel>
                  <Select
                    multiple
                    value={field.value ?? []}
                    label={labelWithRequired("teamMembers", labelTeamMembers)}
                    onChange={(event) => field.onChange(event.target.value as string[])}
                    renderValue={(selected) => {
                      const ids = selected as string[];
                      if (ids.length === 0) return "";
                      return activeUserOptions
                        .filter((user) => ids.includes(user.id))
                        .map((user) => user.fullName)
                        .join(", ");
                    }}
                  >
                    {activeUserOptions.map((user) => (
                      <MenuItem key={user.id} value={user.id}>
                        <Checkbox checked={(field.value ?? []).includes(user.id)} />
                        <ListItemText primary={user.fullName} secondary={`${user.role}${user.office ? ` - ${user.office}` : ""}`} />
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    {errors.teamMemberIds?.message || "Nominate users who can be selected in workflow team-member steps."}
                  </FormHelperText>
                </FormControl>
              )}
            />
          </Grid>
        );
      case "description":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("description", labelDescription)}
                  fullWidth
                  multiline
                  rows={3}
                  error={!!errors.description}
                  helperText={errors.description?.message || "Short scope summary shown in lists and exports."}
                />
              )}
            />
          </Grid>
        );
      case "startDate":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="startDate"
              control={control}
              render={({ field }) => (
                <DatePicker
                  label={labelWithRequired("startDate", labelStartDate)}
                  value={field.value ? dayjs(field.value) : null}
                  onChange={(value) => field.onChange(value ? value.format("YYYY-MM-DD") : "")}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: !!errors.startDate,
                      helperText: errors.startDate?.message || "Planned start date."
                    }
                  }}
                />
              )}
            />
          </Grid>
        );
      case "finishDate":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="finishDate"
              control={control}
              render={({ field }) => (
                <DatePicker
                  label={labelWithRequired("finishDate", labelFinishDate)}
                  value={field.value ? dayjs(field.value) : null}
                  onChange={(value) => field.onChange(value ? value.format("YYYY-MM-DD") : "")}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: !!errors.finishDate,
                      helperText: errors.finishDate?.message || "Planned finish date."
                    }
                  }}
                />
              )}
            />
          </Grid>
        );
      case "projectType":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <FormControl error={!!errors.projectType}>
              <FormLabel>{labelWithRequired("projectType", labelProjectType)}</FormLabel>
              <Controller
                name="projectType"
                control={control}
                render={({ field }) => (
                  <RadioGroup row {...field}>
                    {["Internal", "External"].map((value) => (
                      <FormControlLabel key={value} value={value} control={<Radio />} label={value} />
                    ))}
                  </RadioGroup>
                )}
              />
              <FormHelperText>
                {errors.projectType?.message ||
                  "Internal skips approval; External can require approval before work begins."}
              </FormHelperText>
            </FormControl>
          </Grid>
        );
      default:
        break;
    }

    const dynamicDef = dynamicDefById.get(fieldId);
    if (!dynamicDef) return null;
    const rawValue = projectDynamicValues[fieldId];
    const value = typeof rawValue === "string" ? rawValue : "";
    const dynamicLabel = labelWithRequired(fieldId, dynamicDef.name);
    const dynamicHelp = isRequiredField(fieldId) ? "Required custom field." : "Optional custom field.";
    const dynamicError = dynamicFieldErrors[fieldId] || "";

    const dynamicSitesLink = (() => {
      const type = (dynamicDef.fieldType || "").toLowerCase();
      if (type !== "reference" && type !== "lookup field") return { isSitesRef: false, isSitesLookup: false };
      const targetId = dynamicDef.linkToFieldId;
      if (!targetId) return { isSitesRef: false, isSitesLookup: false };
      const target = allDefinitionsById.get(targetId);
      if (!target) return { isSitesRef: false, isSitesLookup: false };
      const isSites = (target.tables || []).includes("sites");
      return { isSitesRef: type === "reference" && isSites, isSitesLookup: type === "lookup field" && isSites };
    })();

    if (dynamicDef.fieldType === "checkbox") {
      return (
        <Grid item xs={12} md={6} key={fieldId}>
          <FormControl error={!!dynamicError}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={value === "true"}
                  onChange={(event) =>
                    setProjectDynamicValues((prev) => ({
                      ...prev,
                      [fieldId]: event.target.checked ? "true" : "false"
                    }))
                  }
                />
              }
              label={dynamicLabel}
            />
            <FormHelperText>{dynamicError || dynamicHelp}</FormHelperText>
          </FormControl>
        </Grid>
      );
    }

    if (dynamicSitesLink.isSitesRef) {
      return (
        <Grid item xs={12} md={6} key={fieldId}>
          <TextField
            label={dynamicLabel}
            fullWidth
            select
            SelectProps={{ native: true }}
            InputLabelProps={{ shrink: true }}
            value={value}
            error={!!dynamicError}
            helperText={dynamicError || dynamicHelp.replace("custom field.", "custom field (select an existing site).")}
            onChange={(event) =>
              setProjectDynamicValues((prev) => ({ ...prev, [fieldId]: String(event.target.value || "") }))
            }
          >
            <option value="">(No site)</option>
            {siteOptions.map((site) => {
              const customerName = customerNameById.get(site.customerId) || "Customer";
              return (
                <option key={site.id} value={site.id}>
                  {customerName} - {site.name}
                </option>
              );
            })}
          </TextField>
        </Grid>
      );
    }

    if (dynamicSitesLink.isSitesLookup) {
      // For Projects, treat Site lookup fields as derived display-only values from the selected Site.
      // This avoids rendering "lookup field" as another Site selector and enables auto-fill use cases like Site City.
      const looksLikeCity =
        /city/i.test(dynamicDef.name || "") || /city/i.test(dynamicDef.id || "");
      const derived = looksLikeCity ? (allSites.find((s) => s.id === siteId)?.city || "") : "";
      return (
        <Grid item xs={12} md={6} key={fieldId}>
          <TextField
            label={dynamicLabel}
            fullWidth
            value={derived}
            InputProps={{ readOnly: true }}
            error={!!dynamicError}
            helperText={
              dynamicError ||
              (looksLikeCity
                ? "Auto-filled from the selected Site."
                : "Lookup fields are derived from linked records.")
            }
          />
        </Grid>
      );
    }

    return (
      <Grid item xs={12} md={6} key={fieldId}>
        <TextField
          label={dynamicLabel}
          type={getDynamicInputType(dynamicDef.fieldType)}
          fullWidth
          InputLabelProps={dynamicDef.fieldType === "date" ? { shrink: true } : undefined}
          error={!!dynamicError}
          helperText={dynamicError || dynamicHelp}
          value={value}
          onChange={(event) =>
            setProjectDynamicValues((prev) => ({ ...prev, [fieldId]: event.target.value }))
          }
        />
      </Grid>
    );
  };

  const renderFieldSlot = (fieldId: string) => {
    const field = renderFormField(fieldId);
    if (!field || !isValidElement(field)) return null;
    return cloneElement(field as any, {
      xs: 12,
      md: 12,
    });
  };

  const leftColumnFieldIds = [
    "jobNumber",
    "purchaseOrderNumber",
    "siteName",
    "customerName",
    cityFieldId,
    "startDate",
    "finishDate",
  ].filter((fieldId): fieldId is string => fieldId != null && visibleIdSet.has(fieldId));

  const rightColumnFieldIds = [
    "products",
    "projectManager",
    "region",
    "teamMembers",
    "timeZoneId",
  ].filter((fieldId) => visibleIdSet.has(fieldId));

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" spacing={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            {id ? "Edit project" : "Create project"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Capture project identity, scheduling, and installation configuration.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => setTableConfigOpen(true)}>
          Project table configuration
        </Button>
      </Stack>

      <Box className="glass-card" sx={{ padding: 3 }}>
        <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Grid container spacing={2}>
                {leftColumnFieldIds.map((fieldId) => renderFieldSlot(fieldId))}
              </Grid>
            </Grid>

            <Grid item xs={12} md={6}>
              <Grid container spacing={2}>
                {rightColumnFieldIds.map((fieldId) => renderFieldSlot(fieldId))}
                <Grid item xs={12}>
                  <Box
                    sx={{
                      border: "1px solid rgba(45,212,191,0.28)",
                      borderRadius: 3,
                      p: 2,
                      background: "linear-gradient(180deg, rgba(18,28,30,0.92), rgba(14,22,24,0.92))",
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Typography variant="subtitle1" sx={{ fontFamily: "Sora", fontWeight: 700 }}>
                          Scheduled Email Report
                        </Typography>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={scheduledReport.enabled}
                              onChange={(event) =>
                                setScheduledReport((prev) => ({ ...prev, enabled: event.target.checked }))
                              }
                            />
                          }
                          label="Enable"
                        />
                      </Stack>

                      <Typography variant="caption" color="text.secondary">
                        Email will be sent until the project scheduled finish date.
                      </Typography>

                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={Boolean(scheduledReport.assetClosedNotificationEnabled)}
                            onChange={(event) =>
                              setScheduledReport((prev) => ({
                                ...prev,
                                assetClosedNotificationEnabled: event.target.checked,
                              }))
                            }
                          />
                        }
                        label="Workflow completion email"
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                        Emails the Project Manager (and any recipients below) each time a
                        workflow is completed. Independent of the scheduled report above —
                        works whether or not "Enable" is checked.
                      </Typography>

                      <Divider sx={{ my: 0.5 }} />

                      <Typography variant="caption" color="text.secondary">
                        Periodic summary report — separate from the completion email above.
                      </Typography>

                      <Grid container spacing={1.5}>
                        <Grid item xs={12} sm={5}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Weekly/daily"
                            value={scheduledReport.frequency}
                            onChange={(event) =>
                              setScheduledReport((prev) => ({
                                ...prev,
                                frequency: event.target.value as ProjectScheduledReportFrequency,
                              }))
                            }
                            disabled={!scheduledReport.enabled}
                          >
                            <MenuItem value="daily">Daily</MenuItem>
                            <MenuItem value="weekly">Weekly</MenuItem>
                          </TextField>
                        </Grid>
                        <Grid item xs={12} sm={7}>
                          <TextField
                            fullWidth
                            size="small"
                            type="time"
                            label="Scheduled time"
                            value={scheduledReport.sendTimeLocal}
                            onChange={(event) =>
                              setScheduledReport((prev) => ({ ...prev, sendTimeLocal: event.target.value }))
                            }
                            disabled={!scheduledReport.enabled}
                            InputLabelProps={{ shrink: true }}
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                            Scheduled Days (M-T-W-T-F-S-S)
                          </Typography>
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            {SCHEDULE_DAY_OPTIONS.map((day) => {
                              const selected = scheduledReport.daysOfWeek.includes(day.value);
                              return (
                                <Chip
                                  key={day.value}
                                  label={day.label}
                                  clickable={scheduledReport.enabled && scheduledReport.frequency === "weekly"}
                                  color={selected ? "primary" : "default"}
                                  variant={selected ? "filled" : "outlined"}
                                  onClick={() => {
                                    if (!scheduledReport.enabled || scheduledReport.frequency !== "weekly") return;
                                    setScheduledReport((prev) => ({
                                      ...prev,
                                      daysOfWeek: prev.daysOfWeek.includes(day.value)
                                        ? prev.daysOfWeek.filter((value) => value !== day.value)
                                        : [...prev.daysOfWeek, day.value],
                                    }));
                                  }}
                                  sx={{ minWidth: 36 }}
                                />
                              );
                            })}
                          </Stack>
                        </Grid>
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            size="small"
                            multiline
                            minRows={2}
                            label="Add more recipients"
                            value={scheduledRecipientsInput}
                            onChange={(event) => setScheduledRecipientsInput(event.target.value)}
                            disabled={!scheduledReport.enabled}
                            helperText="Enter one email per line, or separate multiple emails with commas."
                          />
                        </Grid>
                      </Grid>
                    </Stack>
                  </Box>
                </Grid>
              </Grid>
            </Grid>

            {visibleIdSet.has("description") && renderFormField("description")}
            {visibleIdSet.has("office") ? renderFormField("office") : <Grid item xs={12} md={6} />}

            {visibleIdSet.has("projectType") && renderFormField("projectType")}
            <Grid item xs={12} md={6} />

            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <FormLabel component="legend">Workflow Type</FormLabel>
                <Controller
                  name="workflowTypeId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      displayEmpty
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value)}
                    >
                      <MenuItem value="" disabled>
                        Select type…
                      </MenuItem>
                      {workflowTypes
                        .filter((type) => type.isActive)
                        .map((type) => (
                          <MenuItem key={type.id} value={type.id}>
                            {type.name}
                          </MenuItem>
                        ))}
                    </Select>
                  )}
                />
                <FormHelperText>
                  One workflow type per project. Controls installation vs inspection modules.
                </FormHelperText>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6} />

            {isLegacyMixedProject && !workflowTypeId && (
              <Grid item xs={12}>
                <Alert severity="warning">
                  This legacy mixed project must be assigned a single workflow type before saving.
                </Alert>
              </Grid>
            )}

            {extraDynamicIds.map((fieldId) => renderFormField(fieldId))}
            {projectType === "External" && (
              <Grid item xs={12}>
                <Alert severity="info">
                  External projects include the Pending Approval workflow state before execution can begin.
                </Alert>
              </Grid>
            )}

            {selectedWorkflowType && isInspectionWorkflowType(selectedWorkflowType) && (
              <Grid item xs={12}>
                <Alert severity="info">
                  Inspection-only projects use project assets and inspection runs without exposing installation workspace sections.
                </Alert>
              </Grid>
            )}

            {projectType === "External" && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <FormLabel>Approval Decision</FormLabel>
                  <Controller
                    name="approvalDecision"
                    control={control}
                    render={({ field }) => (
                      <RadioGroup row {...field}>
                        {"Approved,Rejected".split(",").map((value) => (
                          <FormControlLabel key={value} value={value} control={<Radio />} label={value} />
                        ))}
                      </RadioGroup>
                    )}
                  />
                  <FormHelperText>Approval updates the project status automatically when you save.</FormHelperText>
                </FormControl>
              </Grid>
            )}

          </Grid>
          </LocalizationProvider>
          {submitError && (
            <Typography variant="body2" color="error" sx={{ marginTop: 2 }}>
              {submitError}
            </Typography>
          )}
          {!id && cloneCandidates.length > 0 && (
            <Box
              sx={{
                mt: 2,
                p: 1.5,
                borderRadius: 1,
                border: "1px solid",
                borderColor: pendingCloneSourceId ? "primary.main" : "var(--stroke)",
                bgcolor: pendingCloneSourceId ? "primary.main" : "transparent",
                color: pendingCloneSourceId ? "primary.contrastText" : "text.secondary",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Typography variant="body2">
                {pendingCloneSourceId
                  ? `Will copy assets from: ${cloneCandidates.find((c) => c.id === pendingCloneSourceId)?.jobNumber}`
                  : `${cloneCandidates.length} similar project${cloneCandidates.length !== 1 ? "s" : ""} found — start from scratch or copy assets`}
              </Typography>
              <Button
                size="small"
                variant={pendingCloneSourceId ? "outlined" : "contained"}
                sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
                onClick={() => setCloneSuggestOpen(true)}
              >
                {pendingCloneSourceId ? "Change selection" : "Copy assets"}
              </Button>
            </Box>
          )}
          <Stack direction="row" spacing={2} sx={{ marginTop: 3 }}>
            <Button variant="outlined" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="outlined"
              type="button"
              disabled={!!id && !canEditExistingProject}
              onClick={() => runSave("draft")}
            >
              Save draft
            </Button>
            <Button
              variant="contained"
              type="button"
              disabled={cloning || (!!id && !canEditExistingProject)}
              onClick={() => runSave("final")}
            >
              {cloning ? "Copying assets…" : id ? "Save changes" : "Submit project"}
            </Button>
          </Stack>
        </form>
      </Box>

      <TableConfigDialog
        open={tableConfigOpen}
        onClose={() => setTableConfigOpen(false)}
        title="Table configuration: projects"
        deferFieldChanges
        availableFields={availableFieldsForProjects.map((field) => ({
          id: field.id,
          name: field.name,
          fieldType: field.fieldType,
          linkToFieldId: field.linkToFieldId,
          actionType: field.actionType
        }))}
        fields={projectsTableConfig.orderedFields}
        config={projectsTableConfig.config}
        onChange={projectsTableConfig.setConfig}
        builtInColumns={[
          { id: "jobNumber", name: "Job Number", type: "text", required: true },
          { id: "purchaseOrderNumber", name: "Purchase Order Number", type: "text", required: false },
          { id: "customerName", name: "Customer name", type: "text", required: false },
          { id: "siteName", name: "Site", type: "text", required: false },
          { id: "customerId", name: "Customer ID", type: "text", required: true },
          { id: "products", name: "Product name", type: "multi-select", required: true },
          { id: "office", name: "Office", type: "text", required: true },
          { id: "region", name: "Country/State", type: "text", required: false },
          { id: "timeZoneId", name: "Time Zone", type: "single select", required: false },
          { id: "projectManager", name: "Project Manager", type: "dropdown", required: false },
          { id: "teamMembers", name: "Project Team Members", type: "multi-select", required: false },
          { id: "description", name: "Description", type: "text", required: true },
          { id: "startDate", name: "Start Date", type: "date", required: true },
          { id: "finishDate", name: "Finish Date", type: "date", required: true },
          { id: "status", name: "Status", type: "single select", required: true },
          { id: "projectType", name: "Project Type", type: "single select", required: true }
        ]}
        onAddField={async (fieldId) => {
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes("projects")
            ? existing.tables
            : [...existing.tables, "projects"];
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          await projectsDynamic.reload();
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          const created = await fieldService.createDefinition({
            id: "",
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null,
            tables: ["projects"],
            sortOrder: allFieldDefinitions.definitions.length + 1,
            isActive: true
          });
          await allFieldDefinitions.reload();
          await projectsDynamic.reload();
          return created;
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          const existing = projectsDynamic.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          await fieldService.updateDefinition(fieldId, {
            ...existing,
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null
          });
          await allFieldDefinitions.reload();
          await projectsDynamic.reload();
        }}
        onDeleteField={async (fieldId) => {
          // "Remove" means unassign from Projects (do not delete globally).
          const existing =
            allFieldDefinitions.definitions.find((item) => item.id === fieldId) ??
            projectsDynamic.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = (existing.tables || []).filter((t) => t !== "projects");
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          await projectsDynamic.reload();
        }}
      />
      {/* Clone suggestion dialog */}
      <Dialog
        open={cloneSuggestOpen}
        onClose={() => setCloneSuggestOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          className: "glass-card",
          sx: { backgroundColor: "var(--panel)", border: "1px solid var(--stroke)" }
        }}
      >
        <DialogTitle>Copy from an existing project?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            We found {cloneCandidates.length} existing project{cloneCandidates.length !== 1 ? "s" : ""} for the same customer or site.
            Would you like to copy the asset list and workflow assignments into this new project?
          </Typography>
          <Stack spacing={1}>
            {cloneCandidates.map((p) => (
              <Box
                key={p.id}
                onClick={() => setPendingCloneSourceId((prev) => (prev === p.id ? null : p.id))}
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: pendingCloneSourceId === p.id ? "primary.main" : "var(--stroke)",
                  cursor: "pointer",
                  bgcolor: pendingCloneSourceId === p.id ? "primary.main" : "transparent",
                  color: pendingCloneSourceId === p.id ? "primary.contrastText" : "text.primary",
                  transition: "all 0.15s",
                }}
              >
                <Typography variant="subtitle2">{p.jobNumber} — {p.customerName}</Typography>
                {p.siteName && (
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>{p.siteName}</Typography>
                )}
                {p.assetCount > 0 && (
                  <Typography variant="caption" sx={{ display: "block", opacity: 0.7 }}>
                    {p.assetCount} asset{p.assetCount !== 1 ? "s" : ""}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
          {pendingCloneSourceId && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
              Assets will be copied with status reset to Not Started. Workflow runs are not copied.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => { setPendingCloneSourceId(null); setCloneSuggestOpen(false); }}>
            Start fresh
          </Button>
          <Button
            variant="contained"
            disabled={!pendingCloneSourceId}
            onClick={() => setCloneSuggestOpen(false)}
          >
            Copy assets after save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!globalOfficePrompt}
        onClose={() => setGlobalOfficePrompt(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          className: "glass-card",
          sx: { backgroundColor: "var(--panel)", border: "1px solid var(--stroke)" }
        }}
      >
        <DialogTitle>Switch Global Active Office?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Project manager {globalOfficePrompt?.managerName} is assigned to {globalOfficePrompt?.country}.
            Change Global Active Office to {globalOfficePrompt?.country}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setGlobalOfficePrompt(null)}>
            Keep Current
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!globalOfficePrompt?.country) return;
              updateActiveOffice(globalOfficePrompt.country);
              setGlobalOfficePrompt(null);
            }}
          >
            Change Office
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default ProjectForm;


