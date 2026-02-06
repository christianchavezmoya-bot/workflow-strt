import {
  Alert,
  Box,
  Button,
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
import { projectService } from "../../services/projectService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchCustomers } from "../../store/customersSlice";
import { fetchProducts } from "../../store/productsSlice";
import { createProject, updateProject } from "../../store/projectSlice";
import { ApprovalDecision, Office, Project, ProjectStatus } from "../../types/project";
import DynamicFieldsForm from "../../components/DynamicFieldsForm";

const schema = z
  .object({
    customerName: z.string().optional(),
    customerId: z.string().min(1, "Customer ID is required"),
    jobNumber: z.string().min(1, "Job number is required"),
    description: z.string().min(1, "Description is required"),
    startDate: z.string().min(1, "Start date is required"),
    finishDate: z.string().min(1, "Finish date is required"),
    office: z
      .enum(["USA", "Australia", "South Africa", ""])
      .refine((value) => value !== "", "Office is required"),
    region: z.string().optional(),
    projectManager: z.string().optional(),
    projectType: z.enum(["Internal", "External"]),
    status: z.enum([
      "Draft",
      "In Planning",
      "Pending Approval",
      "Approved",
      "In Progress",
      "On Hold",
      "Completed",
      "Cancelled"
    ]),
    approvalDecision: z
      .enum(["Approved", "Rejected", "More Info Required"] as [ApprovalDecision, ...ApprovalDecision[]])
      .optional(),
    isInstallationProject: z.boolean(),
    productIds: z
      .array(z.string())
      .min(1, "Select a product.")
      .max(1, "Only one product can be assigned.")
  });

type FormValues = z.infer<typeof schema>;

const officeOptions: Office[] = ["USA", "Australia", "South Africa"];

const ProjectForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.projects);
  const customersState = useAppSelector((state) => state.customers);
  const productsState = useAppSelector((state) => state.products);
  const projectsDynamic = useDynamicFields("projects");
  const [projectDynamicValues, setProjectDynamicValues] = useState<Record<string, string>>({});
  const customers = customersState.items.length ? customersState.items : demoCustomers;
  const filteredCustomers = useMemo(() => {
    if (activeOffice === "All") return customers;
    return customers.filter((customer) => customer.office === activeOffice || customer.office === "All");
  }, [activeOffice, customers]);
  const products = productsState.items.length ? productsState.items : demoProducts;
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
    setValue
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "",
      customerId: "",
      jobNumber: "",
      description: "",
      startDate: "",
      finishDate: "",
      office: activeOffice === "All" ? "" : activeOffice,
      region: "",
      projectManager: "",
      projectType: "Internal",
      status: "Draft",
      isInstallationProject: false,
      productIds: []
    }
  });

  useEffect(() => {
    dispatch(fetchCustomers());
    dispatch(fetchProducts());
  }, [dispatch]);

  useEffect(() => {
    if (activeOffice === "All") {
      setValue("office", "", { shouldValidate: true });
    } else {
      setValue("office", activeOffice, { shouldValidate: true });
    }
  }, [activeOffice, setValue]);

  useEffect(() => {
    if (!id) return;

    const localProject = items.find((item) => item.id === id);
    if (localProject) {
      reset({
        customerName: localProject.customerName,
        customerId: localProject.customerId,
        jobNumber: localProject.jobNumber,
        description: localProject.description,
        startDate: localProject.startDate,
        finishDate: localProject.finishDate,
        office: localProject.office,
        region: localProject.region,
        projectManager: localProject.projectManager,
        projectType: localProject.projectType,
        status: localProject.status,
        approvalDecision: localProject.approvalDecision,
        isInstallationProject: localProject.isInstallationProject,
        productIds: localProject.productIds ?? []
      });
      return;
    }

    projectService.getProject(id).then((project) => {
      reset({
        customerName: project.customerName,
        customerId: project.customerId,
        jobNumber: project.jobNumber,
        description: project.description,
        startDate: project.startDate,
        finishDate: project.finishDate,
        office: project.office,
        region: project.region,
        projectManager: project.projectManager,
        projectType: project.projectType,
        status: project.status,
        approvalDecision: project.approvalDecision,
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
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

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
    if (selected.office !== "All") {
      setValue("office", selected.office, { shouldValidate: true });
    }
  }, [customers, selectedCustomerId, setValue]);

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
    const selected = filteredCustomers.find((customer) => customer.id === selectedCustomerId);
    if (!selected) {
      setSubmitError("Select a customer before submitting.");
      pushUiLog("ProjectForm submit blocked", "Missing customer");
      return;
    }
    pushUiLog("ProjectForm submit");
    const payload: Project = {
      id: id || `P-${Math.floor(Math.random() * 10000)}`,
      customerName: selected.name,
      customerId: selected.customerId,
      jobNumber: data.jobNumber,
      description: data.description,
      startDate: data.startDate,
      finishDate: data.finishDate,
      office: data.office,
      region: data.region,
      projectType: data.projectType,
      status: data.status,
      approvalDecision: data.approvalDecision,
      isInstallationProject: data.isInstallationProject,
      projectManager: data.projectManager,
      productIds: data.productIds ?? []
    };

    try {
      if (id) {
        const result = await dispatch(updateProject({ id, payload })).unwrap();
        await projectsDynamic.upsertForEntity(
          result.id,
          projectDynamicValues,
          projectsDynamic.valuesByEntity[result.id]
        );
      } else {
        const result = await dispatch(createProject(payload)).unwrap();
        await projectsDynamic.upsertForEntity(
          result.id,
          projectDynamicValues,
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
    setSubmitError("Please complete the required fields before submitting.");
    pushUiLog("ProjectForm validation failed", fields);
  };

  const handleCustomerSelect = (value: string) => {
    if (!value) {
      setSelectedCustomerId("");
      setValue("customerName", "", { shouldValidate: true });
      setValue("customerId", "", { shouldValidate: true });
      return;
    }
    const selected = customers.find((customer) => customer.id === value);
    if (selected) {
      setSelectedCustomerId(selected.id);
      setValue("customerName", selected.name, { shouldValidate: true });
      setValue("customerId", selected.customerId, { shouldValidate: true });
      if (selected.office !== "All") {
        setValue("office", selected.office, { shouldValidate: true });
      }
    }
  };

  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
          {id ? "Edit project" : "Create project"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Capture project identity, scheduling, and installation configuration.
        </Typography>
      </Box>

      <Box className="glass-card" sx={{ padding: 3 }}>
        <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth error={!!errors.customerName}>
                <FormLabel>Select customer</FormLabel>
                <Select
                  value={selectedCustomerId}
                  displayEmpty
                  onChange={(event) => handleCustomerSelect(event.target.value)}
                >
                  <MenuItem value="">Select existing customer</MenuItem>
                  {filteredCustomers.map((customer) => (
                    <MenuItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </MenuItem>
                  ))}
                </Select>
                {errors.customerName?.message && <FormHelperText>{errors.customerName.message}</FormHelperText>}
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth error={!!errors.productIds}>
                <FormLabel>Product included</FormLabel>
                <Controller
                  name="productIds"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value?.[0] ?? ""}
                      onChange={(event) =>
                        field.onChange(event.target.value ? [event.target.value as string] : [])
                      }
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
                {errors.productIds?.message && <FormHelperText>{errors.productIds.message}</FormHelperText>}
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="customerId"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Customer ID"
                    fullWidth
                    error={!!errors.customerId}
                    helperText={errors.customerId?.message}
                    InputProps={{ readOnly: true }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="jobNumber"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Job Number"
                    fullWidth
                    error={!!errors.jobNumber}
                    helperText={errors.jobNumber?.message}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="office"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Office"
                    fullWidth
                    select
                    SelectProps={{ native: true }}
                    error={!!errors.office}
                    helperText={errors.office?.message}
                  >
                    <option value="">Select office</option>
                    {officeOptions.map((office) => (
                      <option key={office} value={office}>
                        {office}
                      </option>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="region"
                control={control}
                render={({ field }) => <TextField {...field} label="Region (optional)" fullWidth />}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="projectManager"
                control={control}
                render={({ field }) => <TextField {...field} label="Project Manager" fullWidth />}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Description"
                    fullWidth
                    multiline
                    rows={3}
                    error={!!errors.description}
                    helperText={errors.description?.message}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="startDate"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    label="Start Date"
                    value={field.value ? dayjs(field.value) : null}
                    onChange={(value) =>
                      field.onChange(value ? value.format("YYYY-MM-DD") : "")
                    }
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        error: !!errors.startDate,
                        helperText: errors.startDate?.message
                      }
                    }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="finishDate"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    label="Finish Date"
                    value={field.value ? dayjs(field.value) : null}
                    onChange={(value) =>
                      field.onChange(value ? value.format("YYYY-MM-DD") : "")
                    }
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        error: !!errors.finishDate,
                        helperText: errors.finishDate?.message
                      }
                    }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Status" fullWidth select SelectProps={{ native: true }}>
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
            <Grid item xs={12} md={6}>
              <FormControl>
                <FormLabel>Project classification</FormLabel>
                <Controller
                  name="projectType"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup row {...field}>
                      {["Internal", "External"].map((value) => (
                        <FormControlLabel
                          key={value}
                          value={value}
                          control={<Radio />}
                          label={value}
                        />
                      ))}
                    </RadioGroup>
                  )}
                />
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Controller
                    name="isInstallationProject"
                    control={control}
                    render={({ field }) => (
                      <Switch checked={field.value} onChange={field.onChange} />
                    )}
                  />
                }
                label="Is this an Installation Project?"
              />
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
                </FormControl>
              </Grid>
            )}

          </Grid>
          </LocalizationProvider>
          <Box sx={{ marginTop: 2 }}>
            <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
              Dynamic fields
            </Typography>
            <DynamicFieldsForm
              definitions={projectsDynamic.definitions}
              values={projectDynamicValues}
              onChange={setProjectDynamicValues}
            />
          </Box>
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
    </Stack>
  );
};

export default ProjectForm;
