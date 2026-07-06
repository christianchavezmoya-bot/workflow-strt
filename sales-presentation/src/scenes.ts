export interface SceneBullet {
  text: string;
}

export interface SceneScreens {
  primary?: string;
  secondary?: string;
  layout?: "single" | "split-platforms" | "phone";
}

export interface Scene {
  id: number;
  audio: string;
  title: string;
  subtitle: string;
  tag: string;
  bullets?: SceneBullet[];
  screens?: SceneScreens;
}

const S = "screenshots";

export const SCENES: Scene[] = [
  {
    id: 1,
    audio: "audio/scene-01.mp3",
    title: "Strata Workflow App",
    subtitle: "Field operations for telecom and utility project management",
    tag: "Welcome",
    bullets: [
      { text: "Track projects, assets, and field workflows in one place" },
      { text: "Capture photos, signatures, issues, and reports on site" },
    ],
    screens: { primary: `${S}/desktop-dashboard.png`, layout: "single" },
  },
  {
    id: 2,
    audio: "audio/scene-02.mp3",
    title: "Built for Field Teams",
    subtitle: "Technicians and project managers, aligned end to end",
    tag: "Overview",
    bullets: [
      { text: "Install and inspect assets with guided work instructions" },
      { text: "Replace scattered checklists, photos, and spreadsheets" },
    ],
    screens: { primary: `${S}/desktop-project-detail.png`, secondary: `${S}/desktop-projects.png`, layout: "single" },
  },
  {
    id: 3,
    audio: "audio/scene-03.mp3",
    title: "One App, Three Deployments",
    subtitle: "React web · Capacitor mobile · ASP.NET Core API",
    tag: "Platform",
    bullets: [
      { text: "Web: React 18, TypeScript, MUI, Vite, Redux" },
      { text: "Mobile: same bundle on Android and iOS via Capacitor 8" },
      { text: "Backend: ASP.NET Core 8, EF Core, SQLite, JWT auth" },
    ],
    screens: {
      primary: `${S}/desktop-dashboard.png`,
      secondary: `${S}/mobile-dashboard.png`,
      layout: "split-platforms",
    },
  },
  {
    id: 4,
    audio: "audio/scene-04.mp3",
    title: "Projects",
    subtitle: "Your top-level operational container",
    tag: "Projects",
    bullets: [
      { text: "Assets, contacts, inspections, documents, delivery profiles" },
      { text: "Browse, open detail, and manage status from /projects" },
    ],
    screens: { primary: `${S}/desktop-projects.png`, layout: "single" },
  },
  {
    id: 5,
    audio: "audio/scene-05.mp3",
    title: "Assets & Installations",
    subtitle: "The main field-work surface",
    tag: "Assets",
    bullets: [
      { text: "Workflow assignments, live status, documents, and run history" },
      { text: "Pick a project, find your asset, and Start Run" },
    ],
    screens: { primary: `${S}/desktop-assets.png`, layout: "single" },
  },
  {
    id: 6,
    audio: "audio/scene-06.mp3",
    title: "Guided Workflows",
    subtitle: "WorkOrderRunner — the heart of on-site work",
    tag: "Workflows",
    bullets: [
      { text: "Photos, QR inputs, time tracking, issues, and signatures" },
      { text: "Blocking issues prevent sign-off; reports generate automatically" },
    ],
    screens: { primary: `${S}/desktop-workflow-runner.png`, secondary: `${S}/desktop-assets.png`, layout: "single" },
  },
  {
    id: 7,
    audio: "audio/scene-07.mp3",
    title: "Operations Dashboard",
    subtitle: "Office-scoped visibility and quick actions",
    tag: "Dashboard",
    bullets: [
      { text: "Open issues, pending signatures, technician workload" },
      { text: "Evidence completeness, workflow health, resume runs" },
    ],
    screens: { primary: `${S}/desktop-dashboard.png`, layout: "single" },
  },
  {
    id: 8,
    audio: "audio/scene-08.mp3",
    title: "Issues Board",
    subtitle: "Cross-project issue tracking",
    tag: "Issues",
    bullets: [
      { text: "Kanban-style view of blocking and non-blocking problems" },
      { text: "Assign, resolve, and audit across every project" },
    ],
    screens: { primary: `${S}/desktop-issues.png`, layout: "single" },
  },
  {
    id: 9,
    audio: "audio/scene-09.mp3",
    title: "Documents & More",
    subtitle: "Knowledge, admin, and mobile upload",
    tag: "Supporting",
    bullets: [
      { text: "Document library, work instructions, tips for field staff" },
      { text: "Admin, settings, profile, and QR mobile upload flows" },
    ],
    screens: { primary: `${S}/desktop-documents.png`, layout: "single" },
  },
  {
    id: 10,
    audio: "audio/scene-10.mp3",
    title: "Offline-First Mobile",
    subtitle: "Built for real field conditions",
    tag: "Offline",
    bullets: [
      { text: "Login prefetch: projects, assets, workflows, and config media" },
      { text: "Queued writes sync on reconnect with conflict detection" },
    ],
    screens: { primary: `${S}/mobile-assets.png`, layout: "phone" },
  },
  {
    id: 11,
    audio: "audio/scene-11.mp3",
    title: "Architecture & Security",
    subtitle: "Layered frontend, flat REST API, role-based auth",
    tag: "Architecture",
    bullets: [
      { text: "features → services → repositories → Redux store" },
      { text: "JWT auth, permissions, biometric lock on native apps" },
    ],
    screens: { primary: `${S}/desktop-admin.png`, layout: "single" },
  },
  {
    id: 12,
    audio: "audio/scene-12.mp3",
    title: "Enterprise Ready",
    subtitle: "Secure, scalable, audit-ready",
    tag: "Enterprise",
    bullets: [
      { text: "User management, brand settings, two-factor recovery" },
      { text: "SQLite with migrations; SSE push for live updates" },
    ],
    screens: { primary: `${S}/desktop-work-instructions.png`, layout: "single" },
  },
  {
    id: 13,
    audio: "audio/scene-13.mp3",
    title: "Transform Field Operations",
    subtitle: "From first install to final sign-off",
    tag: "Next Steps",
    bullets: [
      { text: "One connected workflow for office and field teams" },
      { text: "Ready to see Strata Workflow App on your projects?" },
    ],
    screens: { primary: `${S}/desktop-project-detail.png`, layout: "single" },
  },
];

export const SCENE_COUNT = SCENES.length;

export const FALLBACK_DURATIONS_MS: Record<number, number> = {
  1: 17200,
  2: 15300,
  3: 19250,
  4: 17800,
  5: 15950,
  6: 18450,
  7: 15700,
  8: 14250,
  9: 17050,
  10: 19750,
  11: 21550,
  12: 19350,
  13: 13300,
};
