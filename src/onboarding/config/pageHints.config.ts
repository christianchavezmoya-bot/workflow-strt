import type { HintDefinition } from "../types/onboarding.types";

// Page key = pathname pattern (exact or prefix)
// Keep body under 20 words. No obvious statements.

export const PAGE_HINTS: HintDefinition[] = [
  {
    id: "hint_dashboard",
    pageKey: "/",
    roleTargets: [],
    title: "Your overview",
    body: "Recent work, pending items, and technician workload are tracked here.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_projects",
    pageKey: "/projects",
    roleTargets: [],
    title: "Projects",
    body: "Each project links a site, customer, assets, and delivery progress.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_installations",
    pageKey: "/installations/assets",
    roleTargets: [],
    title: "Installation assets",
    body: "Assign workflows to assets, track status, and monitor open issues.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_work_instructions",
    pageKey: "/work-instructions",
    roleTargets: ["Admin", "Project Manager"],
    title: "Workflow templates",
    body: "Build reusable step-by-step instructions. Publish when ready to assign.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_work_instructions_field",
    pageKey: "/work-instructions",
    roleTargets: ["Engineer", "Installer", "Technician"],
    title: "Your active workflows",
    body: "Open an assigned workflow, complete each step, then submit.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_documents",
    pageKey: "/documents",
    roleTargets: [],
    title: "Document library",
    body: "Upload, organise, and search all project documents and technical files.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_issues",
    pageKey: "/issues",
    roleTargets: [],
    title: "Issues board",
    body: "Track open defects, corrective actions, and resolution evidence.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_settings",
    pageKey: "/settings",
    roleTargets: ["Admin"],
    title: "System settings",
    body: "Configure integrations, workflow types, divisions, and app preferences.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_tips",
    pageKey: "/tips",
    roleTargets: [],
    title: "Tips & Tricks",
    body: "Browse uploaded guides, procedures, and quick-reference documents.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
  {
    id: "hint_admin",
    pageKey: "/admin",
    roleTargets: ["Admin"],
    title: "Admin panel",
    body: "Manage users, customers, offices, roles, and reference data. Product catalog lives in Settings.",
    placement: "bottom",
    dismissible: true,
    showOnce: true,
    priority: 10,
    active: true,
  },
];

/** Return the hint for a given page path and user role (first match by priority) */
export function getPageHint(pathname: string, role: string): HintDefinition | null {
  const matches = PAGE_HINTS.filter((h) => {
    if (!h.active) return false;
    const pathMatch = pathname === h.pageKey || pathname.startsWith(h.pageKey + "/") || h.pageKey === pathname;
    if (!pathMatch) return false;
    if (h.roleTargets.length === 0) return true;
    return h.roleTargets.some((r) => r.toLowerCase() === role.toLowerCase());
  });
  return matches.sort((a, b) => b.priority - a.priority)[0] ?? null;
}
