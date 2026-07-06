export type SceneSection = "welcome" | "overview" | "journey" | "platform" | "cta";
export type SceneLayout =
  | "hero"        // one large screenshot (object-fit: contain)
  | "compare"     // desktop + phone side by side
  | "grid"        // 2×2 contain screenshots
  | "video"       // mp4 primary (journey)
  | "architecture"// interactive arch graph
  | "journey";    // work-tree + (video or screenshot)

export interface Shot {
  src: string;
  label: string;
  variant?: "desktop" | "phone";
}

export interface Scene {
  id: number;
  audio: string;
  title: string;
  subtitle: string;
  tag: string;
  section: SceneSection;
  layout: SceneLayout;
  bullets?: string[];
  shots?: Shot[];
  video?: string;
  videoVariant?: "desktop" | "phone";
  /** journey step (1..8) — drives the work-tree highlight */
  journeyStep?: number;
}

const H = "screenshots/hero";
const M = "screenshots/mobile";
const V = "videos";

export const JOURNEY_STEPS = [
  "Create Project",
  "Add Assets",
  "Start Run",
  "Complete Steps",
  "Capture Photos",
  "Log Issue",
  "Phone Upload",
  "Sign Off",
];

export const SCENES: Scene[] = [
  {
    id: 1, section: "welcome", layout: "hero", audio: "audio/scene-01.mp3",
    tag: "Welcome", title: "Strata Workflow App",
    subtitle: "Field operations for telecom & utility project management",
    bullets: [
      "Track projects · install & inspect assets on site",
      "Guided workflows with photos, signatures, issues & reports",
      "One React bundle — web, Android, iOS — plus ASP.NET Core API",
    ],
    shots: [{ src: `${H}/dashboard.png`, label: "Operations dashboard" }],
  },
  {
    id: 2, section: "overview", layout: "architecture", audio: "audio/scene-02.mp3",
    tag: "Platform", title: "One App, Three Deployments",
    subtitle: "Same experience everywhere your teams work",
    bullets: [
      "Web — React 18 + TypeScript + MUI v5, Vite, Redux",
      "Mobile — same bundle in Capacitor 8 (Android + iOS)",
      "Backend — ASP.NET Core 8 + EF Core + SQLite, JWT :4000",
    ],
  },
  {
    id: 3, section: "overview", layout: "compare", audio: "audio/scene-03.mp3",
    tag: "Projects", title: "Projects",
    subtitle: "Top-level container for every job",
    bullets: [
      "Assets, contacts, inspections, documents & delivery profiles",
      "Browse, open a detail page, manage status & linked assets",
    ],
    shots: [
      { src: `${H}/projects.png`, label: "Projects list", variant: "desktop" },
      { src: `${M}/projects.png`, label: "Mobile projects", variant: "phone" },
    ],
  },
  {
    id: 4, section: "overview", layout: "hero", audio: "audio/scene-04.mp3",
    tag: "Assets", title: "Assets & Installations",
    subtitle: "The main field-work surface",
    bullets: [
      "Workflow assignments · status Not Started → Complete",
      "Documents, inspection history, run history per asset",
      "Technicians pick a project, find equipment, press Start Run",
    ],
    shots: [{ src: `${H}/assets-expanded.png`, label: "Project assets — expanded row" }],
  },
  {
    id: 5, section: "overview", layout: "compare", audio: "audio/scene-05.mp3",
    tag: "Workflows", title: "Guided Workflows",
    subtitle: "WorkOrderRunner — the heart of on-site work",
    bullets: [
      "Photos/video, text, checkbox, QR, time tracking",
      "Blocking issues prevent completion (HTTP 422)",
      "Signatures on-device or via email link · PDF reports",
    ],
    shots: [
      { src: `${H}/work-instructions.png`, label: "Work instructions", variant: "desktop" },
      { src: `${H}/runner-step.png`, label: "Step-by-step runner", variant: "desktop" },
    ],
  },
  {
    id: 6, section: "overview", layout: "hero", audio: "audio/scene-06.mp3",
    tag: "Dashboard", title: "Operations Dashboard",
    subtitle: "Office-scoped visibility & quick actions",
    bullets: [
      "Open issues, pending signatures, technician workload",
      "Evidence completeness & workflow health",
      "Resume runs or upload missing photos in one click",
    ],
    shots: [{ src: `${H}/dashboard.png`, label: "Operations dashboard" }],
  },
  {
    id: 7, section: "overview", layout: "hero", audio: "audio/scene-07.mp3",
    tag: "Issues", title: "Issues Board",
    subtitle: "Cross-project issue tracking",
    bullets: [
      "Kanban-style view of every asset issue",
      "Track, assign & resolve blocking and non-blocking problems",
    ],
    shots: [{ src: `${H}/issues.png`, label: "Issues board" }],
  },
  {
    id: 8, section: "overview", layout: "grid", audio: "audio/scene-08.mp3",
    tag: "Supporting", title: "Supporting Modules",
    subtitle: "Documents, admin, mobile upload & more",
    bullets: [
      "Documents · Tips & tricks · Admin (users, sites, registry)",
      "Settings, 2FA · Mobile Upload QR flow · BOM module (flagged)",
    ],
    shots: [
      { src: `${H}/documents.png`, label: "Documents" },
      { src: `${H}/admin.png`, label: "Admin console" },
      { src: `${H}/settings.png`, label: "Settings" },
      { src: `${H}/tips.png`, label: "Tips & tricks" },
    ],
  },

  // ── Live user journey (steps 1–8) ──
  {
    id: 9, section: "journey", layout: "video", audio: "audio/scene-09.mp3",
    tag: "User Journey", title: "Step 1 — Create a Project",
    subtitle: "Set up the top-level job container",
    journeyStep: 1,
    bullets: [
      "Open Projects → Create project",
      "Enter job number, customer, site & workflow mode",
      "Save — the project is ready for assets",
    ],
    video: `${V}/journey-create-project.mp4`,
  },
  {
    id: 10, section: "journey", layout: "journey", audio: "audio/scene-10.mp3",
    tag: "User Journey", title: "Step 2 — Add Assets",
    subtitle: "Register equipment on the project",
    journeyStep: 2,
    bullets: [
      "Open Assets, filter by your project",
      "Add assets with tag, serial, model & location",
      "Assign the workflow that applies to each asset",
    ],
    shots: [{ src: `${H}/assets.png`, label: "Project assets" }],
  },
  {
    id: 11, section: "journey", layout: "video", audio: "audio/scene-11.mp3",
    tag: "User Journey", title: "Step 3 — Start Run",
    subtitle: "Launch the guided workflow",
    journeyStep: 3,
    bullets: [
      "Find the asset and click Start Run",
      "Confirm the Run workflow setup dialog",
      "WorkOrderRunner opens on the first step",
    ],
    video: `${V}/journey-workflow-run.mp4`,
  },
  {
    id: 12, section: "journey", layout: "journey", audio: "audio/scene-12.mp3",
    tag: "User Journey", title: "Step 4 — Complete Steps",
    subtitle: "Follow the guided checklist",
    journeyStep: 4,
    bullets: [
      "Each step shows instructions & capture fields",
      "Tick checkboxes, enter readings, scan QR codes",
      "Time tracking runs; progress saves automatically",
    ],
    shots: [{ src: `${H}/runner-step.png`, label: "Runner — Step 1 of 4" }],
  },
  {
    id: 13, section: "journey", layout: "journey", audio: "audio/scene-13.mp3",
    tag: "User Journey", title: "Step 5 — Capture Photos",
    subtitle: "Evidence on every step",
    journeyStep: 5,
    bullets: [
      "Tap Photo / Video on steps that require media",
      "Use the camera or gallery — files attach to the run",
      "Missing captures are flagged before completion",
    ],
    shots: [{ src: `${H}/runner-step.png`, label: "Photo capture step" }],
  },
  {
    id: 14, section: "journey", layout: "journey", audio: "audio/scene-14.mp3",
    tag: "User Journey", title: "Step 6 — Log an Issue",
    subtitle: "Flag blocking or observation issues",
    journeyStep: 6,
    bullets: [
      "Flag issue on any step — blocking, observation, scope deviation",
      "Add description, severity & optional photo",
      "Blocking issues must be resolved before completion",
    ],
    shots: [{ src: `${H}/issues.png`, label: "Issues board entry" }],
  },
  {
    id: 15, section: "journey", layout: "video", audio: "audio/scene-15.mp3",
    tag: "User Journey", title: "Step 7 — Add Photo from Phone",
    subtitle: "QR mobile upload flow",
    journeyStep: 7,
    bullets: [
      "Generate a QR code from the dashboard or runner",
      "Scan with any phone — no app install needed",
      "The photo uploads straight to the pending run",
    ],
    video: `${V}/journey-mobile-upload.mp4`,
    videoVariant: "phone",
  },
  {
    id: 16, section: "journey", layout: "journey", audio: "audio/scene-16.mp3",
    tag: "User Journey", title: "Step 8 — Complete & Sign Off",
    subtitle: "Finish the run",
    journeyStep: 8,
    bullets: [
      "Review summary — captures, issues & time entries",
      "Installer & customer signatures (device or email link)",
      "Run locks · PDF report generates · dashboard updates",
    ],
    shots: [{ src: `${H}/project-detail.png`, label: "Project detail & sign-off" }],
  },

  // ── Platform depth ──
  {
    id: 17, section: "platform", layout: "compare", audio: "audio/scene-17.mp3",
    tag: "Offline", title: "Offline-First Mobile",
    subtitle: "Built for real field conditions",
    bullets: [
      "Prefetch projects, assets, configs & media into IndexedDB",
      "Writes queue offline · sync on reconnect (409/412 conflicts)",
      "Photos & signatures on Capacitor Filesystem via mediaStore",
    ],
    shots: [
      { src: `${M}/dashboard.png`, label: "Mobile dashboard", variant: "phone" },
      { src: `${M}/assets.png`, label: "Mobile assets", variant: "phone" },
    ],
  },
  {
    id: 18, section: "platform", layout: "architecture", audio: "audio/scene-18.mp3",
    tag: "Architecture", title: "Architecture",
    subtitle: "How the system fits together",
    bullets: [
      "features/ → services/ → repositories/ → Redux store",
      "Flat REST controllers · projectId query param · ~98 migrations",
      "JWT short claims · two-tier permissions · biometric on native",
    ],
  },
  {
    id: 19, section: "platform", layout: "hero", audio: "audio/scene-19.mp3",
    tag: "Enterprise", title: "Enterprise & Dev Stack",
    subtitle: "Secure, scalable, audit-ready",
    bullets: [
      "User management, brand settings, role-based access, audit records",
      "npm run dev :5173 · dotnet run :4000 (Swagger) · Playwright e2e",
      "SQLite WAL · SSE live updates across connected clients",
    ],
    shots: [{ src: `${H}/admin.png`, label: "Admin & user management" }],
  },
  {
    id: 20, section: "cta", layout: "hero", audio: "audio/scene-20.mp3",
    tag: "Next Steps", title: "Transform Field Operations",
    subtitle: "From first project to final sign-off",
    bullets: [
      "Office planners & field technicians in one trusted system",
      "Ready for a live walkthrough on your projects?",
    ],
    shots: [{ src: `${H}/project-detail.png`, label: "Active project" }],
  },
];

export const SCENE_COUNT = SCENES.length;

export const SECTION_LABELS: Record<SceneSection, string> = {
  welcome: "Welcome",
  overview: "Product Overview",
  journey: "Live User Journey",
  platform: "Platform & Architecture",
  cta: "Next Steps",
};

export const FALLBACK_DURATIONS_MS: Record<number, number> = {
  1: 17000, 2: 17000, 3: 15000, 4: 16000, 5: 17000, 6: 15000, 7: 13000, 8: 15000,
  9: 16000, 10: 15000, 11: 17000, 12: 15000, 13: 15000, 14: 16000, 15: 16000, 16: 16000,
  17: 18000, 18: 19000, 19: 17000, 20: 13000,
};
