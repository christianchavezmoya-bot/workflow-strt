import {
  Alert,
  Box,
  Button,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
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
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { Print, Download } from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import { fieldService, FieldDefinition } from "../../services/fieldService";
import api from "../../services/api";
import { settingsService } from "../../services/settingsService";
import { QuickbaseSettingsForm, QuickbaseSettingsPayload } from "../../types/settings";
import { useFieldNotifications } from "../../contexts/FieldNotificationContext";
import { useAuth } from "../../hooks/useAuth";

// Style for field definition labels (yellow bold)
const fieldLabelStyle = {
  color: '#FFD700',
  fontWeight: 'bold'
};

const defaultSettings: QuickbaseSettingsForm = {
  enabled: false,
  realmHostname: "",
  userToken: "",
  projectsTableId: "",
  installationsTableId: "",
  projectsFieldMap: "{}",
  installationsFieldMap: "{}"
};

const loadSettings = (): QuickbaseSettingsForm => {
  try {
    const raw = localStorage.getItem("qb_settings");
    if (!raw) {
      return defaultSettings;
    }
    return { ...defaultSettings, ...JSON.parse(raw) } as QuickbaseSettingsForm;
  } catch {
    return defaultSettings;
  }
};

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

const Settings = () => {
  const { addNotification } = useFieldNotifications();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin" || localStorage.getItem("local_auth_user")?.includes('"Admin"');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [tab, setTab] = useState(() => {
    const stored = localStorage.getItem("settings_active_tab");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [settings, setSettings] = useState<QuickbaseSettingsForm>(() => loadSettings());
  const [status, setStatus] = useState<"" | "saved" | "sent" | "error">("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [apiStatus, setApiStatus] = useState<"running" | "stopped" | "unknown">("unknown");
  const [apiBusy, setApiBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [editField, setEditField] = useState<null | { id: string; name: string; type: string }>(null);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [lookupFieldId, setLookupFieldId] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ migrated: number; message?: string } | null>(null);
  const [lookupRows, setLookupRows] = useState<Record<string, Array<{ id: string; label: string }>>>({});
  const [notifySettings, setNotifySettings] = useState(() => {
    try {
      const raw = localStorage.getItem("notify_settings");
      if (raw) return JSON.parse(raw) as Record<string, string | boolean>;
    } catch {
      // ignore
    }
    return {
      smtpHost: "",
      smtpPort: "587",
      smtpUser: "",
      smtpPass: "",
      smtpFrom: "",
      smtpUseSsl: true,
      frontendBaseUrl: "http://localhost:5173",
      smsProvider: "",
      smsApiKey: "",
      smsSender: ""
    };
  });
  const [notifySending, setNotifySending] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState<"" | "saved" | "sent" | "error">("");
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const localUser = useMemo(() => {
    const raw = localStorage.getItem("local_auth_user");
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
      installationsFieldMap: installationsMap.value || {}
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
      !!payload.projectsTableId &&
      !!payload.installationsTableId &&
      !projectsMap.error &&
      !installationsMap.error
    );
  }, [settings.enabled, payload, projectsMap.error, installationsMap.error]);

  const handleSave = () => {
    localStorage.setItem("qb_settings", JSON.stringify(settings));
    setStatus("saved");
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
    localStorage.removeItem("qb_settings");
    setStatus("");
  };

  const handleSaveNotify = async () => {
    localStorage.setItem("notify_settings", JSON.stringify(notifySettings));

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
        frontendBaseUrl: String(notifySettings.frontendBaseUrl || "http://localhost:5173"),
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
    localStorage.removeItem("local_auth_user");
    localStorage.removeItem("auth_token");
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

  const reloadFieldDefinitions = async () => {
    try {
      const data = await fieldService.getDefinitions();
      setFieldDefinitions(data);
    } catch {
      setFieldDefinitions([]);
    }
  };

  const refreshTables = async () => {
    setTablesLoading(true);
    setTablesSuccess(false);
    try {
      const tables = await fieldService.getAvailableTables();
      setTableOptions(tables);
      setTablesSuccess(true);
      setTimeout(() => setTablesSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to fetch tables:", error);
      alert("Failed to refresh tables. Check console for details.");
    } finally {
      setTablesLoading(false);
    }
  };

  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const handlePrintFields = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

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
          .field-name { color: #FFD700; font-weight: bold; }
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

    printWindow.document.write(tableHTML);
    printWindow.document.close();
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
                    <div style="color: #FFD700; font-weight: bold;">${field.name}</div>
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
    localStorage.setItem("settings_active_tab", String(tab));
  }, [tab]);

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
    if (!isAdmin) return;
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
          frontendBaseUrl: s.frontendBaseUrl ?? "http://localhost:5173",
          smsProvider: s.smsProvider ?? "",
          smsApiKey: s.smsApiKey ?? "",
          smsSender: s.smsSender ?? ""
        }));
      } catch {
        // Fall back to localStorage.
      }
    })();
  }, [isAdmin]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
          Settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure optional Quickbase integration and notification providers.
        </Typography>
      </Box>

      <Box className="glass-card" sx={{ padding: 3 }}>
        <Tabs value={tab} onChange={(_, next) => setTab(next)}>
          <Tab label="Quickbase" />
          <Tab label="SMS/SMTP" />
          <Tab label="Fields/Data" />
          {isAdmin && <Tab label="Audit Log" />}
        </Tabs>

        {tab === 0 && (
          <Stack spacing={2} sx={{ marginTop: 2 }}>
            <Typography variant="h6">Quickbase integration (optional)</Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Switch
                checked={settings.enabled}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              <Typography variant="body2">
                Enable Quickbase integration for the backend
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Step-by-step
            </Typography>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Generate a Quickbase user token in your realm.</li>
              <li>Paste your realm hostname (example: company.quickbase.com).</li>
              <li>Enter Projects and Installations table IDs (dbids).</li>
              <li>Provide field maps so the backend can map app fields to Quickbase FIDs.</li>
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
            />
            <TextField
              label="User token"
              value={settings.userToken}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, userToken: event.target.value }))
              }
              placeholder="QB-USER-TOKEN"
              fullWidth
            />
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

        {tab === 1 && (
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
              fullWidth
            />
            <Stack direction="row" spacing={2} alignItems="center">
              <Switch
                checked={Boolean(notifySettings.smtpUseSsl)}
                onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpUseSsl: event.target.checked }))}
              />
              <Typography variant="body2">Use SSL</Typography>
            </Stack>
            <TextField
              label="SMTP Password"
              type="password"
              value={String(notifySettings.smtpPass || "")}
              onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpPass: event.target.value }))}
              fullWidth
            />
            <TextField
              label="From address"
              value={String(notifySettings.smtpFrom || "")}
              onChange={(event) => setNotifySettings((prev) => ({ ...prev, smtpFrom: event.target.value }))}
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

        {tab === 3 && isAdmin && (
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
              <Table size="small">
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
            )}
            {auditLogs.length === 0 && !auditLoading && (
              <Typography variant="body2" color="text.secondary">
                Click "Load audit log" to view recent 2FA security events.
              </Typography>
            )}
          </Stack>
        )}

        {tab === 2 && (
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
                  InputLabelProps={{ sx: fieldLabelStyle }}
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
                        alert("Failed to seed default fields. Check console for details.");
                      } finally {
                        setSeedLoading(false);
                      }
                    }}
                  >
                    {seedLoading ? "Loading..." : "Seed/Refresh Default Fields"}
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
                        alert("Failed to migrate field IDs. Check console for details.");
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
              {fieldDefinitions.length === 0 ? (
                <Stack spacing={1} sx={{ marginTop: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    No fields yet. Click "Seed/Refresh Default Fields" above to load defaults.
                  </Typography>
                </Stack>
              ) : (
                <Table sx={{ marginTop: 1 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={fieldLabelStyle}>Created field</TableCell>
                      <TableCell>Backend Tag</TableCell>
                      <TableCell>UI Field Name</TableCell>
                      {Array.from({ length: tableColumnSlots }).map((_, index) => (
                        <TableCell key={`table-header-${index}`}>{`Table ${index + 1}`}</TableCell>
                      ))}
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fieldDefinitions
                      .filter((field) =>
                        field.name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
                        field.fieldType.toLowerCase().includes(fieldSearch.toLowerCase())
                      )
                      .sort((a, b) => {
                        // Sort alphabetically by field name
                        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                      })
                      .map((field) => {
                      const tables = field.tables ?? [];
                      const slots = Array.from({ length: tableColumnSlots }).map((_, index) => tables[index] || "");
                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <Stack spacing={0.5}>
                              <Typography variant="subtitle2" sx={fieldLabelStyle}>{field.name}</Typography>
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
                                    const nextTables = [...slots];
                                    const previousValue = nextTables[index];
                                    nextTables[index] = nextValue;

                                    // Trigger notification if assigning to a new table (not removing or changing)
                                    if (nextValue && nextValue !== previousValue) {
                                      addNotification(field.name);
                                    }

                                    fieldService
                                      .updateDefinition(field.id, {
                                        ...field,
                                        tables: nextTables.filter(Boolean)
                                      })
                                      .then(() => reloadFieldDefinitions());
                                  }}
                                >
                                  <MenuItem value="">
                                    <em>None</em>
                                  </MenuItem>
                                  {tableOptions.map((option) => (
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
                    {fieldDefinitions.filter((field) =>
                      field.name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
                      field.fieldType.toLowerCase().includes(fieldSearch.toLowerCase())
                    ).length === 0 && (
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
              )}
            </Box>
          </Stack>
        )}

      </Box>

      <Box className="glass-card" sx={{ padding: 3 }}>
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
              InputLabelProps={{ sx: fieldLabelStyle }}
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
                const next = { id: crypto.randomUUID(), label: "" };
                setLookupRows((prev) => ({
                  ...prev,
                  [lookupFieldId]: [...(prev[lookupFieldId] || []), next]
                }));
              }}
            >
              Add row
            </Button>
            <Table>
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setLookupFieldId(null)}>
            Close
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
