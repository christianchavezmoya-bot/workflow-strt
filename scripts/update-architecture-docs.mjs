import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8").replace(/^\uFEFF/, "");
}

function write(relPath, content) {
  fs.writeFileSync(path.join(repoRoot, relPath), content, "utf8");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseJson(relPath) {
  return JSON.parse(read(relPath));
}

function matchFirst(text, regex, fallback = "") {
  const match = text.match(regex);
  return match ? match[1] : fallback;
}

function readHeadInfo() {
  try {
    const head = read(".git/HEAD").trim();
    if (!head.startsWith("ref:")) {
      return { ref: "detached", short: head.slice(0, 7) || "unknown" };
    }
    const refPath = head.slice(5).trim();
    const fullSha = read(path.join(".git", refPath)).trim();
    return { ref: refPath.replace(/^refs\/heads\//, ""), short: fullSha.slice(0, 7) || "unknown" };
  } catch {
    return { ref: "unknown", short: "unknown" };
  }
}

function parseRouteEntries(routesSource) {
  const entries = [];
  const lines = routesSource.split(/\r?\n/);

  for (const line of lines) {
    if (!line.includes("<Route")) continue;

    const pathMatch = line.match(/path="([^"]+)"/);
    const index = line.includes("<Route index ");
    if (!pathMatch && !index) continue;

    const routePath = index ? "/" : pathMatch[1];
    const componentMatch = line.match(/<([A-Za-z0-9_]+)\s*\/>/g);
    let component = "Navigate/Wrapper";
    if (componentMatch && componentMatch.length > 0) {
      const lastTag = componentMatch[componentMatch.length - 1].match(/<([A-Za-z0-9_]+)/);
      if (lastTag) component = lastTag[1];
    }
    if (line.includes("<Navigate ")) component = "Navigate";
    if (line.includes("<ProjectInspectionsRedirect")) component = "ProjectInspectionsRedirect";

    const auth = ["/login", "/reset-password"].includes(routePath) || routePath.startsWith("/sign/")
      ? "Public"
      : "Required";

    let notes = "";
    if (routePath === "/settings") notes = "Permission-gated by SettingsRoute";
    if (routePath === "/mobile-upload") notes = "Standalone upload flow";
    if (routePath.includes("/admin/bom-project")) notes = "Shown only when BOM module is enabled";
    if (component === "Navigate" || component === "ProjectInspectionsRedirect") notes = notes ? `${notes}; redirect route` : "Redirect route";

    entries.push({ path: routePath, component, auth, notes });
  }

  return entries;
}

function parseNavItems(source, constName, pathKey) {
  const blockMatch = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[(.*?)\\];`, "s"));
  if (!blockMatch) return [];
  const block = blockMatch[1];
  const itemRegex = new RegExp(`label:\\s*"([^"]+)".*?${pathKey}:\\s*"([^"]+)"`, "gs");
  return [...block.matchAll(itemRegex)].map((match) => ({
    label: match[1],
    path: match[2],
  }));
}

function parseSidebarItems(source) {
  const directItems = [...source.matchAll(/label:\s*"([^"]+)".*?to:\s*"([^"]+)"/gs)].map((match) => ({
    label: match[1],
    path: match[2],
  }));

  const seen = new Set();
  return directItems.filter((item) => {
    const key = `${item.label}|${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseControllerNames() {
  const dir = path.join(repoRoot, "server", "Commtrac.Api", "Controllers");
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith("Controller.cs"))
    .map((name) => name.replace(/Controller\.cs$/, ""))
    .sort((a, b) => a.localeCompare(b));
}

function formatTable(headers, rows) {
  const lines = [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

const packageJson = parseJson("package.json");
const routesSource = read("src/app/routes.tsx");
const sidebarSource = read("src/components/layout/Sidebar.tsx");
const bottomTabSource = read("src/components/layout/BottomTabBar.tsx");
const appSource = read("src/app/App.tsx");
const mainSource = read("src/main.tsx");
const appShellSource = read("src/components/layout/AppShell.tsx");
const launchSettings = parseJson("server/Commtrac.Api/Properties/launchSettings.json");
const viteConfig = read("vite.config.ts");
const headInfo = readHeadInfo();

const vitePort = matchFirst(viteConfig, /port:\s*(\d+)/, "5173");
const viteHost = matchFirst(viteConfig, /host:\s*"([^"]+)"/, "0.0.0.0");
const strictPort = /strictPort:\s*true/.test(viteConfig) ? "true" : "false";
const apiHttpUrl = launchSettings.profiles?.http?.applicationUrl ?? "http://0.0.0.0:4000";

const routeRows = parseRouteEntries(routesSource);
const desktopNav = parseSidebarItems(sidebarSource);
const mobilePrimaryNav = parseNavItems(bottomTabSource, "PRIMARY_TABS", "path");
const mobileMoreNav = parseNavItems(bottomTabSource, "MORE_ITEMS", "to");
const controllers = parseControllerNames();

const authFlow = [
  appSource.includes("BiometricLockScreen") ? "Biometric/PIN lock screen supported on native-capable flows" : null,
  appSource.includes('authState === "no-session"') ? "Login screen shown when there is no active session or grace period expired" : null,
  mainSource.includes("BrowserRouter") ? "BrowserRouter drives the web app shell and page routing" : null,
].filter(Boolean);

const shellNotes = [
  appShellSource.includes("<Sidebar />") ? "Desktop layout uses a left sidebar." : null,
  appShellSource.includes("<BottomTabBar />") ? "Mobile layout uses a bottom tab bar." : null,
  appShellSource.includes("NotificationBanner") ? "Global banners and sync status render above page content." : null,
  appShellSource.includes("PullToRefresh") ? "Main page content is wrapped in pull-to-refresh." : null,
].filter(Boolean);

const controllerGroups = [
  ["Core", controllers.filter((name) => ["Auth", "Users", "Projects", "ProjectAssets", "Issues", "Dashboard", "Health"].includes(name)).join(", ")],
  ["Workflow", controllers.filter((name) => name.startsWith("Workflow") || name.startsWith("Work") || name.startsWith("AssetWorkflow") || name === "SignatureTokens" || name === "SignatureEvents" || name === "PublicSign").join(", ")],
  ["Admin/Config", controllers.filter((name) => ["Settings", "BrandSettings", "RoleConfigs", "CustomFields", "FieldDefinitions", "FieldValues", "TableConfigs", "Admin", "AdminTabs", "AdminTabRows", "Offices"].includes(name)).join(", ")],
  ["Content/Sync", controllers.filter((name) => ["Documents", "AssetDocuments", "AssetDocumentLinks", "Search", "Notifications", "Sse", "MobileUpload", "InspectionImports"].includes(name)).join(", ")],
];

const architectureDoc = `# workflow-strt Architecture
Last updated: ${todayIso()}
Source branch: \`${headInfo.ref}\`
Source commit: \`${headInfo.short}\`

This file is generated by \`scripts/update-architecture-docs.mjs\`. Do not hand-edit it unless you are also updating the generator.

## Overview

workflow-strt is a shared web/mobile field operations app with:

${formatTable(
  ["Target", "Implementation", "Entry"],
  [
    ["Web browser", `React + Vite (${packageJson.name} ${packageJson.version})`, `http://<host>:${vitePort}`],
    ["Mobile wrappers", "Capacitor Android + iOS using the same React bundle", "android/ and ios/"],
    ["Backend API", "ASP.NET Core + SQLite", apiHttpUrl],
  ],
)}

## Runtime shape

- Frontend router: \`BrowserRouter\`
- Vite dev server: host \`${viteHost}\`, port \`${vitePort}\`, strictPort \`${strictPort}\`
- API default expectation: \`http://<host>:4000/api\` or \`VITE_API_BASE\`
- Shared shell: \`AppShell\` wraps authenticated routes

## Auth and app boot

${authFlow.map((line) => `- ${line}`).join("\n")}

## Main shell

${shellNotes.map((line) => `- ${line}`).join("\n")}

## Route map

${formatTable(
  ["Path", "Component", "Auth", "Notes"],
  routeRows.map((route) => [
    `\`${route.path}\``,
    `\`${route.component}\``,
    route.auth,
    route.notes || "",
  ]),
)}

## Desktop navigation

${formatTable(
  ["Label", "Path"],
  desktopNav.map((item) => [`\`${item.label}\``, `\`${item.path}\``]),
)}

## Mobile navigation

Primary tabs:

${formatTable(
  ["Label", "Path"],
  mobilePrimaryNav.map((item) => [`\`${item.label}\``, `\`${item.path}\``]),
)}

More drawer:

${formatTable(
  ["Label", "Path"],
  mobileMoreNav.map((item) => [`\`${item.label}\``, `\`${item.path}\``]),
)}

## Backend surface

${formatTable(["Area", "Controllers"], controllerGroups)}

All controllers discovered from \`server/Commtrac.Api/Controllers\`: ${controllers.map((name) => `\`${name}Controller\``).join(", ")}

## Key directories

${formatTable(
  ["Path", "Purpose"],
  [
    ["\`src/app\`", "App bootstrap and route table"],
    ["\`src/components/layout\`", "Shared shell, sidebar, topbar, mobile tabs"],
    ["\`src/features\`", "Page-level feature modules"],
    ["\`src/services\`", "API/domain service layer and local data helpers"],
    ["\`src/modules/bom-project\`", "Feature-flagged BOM-to-Project workflow"],
    ["\`server/Commtrac.Api\`", "ASP.NET Core API, controllers, services, EF/SQLite"],
    ["\`docs\`", "Generated architecture doc plus supporting reference docs"],
  ],
)}

## Docs automation

- Regenerate docs manually with \`npm run docs:update\`
- The repo pre-commit hook runs the same generator and stages \`docs/ARCHITECTURE.md\`
- Hook install command: \`npm run hooks:install\`
- This generator intentionally avoids spawning git so it can run under restrictive environments
- The docs snapshot reflects the checked-out files and current HEAD ref/commit
`;

write("docs/ARCHITECTURE.md", `${architectureDoc}\n`);
