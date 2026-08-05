import type { Project } from "../types/project";

/** Resolve URL/dropdown value (UUID or job number) to canonical project.id. */
export function resolveProjectScopeId(projects: Project[], raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const byId = projects.find((p) => p.id === trimmed);
  if (byId) return byId.id;
  const byJob = projects.find((p) => p.jobNumber === trimmed);
  if (byJob) return byJob.id;
  return trimmed;
}
