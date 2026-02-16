import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Grid,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router-dom";
import { demoCustomers, demoProducts } from "../../data/demo";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useDynamicFields } from "../../hooks/useDynamicFields";
import { useFieldDefinitions } from "../../hooks/useFieldDefinitions";
import { useTableConfig } from "../../hooks/useTableConfig";
import TableConfigDialog from "../../components/TableConfigDialog";
import { projectService } from "../../services/projectService";
import { fieldService } from "../../services/fieldService";
import { siteService } from "../../services/siteService";
import { officesService } from "../../services/officesService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchCustomers } from "../../store/customersSlice";
import { fetchProducts } from "../../store/productsSlice";
import { createProject, updateProject } from "../../store/projectSlice";
import { ApprovalDecision, Office, Project, ProjectStatus } from "../../types/project";
import type { Office as GlobalOffice } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import type { Site } from "../../types/site";
import type { FieldDefinition } from "../../services/fieldService";

const schema = z
  .object({
    customerName: z.string().optional(),
    customerId: z.string().optional(),
    siteId: z.string().optional(),
    jobNumber: z.string().optional(),
    description: z.string().optional(),
    startDate: z.string().optional(),
    finishDate: z.string().optional(),
    office: z.string().optional(),
    region: z.string().optional(),
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
        "Cancelled"
      ])
      .optional(),
    approvalDecision: z
      .union([
        z.enum(["Approved", "Rejected", "More Info Required"] as [ApprovalDecision, ...ApprovalDecision[]]),
        z.literal("")
      ])
      .optional(),
    isInstallationProject: z.boolean(),
    productIds: z.array(z.string()).optional()
  });

type FormValues = z.infer<typeof schema>;

const ProjectForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.projects);
  const customersState = useAppSelector((state) => state.customers);
  const productsState = useAppSelector((state) => state.products);
  const projectsDynamic = useDynamicFields("projects");
  const allFieldDefinitions = useFieldDefinitions();
  const projectsTableConfig = useTableConfig(
    "projects",
    projectsDynamic.definitions.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  const availableFieldsForProjects = useMemo(
    () => allFieldDefinitions.definitions.filter((field) => !field.tables.includes("projects")),
    [allFieldDefinitions.definitions]
  );
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
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
  const sortedGlobalOffices = useMemo(
    () =>
      [...globalOffices].sort((a, b) =>
        (a.city || "").localeCompare(b.city || "", undefined, { numeric: true, sensitivity: "base" })
      ),
    [globalOffices]
  );
  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);
  const customers = customersState.items.length ? customersState.items : demoCustomers;
  const filteredCustomers = useMemo(() => {
    return customers;
  }, [customers]);
  const products = productsState.items.length ? productsState.items : demoProducts;
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
    setError,
    setValue,
    setFocus
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "",
      customerId: "",
      siteId: "",
      jobNumber: "",
      description: "",
      startDate: "",
      finishDate: "",
      office: "",
      region: "",
      projectManager: "",
      projectType: "Internal",
      status: "Draft",
      approvalDecision: "",
      isInstallationProject: false,
      productIds: []
    }
  });

  useEffect(() => {
    dispatch(fetchCustomers());
    dispatch(fetchProducts());
  }, [dispatch]);

  useEffect(() => {
    officesService.getAll().then(setGlobalOffices);
  }, []);

  useEffect(() => {
    if (!id) return;

    const localProject = items.find((item) => item.id === id);
    if (localProject) {
      reset({
        customerName: localProject.customerName,
        customerId: localProject.customerId,
        siteId: localProject.siteId || "",
        jobNumber: localProject.jobNumber,
        description: localProject.description,
        startDate: localProject.startDate,
        finishDate: localProject.finishDate,
        office: localProject.office,
        region: localProject.region,
        projectManager: localProject.projectManager,
        projectType: localProject.projectType,
        status: localProject.status,
        approvalDecision: localProject.approvalDecision || "",
        isInstallationProject: localProject.isInstallationProject,
        productIds: localProject.productIds ?? []
      });
      return;
    }

    projectService.getProject(id).then((project) => {
      reset({
        customerName: project.customerName,
        customerId: project.customerId,
        siteId: project.siteId || "",
        jobNumber: project.jobNumber,
        description: project.description,
        startDate: project.startDate,
        finishDate: project.finishDate,
        office: project.office,
        region: project.region,
        projectManager: project.projectManager,
        projectType: project.projectType,
        status: project.status,
        approvalDecision: project.approvalDecision || "",
        isInstallationProject: project.isInstallationProject,
        productIds: project.productIds ?? []
      });
    });
  }, [id, items, reset]);

  useEffect(() => {
    if (projectsDynamic.definitions.length === 0) return;
    setProjectDynamicValues((prev) => {
      const next = { ...prev };
      projectsDynamic.definitions.forEach((field) => {
        if (next[field.id] === undefined) next[field.id] = "";
      });
      return next;
    });
  }, [projectsDynamic.definitions]);

  useEffect(() => {
    if (!id) return;
    const existing = projectsDynamic.valuesByEntity[id] || {};
    const next: Record<string, string> = {};
    projectsDynamic.definitions.forEach((field) => {
      next[field.id] = existing[field.id]?.value || "";
    });
    setProjectDynamicValues(next);
  }, [id, projectsDynamic.definitions, projectsDynamic.valuesByEntity]);


  const projectType = watch("projectType");
  const isInstallationProject = watch("isInstallationProject");
  const status = watch("status");
  const customerId = watch("customerId");
  const siteId = watch("siteId");
  const office = watch("office");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesLoadError, setSitesLoadError] = useState<string | null>(null);
  const [dynamicFieldErrors, setDynamicFieldErrors] = useState<Record<string, string>>({});

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

  // When creating a new project, default the office city based on the active country filter.
  // Project.office is stored as the office city (to map back to globalOffices).
  useEffect(() => {
    if (id) return;
    if (activeOffice === "All") return;
    if (globalOffices.length === 0) return;

    const currentCountry = office ? countryForOffice(office) : "";
    if (currentCountry === activeOffice) return;

    const defaultCity =
      globalOffices.find(
        (o) => (o.country || "").toLowerCase() === activeOffice.toLowerCase() && !!o.city
      )?.city || "";

    setValue("office", defaultCity, { shouldValidate: true });
  }, [id, activeOffice, globalOffices, office, countryForOffice, setValue]);

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
    if (selected.office && selected.office !== "All") {
      // Customer.office is usually a country. Project.office is stored as an office city.
      const officeIsCity = globalOffices.some((o) => o.city === selected.office);
      if (officeIsCity) {
        setValue("office", selected.office, { shouldValidate: true });
      } else {
        const defaultCity =
          globalOffices.find(
            (o) => (o.country || "").toLowerCase() === selected.office.toLowerCase() && !!o.city
          )?.city || "";
        if (defaultCity) {
          setValue("office", defaultCity, { shouldValidate: true });
        }
      }
    }
  }, [selectedCustomerId, filteredCustomers, globalOffices, setValue]);

  useEffect(() => {
    if (!office || globalOffices.length === 0) return;
    const selectedOffice = globalOffices.find((o) => o.city === office);
    if (selectedOffice && selectedOffice.country) {
      setValue("region", selectedOffice.country, { shouldValidate: true });
    }
  }, [office, globalOffices, setValue]);

  const pushUiLog = (message: string, error?: string) => {
    const anyWindow = window as typeof window & { __apiDebugLogs?: Array<{ id: string; time: string; method?: string; url?: string; status?: number; error?: string }> };
    if (!anyWindow.__apiDebugLogs) {
      anyWindow.__apiDebugLogs = [];
    }
    anyWindow.__apiDebugLogs.push({
      id: crypto.randomUUID(),
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
    // Validate required fields based on table configuration (admin-controlled).
    const hiddenSet = new Set(projectsTableConfig.config.hidden || []);
    const meta = projectsTableConfig.config.baseFieldMeta || {};
    const missing: string[] = [];

    const isRequired = (fieldId: string) => !!meta[fieldId]?.required && !hiddenSet.has(fieldId);
    const isBlank = (value: unknown) => String(value ?? "").trim() === "";

    if (isRequired("customerName") && !selectedCustomerId) {
      // customerName is driven by the separate Select (selectedCustomerId), so set an explicit form error.
      setError("customerName", { type: "required", message: `${labelCustomer} is required` });
      missing.push(labelCustomer);
    }
    if (isRequired("customerId") && isBlank(data.customerId)) {
      setError("customerId", { type: "required", message: `${labelCustomerId} is required` });
      missing.push(labelCustomerId);
    }
    if (isRequired("siteName") && isBlank(data.siteId)) {
      setError("siteId", { type: "required", message: `${labelSite} is required` });
      missing.push(labelSite);
    }
    if (isRequired("jobNumber") && isBlank(data.jobNumber)) {
      setError("jobNumber", { type: "required", message: `${labelJobNumber} is required` });
      missing.push(labelJobNumber);
    }
    if (isRequired("description") && isBlank(data.description)) {
      setError("description", { type: "required", message: `${labelDescription} is required` });
      missing.push(labelDescription);
    }
    if (isRequired("startDate") && isBlank(data.startDate)) {
      setError("startDate", { type: "required", message: `${labelStartDate} is required` });
      missing.push(labelStartDate);
    }
    if (isRequired("finishDate") && isBlank(data.finishDate)) {
      setError("finishDate", { type: "required", message: `${labelFinishDate} is required` });
      missing.push(labelFinishDate);
    }
    if (isRequired("office") && isBlank(data.office)) {
      setError("office", { type: "required", message: `${labelOffice} is required` });
      missing.push(labelOffice);
    }
    if (isRequired("region") && isBlank(data.region)) {
      setError("region", { type: "required", message: `${labelRegion} is required` });
      missing.push(labelRegion);
    }
    if (isRequired("projectManager") && isBlank(data.projectManager)) {
      setError("projectManager", { type: "required", message: `${labelProjectManager} is required` });
      missing.push(labelProjectManager);
    }
    if (isRequired("status") && isBlank(data.status)) {
      setError("status", { type: "required", message: `${labelStatus} is required` });
      missing.push(labelStatus);
    }
    if (isRequired("projectType") && isBlank(data.projectType)) {
      setError("projectType", { type: "required", message: `${labelProjectType} is required` });
      missing.push(labelProjectType);
    }
    if (isRequired("products") && (!data.productIds || data.productIds.length === 0)) {
      setError("productIds", { type: "required", message: `${labelProducts} is required` });
      missing.push(labelProducts);
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
    const missingDynamicDefs = projectsDynamic.definitions
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

    if (missing.length) {
      setSubmitError(`Missing required fields: ${Array.from(new Set(missing)).join(", ")}`);
      pushUiLog("ProjectForm submit blocked", "Missing required fields");
      return;
    }

    const selected = filteredCustomers.find((customer) => customer.id === selectedCustomerId);
    if (!selected) {
      // Customer selection can be hidden/optional; only block if a dependent field is required.
      if (isRequired("customerName") || isRequired("customerId") || isRequired("siteName")) {
        setSubmitError(`Select a ${labelCustomer.toLowerCase()} before submitting.`);
        pushUiLog("ProjectForm submit blocked", "Missing customer");
        return;
      }
    }
    pushUiLog("ProjectForm submit");
    const dynamicValuesToSave = { ...projectDynamicValues };
    projectsDynamic.definitions.forEach((def) => {
      const type = (def.fieldType || "").toLowerCase();
      if (type !== "lookup field" || !def.linkToFieldId) return;
      const target = allDefinitionsById.get(def.linkToFieldId);
      const targetIsSites = !!target && (target.tables || []).includes("sites");
      const looksLikeCity = /city/i.test(def.name || "") || /city/i.test(def.id || "");
      if (targetIsSites && looksLikeCity) {
        dynamicValuesToSave[def.id] = allSites.find((s) => s.id === data.siteId)?.city || "";
      }
    });

    const payload: Project = {
      id: id || `P-${Math.floor(Math.random() * 10000)}`,
      customerName: selected?.name || "",
      customerId: selected?.customerId || "",
      siteId: data.siteId || undefined,
      jobNumber: data.jobNumber || "",
      description: data.description || "",
      startDate: data.startDate || "",
      finishDate: data.finishDate || "",
      office: data.office || "",
      region: data.region,
      projectType: (data.projectType as any) || "Internal",
      status: (data.status as any) || "Draft",
      approvalDecision: data.approvalDecision || undefined,
      isInstallationProject: data.isInstallationProject,
      projectManager: data.projectManager,
      productIds: data.productIds ?? []
    };

    try {
      if (id) {
        const result = await dispatch(updateProject({ id, payload })).unwrap();
        await projectsDynamic.upsertForEntity(
          result.id,
          dynamicValuesToSave,
          projectsDynamic.valuesByEntity[result.id]
        );
      } else {
        const result = await dispatch(createProject(payload)).unwrap();
        await projectsDynamic.upsertForEntity(
          result.id,
          dynamicValuesToSave,
          projectsDynamic.valuesByEntity[result.id]
        );
      }
      navigate("/projects");
    } catch {
      setSubmitError("Unable to save project. Check API availability.");
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
      projectType: labelProjectType,
      status: labelStatus,
      productIds: labelProducts,
      approvalDecision: "Approval Decision",
      isInstallationProject: "Installation project"
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
        const officeIsCity = globalOffices.some((o) => o.city === selected.office);
        if (officeIsCity) {
          setValue("office", selected.office, { shouldValidate: true });
        } else {
          const defaultCity =
            globalOffices.find(
              (o) => (o.country || "").toLowerCase() === selected.office.toLowerCase() && !!o.city
            )?.city || "";
          if (defaultCity) {
            setValue("office", defaultCity, { shouldValidate: true });
          }
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
  const labelCustomer = builtInLabel("customerName", "Customer");
  const labelCustomerId = builtInLabel("customerId", "Customer ID");
  const labelSite = builtInLabel("siteName", "Site");
  const labelProducts = builtInLabel("products", "Products");
  const labelJobNumber = builtInLabel("jobNumber", "Job Number");
  const labelOffice = builtInLabel("office", "Office");
  const labelRegion = builtInLabel("region", "Country");
  const labelProjectManager = builtInLabel("projectManager", "Project Manager");
  const labelDescription = builtInLabel("description", "Description");
  const labelStartDate = builtInLabel("startDate", "Start Date");
  const labelFinishDate = builtInLabel("finishDate", "Finish Date");
  const labelStatus = builtInLabel("status", "Status");
  const labelProjectType = builtInLabel("projectType", "Project Type");
  const baseFieldIds = useMemo(
    () => [
      "jobNumber",
      "customerName",
      "siteName",
      "customerId",
      "products",
      "office",
      "region",
      "projectManager",
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
    () => new Map(projectsDynamic.definitions.map((def) => [def.id, def])),
    [projectsDynamic.definitions]
  );
  const allDefinitionsById = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    allFieldDefinitions.definitions.forEach((def) => map.set(def.id, def));
    return map;
  }, [allFieldDefinitions.definitions]);

  const orderedVisibleIds = useMemo(() => {
    const dynamicIds = projectsDynamic.definitions.map((def) => def.id);
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
  }, [projectsTableConfig.config.order, baseFieldIds, projectsDynamic.definitions, hiddenSet]);
  const visibleIdSet = useMemo(() => new Set(orderedVisibleIds), [orderedVisibleIds]);
  const cityFieldId = useMemo(() => {
    return projectsDynamic.definitions.find((def) => {
      const type = (def.fieldType || "").toLowerCase();
      if (type !== "lookup field") return false;
      if (!/city/i.test(def.name || "") && !/city/i.test(def.id || "")) return false;
      if (!def.linkToFieldId) return false;
      const target = allDefinitionsById.get(def.linkToFieldId);
      return !!target && (target.tables || []).includes("sites");
    })?.id;
  }, [projectsDynamic.definitions, allDefinitionsById]);
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
                  error={!!errors.office}
                  helperText={
                    errors.office?.message || "Office city responsible for this project (sets Country/State)."
                  }
                >
                  <option value="">Select office</option>
                  {sortedGlobalOffices.map((office) => (
                    <option key={office.id} value={office.city}>
                      {office.city}
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
                  helperText={errors.region?.message || "Auto-filled from Office. Override if needed."}
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
                  error={!!errors.projectManager}
                  helperText={errors.projectManager?.message || "Primary owner for delivery and communication."}
                />
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
      case "status":
        return (
          <Grid item xs={12} md={6} key={fieldId}>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={labelWithRequired("status", labelStatus)}
                  fullWidth
                  select
                  SelectProps={{ native: true }}
                  error={!!errors.status}
                  helperText={errors.status?.message || "Current workflow status for this project."}
                >
                  {([
                    "Draft",
                    "In Planning",
                    "Pending Approval",
                    "Approved",
                    "In Progress",
                    "On Hold",
                    "Completed",
                    "Cancelled"
                  ] as ProjectStatus[]).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </TextField>
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
            {visibleIdSet.has("jobNumber") && renderFormField("jobNumber")}
            {visibleIdSet.has("customerName") ? renderFormField("customerName") : <Grid item xs={12} md={6} />}

            {visibleIdSet.has("siteName") && renderFormField("siteName")}
            {cityFieldId && visibleIdSet.has(cityFieldId) ? renderFormField(cityFieldId) : <Grid item xs={12} md={6} />}

            {visibleIdSet.has("products") && renderFormField("products")}
            <Grid item xs={12} md={6} />

            {visibleIdSet.has("projectManager") && renderFormField("projectManager")}
            {visibleIdSet.has("office") ? renderFormField("office") : <Grid item xs={12} md={6} />}

            {visibleIdSet.has("region") && renderFormField("region")}
            <Grid item xs={12} md={6} />

            {visibleIdSet.has("startDate") && renderFormField("startDate")}
            {visibleIdSet.has("finishDate") ? renderFormField("finishDate") : <Grid item xs={12} md={6} />}

            {visibleIdSet.has("description") && renderFormField("description")}
            <Grid item xs={12} md={6} />

            {visibleIdSet.has("projectType") && renderFormField("projectType")}
            {visibleIdSet.has("status") ? renderFormField("status") : <Grid item xs={12} md={6} />}

            {extraDynamicIds.map((fieldId) => renderFormField(fieldId))}
            <Grid item xs={12} md={6}>
              <FormControl>
                <FormControlLabel
                  control={
                  <Controller
                    name="isInstallationProject"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        checked={!!field.value}
                        onChange={(_, checked) => field.onChange(checked)}
                      />
                    )}
                  />
                }
                label="Installation project"
              />
                <FormHelperText>Enable if this project will have installation records and field work tracking.</FormHelperText>
              </FormControl>
            </Grid>
            {projectType === "External" && (
              <Grid item xs={12}>
                <Alert severity="info">
                  External projects include the Pending Approval workflow state before execution can begin.
                </Alert>
              </Grid>
            )}

            {projectType === "External" && status !== "Draft" && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <FormLabel>Approval Decision</FormLabel>
                  <Controller
                    name="approvalDecision"
                    control={control}
                    render={({ field }) => (
                      <RadioGroup row {...field}>
                        {"Approved,Rejected,More Info Required".split(",").map((value) => (
                          <FormControlLabel key={value} value={value} control={<Radio />} label={value} />
                        ))}
                      </RadioGroup>
                    )}
                  />
                  <FormHelperText>Record the current approval outcome for External projects.</FormHelperText>
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
          <Stack direction="row" spacing={2} sx={{ marginTop: 3 }}>
            <Button variant="outlined" onClick={() => navigate("/projects")}>
              Cancel
            </Button>
            <Button variant="outlined">Save draft</Button>
            <Button variant="contained" type="submit">
              {id ? "Save changes" : "Submit project"}
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
          { id: "customerName", name: "Customer", type: "text", required: false },
          { id: "siteName", name: "Site", type: "text", required: false },
          { id: "customerId", name: "Customer ID", type: "text", required: true },
          { id: "products", name: "Products", type: "multi-select", required: true },
          { id: "office", name: "Office", type: "text", required: true },
          { id: "region", name: "Country/State", type: "text", required: false },
          { id: "projectManager", name: "Project Manager", type: "text", required: false },
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
    </Stack>
  );
};

export default ProjectForm;

