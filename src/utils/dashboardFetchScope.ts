/**
 * Role gates for the dashboard's optional boot fetches.
 *
 * Kept as pure functions so the "who pays for this query" decision is unit
 * testable without mounting the 6k-line Dashboard component.
 */

/**
 * True when the signed-in role can actually see the Technician Workload panel.
 *
 * `/project-assets/technician-workload-summary` is the heaviest dashboard query:
 * it loads every active asset, every workflow run for those assets (including the
 * StepResultsJson / WorkflowSnapshotJson blobs) and JSON-parses each run. Roles
 * that never render the panel must not trigger it.
 *
 * Mirrors the render conditions of `WorkloadPanel` in Dashboard.tsx: manager
 * (Admin / Project Manager, web and native manager home) and Supervisor.
 */
export function shouldFetchTechnicianWorkload(role: string | undefined | null): boolean {
  switch ((role ?? "").trim()) {
    case "Admin":
    case "Project Manager":
    case "Supervisor":
      return true;
    default:
      return false;
  }
}
