import type { ProjectFilters } from "../../services/projectService";
import type { ProjectStatus } from "../../types/project";

export type ProjectListUiFilters = {
  activeOffice: string;
  statusFilter: ProjectStatus | "All";
  projectNumberFilter: string;
  showArchived: boolean;
};

/** Shared list fetch filters — client-side pagination; map job-number filter to API `search`. */
export function buildProjectListFilters(ui: ProjectListUiFilters): ProjectFilters {
  const trimmed = ui.projectNumberFilter.trim();
  return {
    country: ui.activeOffice !== "All" ? ui.activeOffice : undefined,
    scope: "browse",
    ownershipScope: "all",
    status: ui.statusFilter,
    search: trimmed || undefined,
    includeDeleted: ui.showArchived,
  };
}
