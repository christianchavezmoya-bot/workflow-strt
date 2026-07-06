export interface SceneView {
  /** e.g. screenshots/scenes/01-v1.png */
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
  /** Exactly four views — matched to narration topics */
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
    variant: variants?.[i] ?? (i === 3 && sceneId === 10 ? "phone" : "desktop"),
  }));
}

export const SCENES: Scene[] = [
  {
    id: 1,
    audio: "audio/scene-01.mp3",
    title: "Strata Workflow App",
    subtitle: "Field operations for telecom and utility project management",
    tag: "Welcome",
    views: views(1, ["Operations dashboard", "Projects portfolio", "Project assets table", "Mobile field home"], ["desktop", "desktop", "desktop", "phone"]),
  },
  {
    id: 2,
    audio: "audio/scene-02.mp3",
    title: "Built for Field Teams",
    subtitle: "Technicians and project managers, aligned end to end",
    tag: "Overview",
    views: views(2, ["Asset health overview", "Start Run on asset", "Project snapshot", "Mobile assets"], ["desktop", "desktop", "desktop", "phone"]),
  },
  {
    id: 3,
    audio: "audio/scene-03.mp3",
    title: "One App, Three Deployments",
    subtitle: "React web · Capacitor mobile · ASP.NET Core API",
    tag: "Platform",
    views: views(3, ["Navigation & modules", "Work instructions", "Admin & users", "Mobile tab bar"], ["desktop", "desktop", "desktop", "phone"]),
  },
  {
    id: 4,
    audio: "audio/scene-04.mp3",
    title: "Projects",
    subtitle: "Your top-level operational container",
    tag: "Projects",
    views: views(4, ["Projects list", "Expanded project row", "Project detail", "Workflow actions"]),
  },
  {
    id: 5,
    audio: "audio/scene-05.mp3",
    title: "Assets & Installations",
    subtitle: "The main field-work surface",
    tag: "Assets",
    views: views(5, ["Project filter", "Asset registry columns", "Asset row detail", "Inline asset expand"]),
  },
  {
    id: 6,
    audio: "audio/scene-06.mp3",
    title: "Guided Workflows",
    subtitle: "WorkOrderRunner — the heart of on-site work",
    tag: "Workflows",
    views: views(6, ["Work instructions library", "Run workflow setup", "Step-by-step runner", "Workflow builder"]),
  },
  {
    id: 7,
    audio: "audio/scene-07.mp3",
    title: "Operations Dashboard",
    subtitle: "Office-scoped visibility and quick actions",
    tag: "Dashboard",
    views: views(7, ["Needs attention", "Evidence completeness", "Technician workload", "Dashboard tabs"]),
  },
  {
    id: 8,
    audio: "audio/scene-08.mp3",
    title: "Issues Board",
    subtitle: "Cross-project issue tracking",
    tag: "Issues",
    views: views(8, ["Issues board", "Blocking KPIs", "Issue filters & list", "Dashboard alerts"]),
  },
  {
    id: 9,
    audio: "audio/scene-09.mp3",
    title: "Documents & More",
    subtitle: "Knowledge, admin, and mobile upload",
    tag: "Supporting",
    views: views(9, ["Document library", "Work instructions", "Admin console", "Tips & tricks"]),
  },
  {
    id: 10,
    audio: "audio/scene-10.mp3",
    title: "Offline-First Mobile",
    subtitle: "Built for real field conditions",
    tag: "Offline",
    views: views(10, ["Mobile sync bar", "Offline assets", "Mobile projects", "Desktop sync status"], ["phone", "phone", "phone", "desktop"]),
  },
  {
    id: 11,
    audio: "audio/scene-11.mp3",
    title: "Architecture & Security",
    subtitle: "Layered frontend, flat REST API, role-based auth",
    tag: "Architecture",
    views: views(11, ["User management", "Role permissions", "Settings & brand", "Secure login"]),
  },
  {
    id: 12,
    audio: "audio/scene-12.mp3",
    title: "Enterprise Ready",
    subtitle: "Secure, scalable, audit-ready",
    tag: "Enterprise",
    views: views(12, ["Roles configuration", "Permission matrix", "Workflow templates", "Document control"]),
  },
  {
    id: 13,
    audio: "audio/scene-13.mp3",
    title: "Transform Field Operations",
    subtitle: "From first install to final sign-off",
    tag: "Next Steps",
    views: views(13, ["Active project", "Asset progress", "Regional snapshot", "Mobile projects"], ["desktop", "desktop", "desktop", "phone"]),
  },
];

export const SCENE_COUNT = SCENES.length;
export const VIEWS_PER_SCENE = 4;

export const FALLBACK_DURATIONS_MS: Record<number, number> = {
  1: 17200, 2: 15300, 3: 19250, 4: 17800, 5: 15950, 6: 18450, 7: 15700,
  8: 14250, 9: 17050, 10: 19750, 11: 21550, 12: 19350, 13: 13300,
};
