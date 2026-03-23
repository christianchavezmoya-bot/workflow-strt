import type { TourDefinition } from "../types/onboarding.types";
import { APP_VERSION } from "./featureFlags";

// ─── Global Quick Tour (4 steps, all roles) ───────────────────────────────────

export const quickTour: TourDefinition = {
  id: "quick_tour",
  name: "Quick App Tour",
  type: "quick_tour",
  roleTargets: [],
  pageTargets: [],
  versionIntroduced: "1.0.0",
  active: true,
  steps: [
    {
      id: "qt_nav",
      targetSelector: "nav-sidebar",
      title: "Your work areas",
      body: "Navigate between projects, assets, workflows, inspections, and reports here.",
      placement: "right",
      actionType: "highlight",
      order: 1,
      analyticsKey: "qt_nav",
    },
    {
      id: "qt_dashboard",
      targetSelector: "nav-dashboard",
      title: "Your starting point",
      body: "Recent work, pending items, and quick actions are all here.",
      placement: "right",
      actionType: "highlight",
      order: 2,
      analyticsKey: "qt_dashboard",
    },
    {
      id: "qt_projects",
      targetSelector: "nav-projects",
      title: "Projects & work",
      body: "Each project groups assets, workflows, contacts, and delivery progress.",
      placement: "right",
      actionType: "highlight",
      order: 3,
      analyticsKey: "qt_projects",
    },
    {
      id: "qt_help",
      targetSelector: "help-launcher",
      title: "Help is always here",
      body: "Replay this tour, browse guides, or find specific help at any time.",
      placement: "right",
      actionType: "highlight",
      order: 4,
      analyticsKey: "qt_help",
    },
  ],
};

// ─── Admin Tour ───────────────────────────────────────────────────────────────

export const adminTour: TourDefinition = {
  id: "role_tour_admin",
  name: "Admin First Steps",
  type: "role_tour",
  roleTargets: ["Admin"],
  pageTargets: [],
  versionIntroduced: "1.0.0",
  active: true,
  steps: [
    {
      id: "at_settings",
      targetSelector: "nav-settings",
      title: "Configure the system",
      body: "Set up integrations, workflow types, and user roles here before anything else.",
      placement: "right",
      actionType: "highlight",
      order: 1,
    },
    {
      id: "at_work_instructions",
      targetSelector: "nav-work-instructions",
      title: "Build workflow templates",
      body: "Create reusable step-by-step instructions that field users will follow.",
      placement: "right",
      actionType: "highlight",
      order: 2,
    },
    {
      id: "at_admin",
      targetSelector: "nav-admin",
      title: "Manage users & data",
      body: "Add users, set roles, manage customers, products, and reference data.",
      placement: "right",
      actionType: "highlight",
      order: 3,
    },
  ],
};

// ─── Project Manager Tour ─────────────────────────────────────────────────────

export const projectManagerTour: TourDefinition = {
  id: "role_tour_pm",
  name: "Project Manager First Steps",
  type: "role_tour",
  roleTargets: ["Project Manager"],
  pageTargets: [],
  versionIntroduced: "1.0.0",
  active: true,
  steps: [
    {
      id: "pm_projects",
      targetSelector: "nav-projects",
      title: "Start with a project",
      body: "Projects group the site, assets, people, and delivery progress for each job.",
      placement: "right",
      actionType: "highlight",
      order: 1,
    },
    {
      id: "pm_installations",
      targetSelector: "nav-installations",
      title: "Assign field work",
      body: "Assign workflows to assets and track installation progress here.",
      placement: "right",
      actionType: "highlight",
      order: 2,
    },
    {
      id: "pm_issues",
      targetSelector: "nav-issues",
      title: "Track issues",
      body: "Monitor open issues, corrective actions, and blocking items across all assets.",
      placement: "right",
      actionType: "highlight",
      order: 3,
    },
  ],
};

// ─── Installer / Field Tech Tour ──────────────────────────────────────────────

export const installerTour: TourDefinition = {
  id: "role_tour_installer",
  name: "Field User First Steps",
  type: "role_tour",
  roleTargets: ["Engineer", "Installer", "Technician"],
  pageTargets: [],
  versionIntroduced: "1.0.0",
  active: true,
  steps: [
    {
      id: "fi_installations",
      targetSelector: "nav-installations",
      title: "Your assigned work",
      body: "Open assigned assets here to start or continue field work.",
      placement: "right",
      actionType: "highlight",
      order: 1,
    },
    {
      id: "fi_work_instructions",
      targetSelector: "nav-work-instructions",
      title: "Run your workflow",
      body: "Complete each step, add notes and photos, then submit when done.",
      placement: "right",
      actionType: "highlight",
      order: 2,
    },
    {
      id: "fi_issues",
      targetSelector: "nav-issues",
      title: "Report issues",
      body: "Flag problems, attach evidence, and close issues once resolved.",
      placement: "right",
      actionType: "highlight",
      order: 3,
    },
  ],
};

// ─── Viewer / Reports Tour ────────────────────────────────────────────────────

export const viewerTour: TourDefinition = {
  id: "role_tour_viewer",
  name: "Viewer First Steps",
  type: "role_tour",
  roleTargets: ["Viewer"],
  pageTargets: [],
  versionIntroduced: "1.0.0",
  active: true,
  steps: [
    {
      id: "vw_dashboard",
      targetSelector: "nav-dashboard",
      title: "See the overview",
      body: "This page shows overall progress, workload, and recent activity.",
      placement: "right",
      actionType: "highlight",
      order: 1,
    },
    {
      id: "vw_projects",
      targetSelector: "nav-projects",
      title: "Review projects",
      body: "Browse project status, assets, and delivery progress.",
      placement: "right",
      actionType: "highlight",
      order: 2,
    },
    {
      id: "vw_documents",
      targetSelector: "nav-documents",
      title: "Access documents",
      body: "Download completed work, reports, and technical documents here.",
      placement: "right",
      actionType: "highlight",
      order: 3,
    },
  ],
};

// ─── Role → Tour mapping ──────────────────────────────────────────────────────

export const ALL_TOURS: TourDefinition[] = [
  quickTour,
  adminTour,
  projectManagerTour,
  installerTour,
  viewerTour,
];

export function getRoleTour(role: string): TourDefinition | null {
  return ALL_TOURS.find(
    (t) => t.type === "role_tour" && t.active && t.roleTargets.some(
      (r) => r.toLowerCase() === role.toLowerCase()
    )
  ) ?? null;
}

export const CURRENT_APP_VERSION = APP_VERSION;
