export interface SceneView {
  src: string;
  label: string;
  variant?: "desktop" | "phone";
}

export type SceneSection = "welcome" | "overview" | "journey" | "platform" | "cta";
export type SceneLayout = "grid" | "info" | "architecture" | "journey";

export interface Scene {
  id: number;
  audio: string;
  title: string;
  subtitle: string;
  tag: string;
  section: SceneSection;
  layout?: SceneLayout;
  journeyStep?: { current: number; total: number };
  bullets?: string[];
  views: SceneView[];
}

const S = "screenshots/scenes";

function views(
  sceneId: number,
  labels: [string, string, string, string],
  variants?: [SceneView["variant"], SceneView["variant"], SceneView["variant"], SceneView["variant"]]
): SceneView[] {
  const id = String(sceneId).padStart(2, "0");
  return labels.map((label, i) => ({
    src: `${S}/${id}-v${i + 1}.png`,
    label,
    variant: variants?.[i] ?? "desktop",
  }));
}

export const SCENES: Scene[] = [
  {
    id: 1,
    section: "welcome",
    layout: "info",
    audio: "audio/scene-01.mp3",
    title: "Strata Workflow App",
    subtitle: "Field operations for telecom & utility project management",
    tag: "Welcome",
    bullets: [
      "Track projects, install and inspect assets on site",
      "Run step-by-step workflows with photos, signatures & issues",
      "One React bundle — web, Android, iOS — plus ASP.NET Core API",
      "Demo login: admin@commtrac.local / Admin123!",
    ],
    views: views(1, ["Operations dashboard", "Projects portfolio", "Asset registry", "Mobile field home"], ["desktop", "desktop", "desktop", "phone"]),
  },
  {
    id: 2,
    section: "overview",
    layout: "info",
    audio: "audio/scene-02.mp3",
    title: "One App, Three Deployments",
    subtitle: "Same experience everywhere your teams work",
    tag: "Platform",
    bullets: [
      "Web — React 18 + TypeScript + MUI v5, Vite, Redux, React Router",
      "Mobile — same bundle in Capacitor 8 (Android + iOS)",
      "Backend — ASP.NET Core 8 + EF Core + SQLite, JWT on port 4000",
    ],
    views: views(2, ["Sidebar navigation", "Work instructions", "Admin console", "Mobile tab bar"], ["desktop", "desktop", "desktop", "phone"]),
  },
  {
    id: 3,
    section: "overview",
    audio: "audio/scene-03.mp3",
    title: "Projects",
    subtitle: "Top-level container for every job",
    tag: "Projects",
    bullets: [
      "Assets, contacts, inspections, documents & delivery profiles",
      "Browse /projects, open detail, manage status & linked assets",
    ],
    views: views(3, ["Projects list", "Expanded project row", "Project snapshot", "Workflow actions"]),
  },
  {
    id: 4,
    section: "overview",
    audio: "audio/scene-04.mp3",
    title: "Assets & Installations",
    subtitle: "The main field-work surface",
    tag: "Assets",
    bullets: [
      "Workflow assignments, status (Not Started → Complete), documents & run history",
      "Technicians pick a project, find their asset, press Start Run",
    ],
    views: views(4, ["Project filter", "Asset columns", "Asset row", "Expanded asset / Start Run"]),
  },
  {
    id: 5,
    section: "overview",
    audio: "audio/scene-05.mp3",
    title: "Guided Workflows",
    subtitle: "WorkOrderRunner — heart of on-site work",
    tag: "Workflows",
    bullets: [
      "Photos/video, text/checkbox/QR, time tracking, issues & signatures",
      "Blocking issues prevent completion (HTTP 422) · PDF reports auto-generate",
    ],
    views: views(5, ["Work instructions", "Run workflow setup", "Step-by-step runner", "Workflow builder"]),
  },
  {
    id: 6,
    section: "overview",
    audio: "audio/scene-06.mp3",
    title: "Operations Dashboard",
    subtitle: "Office-scoped visibility",
    tag: "Dashboard",
    bullets: [
      "Open issues, pending signatures, technician workload",
      "Evidence completeness, workflow health, quick resume & photo upload",
    ],
    views: views(6, ["Needs attention", "Evidence completeness", "Technician workload", "Dashboard tabs"]),
  },
  {
    id: 7,
    section: "overview",
    audio: "audio/scene-07.mp3",
    title: "Issues Board",
    subtitle: "Cross-project issue tracking",
    tag: "Issues",
    bullets: [
      "Kanban-style view of asset issues across all projects",
      "Track, assign & resolve blocking and non-blocking problems",
    ],
    views: views(7, ["Issues board", "Blocking KPIs", "Issue filters", "Dashboard alerts"]),
  },
  {
    id: 8,
    section: "overview",
    audio: "audio/scene-08.mp3",
    title: "Supporting Modules",
    subtitle: "Documents, admin, mobile upload & more",
    tag: "Supporting",
    bullets: [
      "Documents library · Tips & tricks · Admin (users, sites, registry)",
      "Settings, 2FA, brand · Mobile Upload (/mobile-upload) QR flow · BOM module (flagged)",
    ],
    views: views(8, ["Document library", "Work instructions", "Admin console", "Tips & tricks"]),
  },
  // ── Live user journey walkthrough ──
  {
    id: 9,
    section: "journey",
    layout: "journey",
    journeyStep: { current: 1, total: 8 },
    audio: "audio/scene-09.mp3",
    title: "Create a Project",
    subtitle: "Step 1 — set up the job container",
    tag: "User Journey",
    bullets: [
      "Open Projects → Create project",
      "Enter job number, customer, site & workflow mode",
      "Save — project appears in the portfolio ready for assets",
    ],
    views: views(9, ["Create project button", "New project form", "Project fields", "Saved project row"]),
  },
  {
    id: 10,
    section: "journey",
    layout: "journey",
    journeyStep: { current: 2, total: 8 },
    audio: "audio/scene-10.mp3",
    title: "Add Assets & Assign Workflows",
    subtitle: "Step 2 — register equipment on the project",
    tag: "User Journey",
    bullets: [
      "Open Assets, filter by your new project",
      "Add assets with tag, serial, location & product config",
      "Workflow assignments link work instructions to each asset",
    ],
    views: views(10, ["Project filter", "Add asset", "Asset table row", "Workflow assignment"]),
  },
  {
    id: 11,
    section: "journey",
    layout: "journey",
    journeyStep: { current: 3, total: 8 },
    audio: "audio/scene-11.mp3",
    title: "Start Run on an Asset",
    subtitle: "Step 3 — launch the workflow runner",
    tag: "User Journey",
    bullets: [
      "Technician finds their asset in the registry",
      "Click Start Run — choose workflow & confirm setup",
      "WorkOrderRunner opens with the first step",
    ],
    views: views(11, ["Start Run button", "Run setup dialog", "Workflow selection", "Runner opens"]),
  },
  {
    id: 12,
    section: "journey",
    layout: "journey",
    journeyStep: { current: 4, total: 8 },
    audio: "audio/scene-12.mp3",
    title: "Complete Workflow Steps",
    subtitle: "Step 4 — follow the guided checklist",
    tag: "User Journey",
    bullets: [
      "Each step shows instructions, reference media & capture fields",
      "Check boxes, enter readings, scan QR codes as required",
      "Navigate forward — progress saves automatically",
    ],
    views: views(12, ["Runner step view", "Capture fields", "Step navigation", "Progress indicator"]),
  },
  {
    id: 13,
    section: "journey",
    layout: "journey",
    journeyStep: { current: 5, total: 8 },
    audio: "audio/scene-13.mp3",
    title: "Capture Photos & Video",
    subtitle: "Step 5 — evidence on every step",
    tag: "User Journey",
    bullets: [
      "Tap Photo/Video on any step that requires media",
      "Use camera or gallery — files attach to the run",
      "Missing captures flagged before completion",
    ],
    views: views(13, ["Photo capture button", "Camera / gallery", "Attached media", "Missing capture alert"]),
  },
  {
    id: 14,
    section: "journey",
    layout: "journey",
    journeyStep: { current: 6, total: 8 },
    audio: "audio/scene-14.mp3",
    title: "Log an Issue",
    subtitle: "Step 6 — flag blocking or observation issues",
    tag: "User Journey",
    bullets: [
      "Flag issue on any step — blocking, observation, or scope deviation",
      "Add description, severity & optional photo attachment",
      "Blocking issues must be resolved before the run can complete",
    ],
    views: views(14, ["Flag issue button", "Issue type & description", "Issue on step", "Issues board entry"]),
  },
  {
    id: 15,
    section: "journey",
    layout: "journey",
    journeyStep: { current: 7, total: 8 },
    audio: "audio/scene-15.mp3",
    title: "Add Photo from Phone",
    subtitle: "Step 7 — QR mobile upload flow",
    tag: "User Journey",
    bullets: [
      "Generate QR from dashboard or workflow — opens /mobile-upload",
      "Technician scans with phone camera, no app install needed",
      "Photo uploads directly to the pending run or missing-media slot",
    ],
    views: views(15, ["QR upload button", "QR code dialog", "Mobile upload page", "Upload confirmation"], ["desktop", "desktop", "phone", "phone"]),
  },
  {
    id: 16,
    section: "journey",
    layout: "journey",
    journeyStep: { current: 8, total: 8 },
    audio: "audio/scene-16.mp3",
    title: "Complete & Sign Off",
    subtitle: "Step 8 — finish the run",
    tag: "User Journey",
    bullets: [
      "Review summary — captures, issues & time entries",
      "Installer & customer signatures (on-device or email link /sign/:token)",
      "Run locks · PDF report generates · dashboard updates",
    ],
    views: views(16, ["Run summary", "Signature capture", "Completed run", "Generated report"]),
  },
  // ── Platform depth ──
  {
    id: 17,
    section: "platform",
    audio: "audio/scene-17.mp3",
    title: "Offline-First Mobile",
    subtitle: "Built for real field conditions",
    tag: "Offline",
    bullets: [
      "Prefetch projects, assets, configs, assignments & media into IndexedDB",
      "Writes queue offline · sync on reconnect with 409/412 conflict detection",
      "Photos/signatures on Capacitor Filesystem via mediaStore",
    ],
    views: views(17, ["Mobile sync bar", "Offline assets", "Mobile projects", "Desktop sync status"], ["phone", "phone", "phone", "desktop"]),
  },
  {
    id: 18,
    section: "platform",
    layout: "architecture",
    audio: "audio/scene-18.mp3",
    title: "Architecture",
    subtitle: "How the system fits together",
    tag: "Architecture",
    bullets: [
      "features/ → services/ → repositories/ → Redux store",
      "Flat REST controllers · projectId as query param · ~98 EF migrations",
      "JWT short claims · two-tier permissions · biometric lock on native",
    ],
    views: views(18, ["User management", "Role permissions", "Settings", "Secure login"]),
  },
  {
    id: 19,
    section: "platform",
    layout: "info",
    audio: "audio/scene-19.mp3",
    title: "Enterprise & Dev Stack",
    subtitle: "Secure, scalable, audit-ready",
    tag: "Enterprise",
    bullets: [
      "npm run dev (:5173) · npm run build · npm run test:e2e",
      "dotnet run in server/Commtrac.Api (:4000, Swagger /swagger)",
      "SSE live updates · SQLite WAL · role-based access · audit records",
    ],
    views: views(19, ["Roles configuration", "Permission matrix", "Workflow templates", "Document control"]),
  },
  {
    id: 20,
    section: "cta",
    audio: "audio/scene-20.mp3",
    title: "Transform Field Operations",
    subtitle: "From first project to final sign-off",
    tag: "Next Steps",
    bullets: [
      "Office planners & field technicians in one trusted system",
      "Ready to walk through your workflows on a live demo?",
    ],
    views: views(20, ["Active project", "Asset progress", "Regional snapshot", "Mobile projects"], ["desktop", "desktop", "desktop", "phone"]),
  },
];

export const SCENE_COUNT = SCENES.length;
export const VIEWS_PER_SCENE = 4;

export const SECTION_LABELS: Record<SceneSection, string> = {
  welcome: "Welcome",
  overview: "Product Overview",
  journey: "Live User Journey",
  platform: "Platform & Architecture",
  cta: "Next Steps",
};

export const FALLBACK_DURATIONS_MS: Record<number, number> = {
  1: 18000, 2: 16500, 3: 16000, 4: 15500, 5: 17500, 6: 15000, 7: 14000, 8: 16500,
  9: 15500, 10: 16000, 11: 15000, 12: 16000, 13: 15000, 14: 16500, 15: 17000, 16: 16000,
  17: 19000, 18: 20000, 19: 17500, 20: 14000,
};
