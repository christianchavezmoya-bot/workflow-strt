import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Divider,
  Dialog,
  FormControl,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { NavLink } from "react-router-dom";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { officesService } from "../../services/officesService";
import { brandSettingsService } from "../../services/brandSettingsService";
import type { Office } from "../../components/GlobalOfficeMap";
import strataLogo from "../../assets/strata_transparent.png";
import FavoritesSection from "./FavoritesSection";
import { BOM_MODULE_ENABLED } from "../../modules/bom-project";
import appDocsHtml from "../../../docs/commtrac-codex-915-docs.html?raw";
import architectureDoc from "../../../docs/ARCHITECTURE.md?raw";
import schemaData from "../../../docs/schema.json";

const CONTROLLER_COUNT = Object.keys(import.meta.glob("../../../server/Commtrac.Api/Controllers/*.cs")).length;
const ROUTE_COUNT = Object.keys(import.meta.glob("../../app/**/*.tsx")).length;
const DEFAULT_ROLE_COUNT = 9;
const DEFAULT_ROLE_NAMES = [
  "Admin",
  "Project Manager",
  "Supervisor",
  "Engineer",
  "QA Inspector",
  "Installer",
  "Technician",
  "Client",
  "Viewer"
];

const CAPABILITY_CARDS = [
  { color: "var(--accent)", icon: "📋", title: "Projects", description: "Live project routing, forms, detail pages, customer/site links, and archive-safe project lifecycle management." },
  { color: "var(--accent2)", icon: "⚙️", title: "Installation Assets", description: "Asset assignment, installation status, workflow execution, documents, and server-backed archive/restore across shared users." },
  { color: "var(--accent4)", icon: "🧭", title: "Workflow Builder", description: "Draft/publish/archive workflow configs, run history, blocking issues, evidence capture, and step-based execution." },
  { color: "var(--accent3)", icon: "🔔", title: "Notifications", description: "Persistent inbox, bell widget, top-screen banner, role routing, acknowledgements, and audit-friendly history." },
  { color: "var(--warn)", icon: "✍️", title: "Signatures & Public Pages", description: "Reset-password, mobile upload, and signature pages remain public while authenticated app routes stay protected." },
  { color: "var(--accent)", icon: "📄", title: "Documents & Search", description: "Document library, asset-linked documents, search indexing, QR upload flow, and file-backed storage on the API." },
  { color: "var(--accent2)", icon: "🗺️", title: "Office & Regional Views", description: "Global office filtering, office-aware user context, geo data, and region-sensitive operational dashboards." },
  { color: "var(--accent4)", icon: "📦", title: "BOM to Project", description: BOM_MODULE_ENABLED ? "Enabled in this deployment. Import, map, classify, validate, and commit BOM data into project and asset records." : "Available behind feature flag. The module code is present but the current deployment has it disabled." },
  { color: "var(--accent3)", icon: "🚚", title: "Dispatch & Delivery", description: "Dispatch orders, delivery profiles, inbound items, and linked goods movements for project execution." },
  { color: "var(--warn)", icon: "🔎", title: "Dynamic Data Model", description: "Dynamic fields, table configuration, reference fields, lookup actions, and schema-driven admin tooling." },
  { color: "var(--accent)", icon: "📱", title: "Mobile / iPhone", description: "Single React codebase with breakpoint-driven mobile UI, public mobile upload route, offline cache, and Capacitor iOS packaging." },
  { color: "var(--accent2)", icon: "🔗", title: "Integrations", description: "Quickbase settings, discovery, goods-movements sync, SMTP/SMS notifications, and background API services." }
];

function getRoleCountFromCache(): number {
  try {
    const raw = localStorage.getItem("admin_roles_config");
    if (!raw) return DEFAULT_ROLE_COUNT;
    const parsed = JSON.parse(raw);
    const roles = parsed?.roles && typeof parsed.roles === "object" ? parsed.roles : parsed;
    const count = roles && typeof roles === "object" ? Object.keys(roles).length : 0;
    return count || DEFAULT_ROLE_COUNT;
  } catch {
    return DEFAULT_ROLE_COUNT;
  }
}

function getRoleNamesFromCache(): string[] {
  try {
    const raw = localStorage.getItem("admin_roles_config");
    if (!raw) return DEFAULT_ROLE_NAMES;
    const parsed = JSON.parse(raw);
    const roles = parsed?.roles && typeof parsed.roles === "object" ? parsed.roles : parsed;
    const names = roles && typeof roles === "object" ? Object.keys(roles) : [];
    return names.length > 0 ? names : DEFAULT_ROLE_NAMES;
  } catch {
    return DEFAULT_ROLE_NAMES;
  }
}

function inferRoleSummary(roleName: string): string[] {
  const normalized = roleName.toLowerCase();
  if (normalized.includes("admin")) return ["Settings & branding", "User and role management", "Audit, backup, and full data control"];
  if (normalized.includes("project manager")) return ["Projects and assets", "Workflow planning and delivery", "Operational decisions and approvals"];
  if (normalized.includes("supervisor")) return ["Shared operations visibility", "Workflow oversight", "Issue and run coordination"];
  if (normalized.includes("engineer") || normalized.includes("installer") || normalized.includes("technician")) return ["Assigned work execution", "Evidence and issue updates", "Field workflow completion"];
  if (normalized.includes("qa")) return ["Inspection access", "Workflow evidence review", "Quality-focused updates"];
  if (normalized.includes("client") || normalized.includes("viewer")) return ["Read-only visibility", "Status and document review", "No edit privileges"];
  return ["Role-config driven access", "Shared app visibility", "Server-enforced permissions"];
}

function extractLastUpdatedDate(markdown: string): string | null {
  const match = markdown.match(/Last updated:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  return match?.[1] ?? null;
}

const navItems = [
  { label: "Dashboard", icon: <DashboardOutlinedIcon />, to: "/", end: true, tourKey: "nav-dashboard" },
  { label: "Projects", icon: <AssignmentOutlinedIcon />, to: "/projects", tourKey: "nav-projects" },
  { label: "Issues Board", icon: <ErrorOutlineOutlinedIcon />, to: "/issues", tourKey: "nav-issues" },
  { label: "Installations", icon: <TableChartOutlinedIcon />, to: "/installations/assets", tourKey: "nav-installations" },
  { label: "Work Instructions", icon: <MenuBookOutlinedIcon />, to: "/work-instructions", tourKey: "nav-work-instructions" },
  { label: "Documents", icon: <FolderOutlinedIcon />, to: "/documents", tourKey: "nav-documents" },
  { label: "Tips & Tricks", icon: <LightbulbOutlinedIcon />, to: "/tips", tourKey: "nav-tips" },
  ...(BOM_MODULE_ENABLED ? [{ label: "BOM to Project", icon: <AccountTreeOutlinedIcon />, to: "/admin/bom-project", tourKey: "nav-bom" }] : []),
  { label: "Admin", icon: <AdminPanelSettingsOutlinedIcon />, to: "/admin", end: true, tourKey: "nav-admin" },
  { label: "Settings", icon: <SettingsOutlinedIcon />, to: "/settings", tourKey: "nav-settings" },
  { label: "Profile", icon: <PersonOutlineOutlinedIcon />, to: "/profile", tourKey: "nav-profile" },
];

const Sidebar = () => {
  const { user } = useAuth();
  const can = usePermissions();
  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const visibleNavItems = navItems.filter((item) => !(item.to === "/settings" && can.viewOnly));
  const [officeOptions, setOfficeOptions] = useState<string[]>(["All"]);
  const [appName, setAppName] = useState("Field Operations");
  const [roleCount, setRoleCount] = useState(DEFAULT_ROLE_COUNT);
  const [roleNames, setRoleNames] = useState<string[]>(DEFAULT_ROLE_NAMES);
  const [docsOpen, setDocsOpen] = useState(false);

  const docsStats = useMemo(() => {
    const tables = Array.isArray((schemaData as { tables?: unknown[] }).tables)
      ? (schemaData as { tables: unknown[] }).tables.length
      : 0;
    const columns = Array.isArray((schemaData as { tables?: Array<{ columns?: unknown[] }> }).tables)
      ? (schemaData as { tables: Array<{ columns?: unknown[] }> }).tables.reduce((sum, table) => sum + (table.columns?.length ?? 0), 0)
      : 0;
    const relationships = Array.isArray((schemaData as { inferredRelationships?: unknown[] }).inferredRelationships)
      ? (schemaData as { inferredRelationships: unknown[] }).inferredRelationships.length
      : Array.isArray((schemaData as { foreignKeys?: unknown[] }).foreignKeys)
        ? (schemaData as { foreignKeys: unknown[] }).foreignKeys.length
        : 0;

    const schemaDate = typeof (schemaData as { generatedAtUtc?: string }).generatedAtUtc === "string"
      ? (schemaData as { generatedAtUtc: string }).generatedAtUtc.slice(0, 10)
      : null;
    const architectureDate = extractLastUpdatedDate(architectureDoc);
    const availableDates = [schemaDate, architectureDate].filter(Boolean).sort() as string[];
    const upToDate = availableDates.length > 0
      ? availableDates[availableDates.length - 1]
      : new Date().toISOString().slice(0, 10);

    return {
      tables,
      columns,
      relationships,
      upToDate
    };
  }, []);

  const generatedCapabilitiesMarkup = useMemo(() => {
    const cards = CAPABILITY_CARDS.map((card) => `
      <div class="card" style="--c: ${card.color}">
        <div class="card-icon">${card.icon}</div>
        <div class="card-title">${card.title}</div>
        <div class="card-desc">${card.description}</div>
      </div>`).join("");

    return `<div class="cards-grid">${cards}</div>`;
  }, []);

  const generatedRolesMarkup = useMemo(() => {
    const accents = ["var(--accent3)", "var(--accent)", "var(--accent2)", "var(--accent4)", "var(--warn)", "var(--border2)"];
    const icons = ["👑", "🗂️", "🔧", "🛰️", "✅", "👁️"];
    const cards = roleNames.map((roleName, index) => {
      const items = inferRoleSummary(roleName).map((item) => `<div class="perm-item yes">${item}</div>`).join("");
      return `
        <div class="perm-card">
          <div class="perm-header" style="border-top: 2px solid ${accents[index % accents.length]}">
            <span class="perm-icon">${icons[index % icons.length]}</span>
            <span class="perm-name">${roleName}</span>
          </div>
          <div class="perm-list">${items}</div>
        </div>`;
    }).join("");

    return `
    <p>Permissions are stored as JSON in the <code>RoleConfigs</code> table (<code>ConfigJson</code>) and enforced by both the frontend (<code>usePermissions</code> hook) and backend (controller-level role checks).</p>
    <div class="info-box info-warn">
      <strong>Live role summary:</strong> ${roleCount} roles currently configured for this app. The cards below are generated from the current role names, while exact permissions still come from <code>RoleConfigs</code>.
    </div>
    <div class="perm-grid">${cards}</div>`;
  }, [roleCount, roleNames]);

  const generatedMobileSummaryMarkup = useMemo(() => `
    <div class="info-box info-warn">
      <strong>Live mobile summary:</strong> This app uses a shared React codebase with breakpoint-driven mobile behavior. Primary authenticated routes run inside <code>AppShell</code>, public mobile entry is <code>/mobile-upload</code>, and iPhone packaging is handled through Capacitor. Theme font stack is <code>Manrope, Sora, system-ui, sans-serif</code>.
    </div>
  `, []);

  const docsHtml = useMemo(() => {
    const cssPatch = `
  html, body {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }
  body {
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    font-family: "Manrope", "Sora", system-ui, -apple-system, sans-serif !important;
  }
  h1, h2, h3, h4, h5, h6, .hero h1, .section-title, .card-title {
    font-family: "Sora", "Manrope", system-ui, -apple-system, sans-serif !important;
  }
  .hero { padding: 56px 56px 40px; }
  .section { padding: 44px 56px; }
  .hero h1 { font-size: 40px; }
  .section-title { font-size: 21px; }
  .card-title { font-size: 15px; }
  .card-desc, .doc-table td, .step-desc { font-size: 12.5px; }
  .code-block { font-size: 11.5px; }
  #sidebar {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: auto !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: 100vh !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: 10px;
    overflow: hidden !important;
    border-right: 0 !important;
    border-bottom: 1px solid var(--border) !important;
    background: rgba(12, 26, 32, 0.96) !important;
    backdrop-filter: blur(18px);
    padding: 0 10px;
    z-index: 200 !important;
    min-height: 84px;
  }
  .top-nav-groups {
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    gap: 0;
    max-height: 84px;
    overflow: hidden;
    min-width: 0;
  }
  #main {
    margin-left: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box;
    overflow-x: hidden;
    padding-top: 84px;
  }
  .sidebar-logo {
    min-height: auto;
    padding: 6px 4px;
    border-bottom: 0;
    flex: 0 0 auto;
    grid-column: 1;
    grid-row: 1 / span 2;
  }
  .nav-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    white-space: nowrap;
    flex: 0 0 auto;
    max-width: 100%;
  }
  .nav-group:first-of-type {
    margin-left: 2px;
  }
  .nav-label {
    padding: 0;
    margin-right: 2px;
    flex: 0 0 auto;
    font-size: 12px;
  }
  .nav-item {
    padding: 4px 8px;
    border-left: 0 !important;
    border-bottom: 2px solid transparent;
    border-radius: 8px;
    white-space: nowrap;
    font-size: 12px;
  }
  .nav-item:hover, .nav-item.active {
    border-left-color: transparent !important;
    border-bottom-color: var(--accent);
  }
  .hero,
  .section,
  .arch-canvas,
  .info-box,
  .code-block,
  .doc-table,
  .schema-grid,
  .cards-grid,
  .perm-grid,
  .two-col,
  .three-col,
  table {
    max-width: 100%;
    min-width: 0;
  }
  .cards-grid,
  .schema-grid,
  .perm-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .schema-grid {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
  .two-col,
  .three-col {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
  .card,
  .schema-card,
  .perm-card,
  .arch-layer {
    min-width: 0;
    max-width: 100%;
  }
  .schema-fields {
    min-width: 0;
  }
  .schema-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    min-width: 0;
  }
  .field-name,
  .field-type,
  .schema-table-name,
  .schema-col-count {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .field-type,
  .schema-col-count {
    text-align: right;
  }
  .doc-table,
  table,
  .arch-canvas {
    overflow-x: auto;
  }
  @media (max-width: 1280px) {
    .hero,
    .section {
      padding: 34px 28px;
    }
  }
  @media (max-width: 1080px) {
    .hero,
    .section {
      padding: 30px 24px;
    }
  }
  @media (max-width: 1180px) {
    .hero,
    .section {
      padding: 28px 20px;
    }
    .cards-grid,
    .perm-grid,
    .two-col,
    .three-col {
      grid-template-columns: 1fr;
    }
    .schema-grid {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
  }
  @media (max-width: 760px) {
    #sidebar {
      padding: 0 6px;
    }
    .top-nav-groups {
      max-height: 84px;
    }
    .sidebar-logo {
      padding: 4px 2px;
    }
    .nav-group {
      padding: 5px 6px;
      gap: 4px;
    }
    .nav-item {
      padding: 3px 6px;
      font-size: 12px;
    }
  }
  .sidebar-logo {
    min-height: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    padding: 6px 4px;
    gap: 0;
  }
  .sidebar-logo.embedded-logo-button {
    cursor: pointer;
  }
  .sidebar-logo .embedded-brand-logo {
    display: block;
    max-width: 216px;
    max-height: 54px;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .sidebar-logo .embedded-brand-subtitle {
    display: none;
  }
`;

  const scriptPatch = `
  const sidebar = document.querySelector('#sidebar');
  if (sidebar && !sidebar.querySelector('.top-nav-groups')) {
    const navGroups = Array.from(sidebar.querySelectorAll('.nav-group'));
    if (navGroups.length > 0) {
      const navWrap = document.createElement('div');
      navWrap.className = 'top-nav-groups';
      navGroups.forEach((group) => navWrap.appendChild(group));
      sidebar.appendChild(navWrap);
    }
  }

  const embeddedLogo = document.querySelector('.embedded-logo-button');
  if (embeddedLogo) {
    embeddedLogo.addEventListener('click', () => {
      window.parent.postMessage({ type: 'commtrac-docs-close' }, '*');
    });
  }

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      const href = item.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', href);
      document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('active'));
      item.classList.add('active');
    });
  });
`;

    const docsLogoMarkup = `<div class="sidebar-logo embedded-logo-button" role="button" tabindex="0" aria-label="Return to application"><img class="embedded-brand-logo" src="${strataLogo}" alt="${appName}"><div class="embedded-brand-subtitle">About this app</div></div>`;
    const statsMarkup = `
  <div class="section" style="padding-bottom: 32px;">
    <div class="stat-row">
      <div class="stat"><div class="stat-val">${docsStats.tables}</div><div class="stat-label">Database Tables</div></div>
      <div class="stat"><div class="stat-val">${docsStats.columns}</div><div class="stat-label">Schema Columns</div></div>
      <div class="stat"><div class="stat-val">${CONTROLLER_COUNT}</div><div class="stat-label">API Controllers</div></div>
      <div class="stat"><div class="stat-val">${roleCount}</div><div class="stat-label">User Roles</div></div>
      <div class="stat"><div class="stat-val" style="color:var(--accent2);">${docsStats.relationships}</div><div class="stat-label">Relationships</div></div>
      <div class="stat"><div class="stat-val" style="color:var(--accent4);">${docsStats.upToDate}</div><div class="stat-label">Up to date</div></div>
    </div>
  </div>`;
    const schemaSummaryMarkup = `
    <div class="info-box info-warn">
      <strong>Schema summary:</strong> ${docsStats.tables} tables, ${docsStats.columns} columns, and ${docsStats.relationships} inferred relationships extracted from <code>docs/schema.json</code>. All foreign key relationships are application-enforced (indexed ID columns) rather than database-level FK constraints.
    </div>`;

    return appDocsHtml
      .split("commtrac-codex-915").join(appName)
      .replace("Codex 915 · System Docs", "")
      .replace("<title>Commtrac Codex 915 — Full System Documentation</title>", `<title>${appName} — About This App</title>`)
      .replace("<h1>Commtrac <span>Codex 915</span></h1>", `<h1>${appName}</h1>`)
      .replace(">Commtrac Codex 915</div>", `>${appName}</div>`)
      .replace(/\b[Cc]odex 915\b/g, "this app")
      .replace(/<div class="cards-grid">[\s\S]*?<\/div>\s*<\/div>\s*<!-- FIELD USE CASES -->/, `${generatedCapabilitiesMarkup}\n  </div>\n\n  <!-- FIELD USE CASES -->`)
      .replace(/<p>Permissions are stored as JSON[\s\S]*?<div class="code-block">/, `${generatedRolesMarkup}\n    <h3>Permission Flags (RoleConfig JSON)</h3>\n    <div class="code-block">`)
      .replace(/<div class="card-desc">Full app available on iPhone via Capacitor\.[\s\S]*?<\/div>/, `<div class="card-desc">Single React codebase, breakpoint-driven mobile layout, public mobile upload route, offline cache, and Capacitor-based iPhone packaging.</div>`)
      .replace(/<!-- DATABASE -->/, `${generatedMobileSummaryMarkup}\n\n  <!-- DATABASE -->`)
      .replace(/<div class="section" style="padding-bottom: 32px;">[\s\S]*?<\/div>\s*<\/div>\s*<!-- CAPABILITIES -->/, `${statsMarkup}\n\n  <!-- CAPABILITIES -->`)
      .replace(/<div class="info-box info-warn">[\s\S]*?<\/div>\s*<div class="schema-grid">/, `${schemaSummaryMarkup}\n    <div class="schema-grid">`)
      .replace(/Full System Documentation · Generated [0-9-]+/, `About this app · Up to date: ${docsStats.upToDate}`)
      .replace(/<div class="sidebar-logo">[\s\S]*?<\/div>/, docsLogoMarkup)
      .replace("</style>", `${cssPatch}\n</style>`)
      .replace("</script>", `${scriptPatch}\n</script>`);
  }, [appName, docsStats, generatedCapabilitiesMarkup, generatedMobileSummaryMarkup, generatedRolesMarkup, roleCount]);

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) setAppName(s.appName);
    }).catch(() => {});

    const handleBrandUpdate = (e: Event) => {
      const name = (e as CustomEvent<{ appName: string }>).detail?.appName;
      if (name) setAppName(name);
    };
    window.addEventListener("brand-name-changed", handleBrandUpdate);
    return () => window.removeEventListener("brand-name-changed", handleBrandUpdate);
  }, []);

  useEffect(() => {
    const syncRoles = () => setRoleCount(getRoleCountFromCache());

    syncRoles();
    window.addEventListener("roles-config-changed", syncRoles);
    window.addEventListener("storage", syncRoles);
    return () => {
      window.removeEventListener("roles-config-changed", syncRoles);
      window.removeEventListener("storage", syncRoles);
    };
  }, []);

  useEffect(() => {
    const syncRoleNames = () => setRoleNames(getRoleNamesFromCache());

    syncRoleNames();
    window.addEventListener("roles-config-changed", syncRoleNames);
    window.addEventListener("storage", syncRoleNames);
    return () => {
      window.removeEventListener("roles-config-changed", syncRoleNames);
      window.removeEventListener("storage", syncRoleNames);
    };
  }, []);

  useEffect(() => {
    officesService.getAll().then((offices: Office[]) => {
      const countries = Array.from(new Set(offices.map((office) => office.country).filter(Boolean)));
      setOfficeOptions([...countries.sort(), "All"]);
    }).catch(() => {
      setOfficeOptions(["All"]);
    });
  }, []);

  useEffect(() => {
    const handleDocsMessage = (event: MessageEvent) => {
      if (event.data?.type === "commtrac-docs-close") {
        setDocsOpen(false);
      }
    };

    window.addEventListener("message", handleDocsMessage);
    return () => window.removeEventListener("message", handleDocsMessage);
  }, []);

  return (
    <Box className="sidebar">
      <Box className="brand">
        <Box
          component="button"
          type="button"
          onClick={() => setDocsOpen(true)}
          aria-label="Open application documentation"
          sx={{
            display: "block",
            width: "100%",
            background: "transparent",
            border: 0,
            padding: 0,
            margin: 0,
            cursor: "pointer",
            textAlign: "left"
          }}
        >
          <Box component="img" className="brand-logo" src={strataLogo} alt={appName} sx={{ display: "block" }} />
        </Box>
      </Box>
      <Stack spacing={2}>
        <Box className="glass-card" sx={{ padding: "12px 14px" }}>
          <Typography variant="caption" color="text.secondary">
            Active global office
          </Typography>
          <FormControl size="small" fullWidth>
            <Select value={activeOffice} onChange={(event) => updateActiveOffice(event.target.value as typeof activeOffice)}>
              {officeOptions.map((office) => (
                <MenuItem key={office} value={office}>
                  {office}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ marginTop: 1, display: "block" }}>
            Signed in as {user?.fullName || "Local User"}
          </Typography>
          {appName && (
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", fontSize: "0.65rem" }}>
              {appName}
            </Typography>
          )}
        </Box>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
      </Stack>
      <FavoritesSection />
      <List sx={{ display: "flex", flexDirection: "column", gap: 0.5 }} data-tour="nav-sidebar">
        {visibleNavItems.map((item) => (
          <ListItemButton
            key={item.label}
            component={NavLink}
            to={item.to}
            end={item.end}
            data-tour={item.tourKey}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("app:side-nav-click"));
            }}
            sx={{
              borderRadius: 2,
              color: "text.primary",
              "&.active": {
                background: "rgba(45, 212, 191, 0.18)",
                color: "#eafaf7"
              }
            }}
          >
            <ListItemIcon sx={{ color: "inherit" }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Dialog fullScreen open={docsOpen} onClose={() => setDocsOpen(false)}>
        <Box sx={{ position: "relative", width: "100%", height: "100%", bgcolor: "#070d10" }}>
          <IconButton
            onClick={() => setDocsOpen(false)}
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 2,
              color: "#d8eef5",
              backgroundColor: "rgba(7, 13, 16, 0.85)",
              "&:hover": { backgroundColor: "rgba(12, 26, 32, 0.95)" }
            }}
          >
            <CloseOutlinedIcon />
          </IconButton>
          <Box
            component="iframe"
            title="Commtrac 915 system documentation"
            srcDoc={docsHtml}
            sx={{
              width: "100%",
              height: "100%",
              border: 0,
              display: "block",
              backgroundColor: "#070d10"
            }}
          />
        </Box>
      </Dialog>
    </Box>
  );
};

export default Sidebar;
