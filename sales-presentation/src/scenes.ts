export interface SceneHotspot {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
}

export interface SceneScreens {
  /** Primary screenshot (desktop or single view) */
  primary?: string;
  /** Secondary screenshot (mobile companion for split layouts) */
  secondary?: string;
  /** Layout for screenshot presentation */
  layout?: "single" | "split-platforms" | "phone";
}

export interface Scene {
  id: number;
  audio: string;
  title: string;
  subtitle: string;
  tag: string;
  visual: SceneVisual;
  screens?: SceneScreens;
  hotspots?: SceneHotspot[];
}

export type SceneVisual =
  | "hero"
  | "challenge"
  | "platforms"
  | "projects"
  | "assets"
  | "workflow"
  | "dashboard"
  | "signatures"
  | "documents"
  | "offline"
  | "enterprise"
  | "cta";

const S = "screenshots";

export const SCENES: Scene[] = [
  {
    id: 1,
    audio: "audio/scene-01.mp3",
    title: "Strata Workflow App",
    subtitle: "Field Operations, Unified",
    tag: "Welcome",
    visual: "hero",
    screens: { primary: `${S}/desktop-dashboard.png`, layout: "single" },
  },
  {
    id: 2,
    audio: "audio/scene-02.mp3",
    title: "The Challenge",
    subtitle: "Fragmented field work costs time and trust",
    tag: "Problem",
    visual: "challenge",
    screens: { primary: `${S}/desktop-issues.png`, layout: "single" },
    hotspots: [
      { id: "paper", label: "Lost checklists", detail: "Paper processes create gaps and rework.", x: 18, y: 38 },
      { id: "photos", label: "Scattered photos", detail: "Evidence trapped on personal devices.", x: 50, y: 28 },
      { id: "issues", label: "Missed issues", detail: "Problems discovered too late in the cycle.", x: 78, y: 42 },
    ],
  },
  {
    id: 3,
    audio: "audio/scene-03.mp3",
    title: "One Platform, Every Device",
    subtitle: "Web, Android, and iOS — one experience",
    tag: "Platform",
    visual: "platforms",
    screens: {
      primary: `${S}/desktop-dashboard.png`,
      secondary: `${S}/mobile-dashboard.png`,
      layout: "split-platforms",
    },
    hotspots: [
      { id: "web", label: "Desktop web", detail: "Planners and managers work from the office.", x: 22, y: 55 },
      { id: "mobile", label: "Mobile apps", detail: "Technicians use the same app in the field.", x: 72, y: 55 },
    ],
  },
  {
    id: 4,
    audio: "audio/scene-04.mp3",
    title: "Projects",
    subtitle: "Your operational command center",
    tag: "Projects",
    visual: "projects",
    screens: { primary: `${S}/desktop-projects.png`, layout: "single" },
  },
  {
    id: 5,
    audio: "audio/scene-05.mp3",
    title: "Assets",
    subtitle: "Where field work happens",
    tag: "Assets",
    visual: "assets",
    screens: { primary: `${S}/desktop-assets.png`, layout: "single" },
    hotspots: [
      { id: "status", label: "Live status", detail: "Track progress from Not Started to Complete.", x: 30, y: 62 },
      { id: "run", label: "Start Run", detail: "Launch the right workflow for each asset.", x: 68, y: 48 },
    ],
  },
  {
    id: 6,
    audio: "audio/scene-06.mp3",
    title: "Guided Workflows",
    subtitle: "Step-by-step excellence in the field",
    tag: "Workflows",
    visual: "workflow",
    screens: { primary: `${S}/desktop-assets.png`, layout: "single" },
    hotspots: [
      { id: "photo", label: "Photos", detail: "Capture evidence at every step.", x: 20, y: 50 },
      { id: "time", label: "Time tracking", detail: "Productive and downtime logged automatically.", x: 50, y: 65 },
      { id: "sign", label: "Signatures", detail: "Sign off runs with confidence.", x: 78, y: 50 },
    ],
  },
  {
    id: 7,
    audio: "audio/scene-07.mp3",
    title: "Issues & Dashboard",
    subtitle: "Real-time operational visibility",
    tag: "Visibility",
    visual: "dashboard",
    screens: { primary: `${S}/desktop-dashboard.png`, layout: "single" },
  },
  {
    id: 8,
    audio: "audio/scene-08.mp3",
    title: "Signatures & Reports",
    subtitle: "Trusted evidence, delivered",
    tag: "Compliance",
    visual: "signatures",
    screens: { primary: `${S}/desktop-work-instructions.png`, layout: "single" },
  },
  {
    id: 9,
    audio: "audio/scene-09.mp3",
    title: "Documents & Knowledge",
    subtitle: "The right information, everywhere",
    tag: "Knowledge",
    visual: "documents",
    screens: { primary: `${S}/desktop-documents.png`, layout: "single" },
  },
  {
    id: 10,
    audio: "audio/scene-10.mp3",
    title: "Built for the Field",
    subtitle: "Offline-first on mobile",
    tag: "Offline",
    visual: "offline",
    screens: { primary: `${S}/mobile-assets.png`, layout: "phone" },
    hotspots: [
      { id: "sync", label: "Sync online", detail: "Data prefetches while connected.", x: 28, y: 40 },
      { id: "queue", label: "Queue offline", detail: "Work continues; changes sync on reconnect.", x: 72, y: 40 },
    ],
  },
  {
    id: 11,
    audio: "audio/scene-11.mp3",
    title: "Enterprise Ready",
    subtitle: "Secure, scalable, accountable",
    tag: "Enterprise",
    visual: "enterprise",
    screens: { primary: `${S}/desktop-admin.png`, layout: "single" },
  },
  {
    id: 12,
    audio: "audio/scene-12.mp3",
    title: "Transform Your Field Operations",
    subtitle: "From first install to final sign-off",
    tag: "Next Steps",
    visual: "cta",
    screens: { primary: `${S}/desktop-projects.png`, layout: "single" },
  },
];

export const SCENE_COUNT = SCENES.length;

/** Measured narration durations + 500ms buffer (ms) */
export const FALLBACK_DURATIONS_MS: Record<number, number> = {
  1: 14500,
  2: 19300,
  3: 17000,
  4: 15700,
  5: 16750,
  6: 16000,
  7: 13900,
  8: 13900,
  9: 13250,
  10: 17650,
  11: 14250,
  12: 15450,
};
