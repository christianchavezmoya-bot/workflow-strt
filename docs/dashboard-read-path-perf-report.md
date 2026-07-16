# Dashboard Read-Path Performance Fix — Change Report

**Branch:** `cursor/dashboard-read-path-perf-3e6f`  
**Date:** 2026-07-16  
**Scope:** Backend read-path optimization + minor frontend request gating (no schema or DTO shape changes)

---

## Problem

Web dashboard endpoints were slow (high TTFB, small response bodies) because several hot paths loaded **every** `AssetWorkflowRun` row with `.ToListAsync()`, materializing multi-MB JSON columns (`StepResultsJson`, `WorkflowSnapshotJson`) that contain base64-encoded photos/videos. Installers hit this hardest on:

- `GET /api/project-assets/dashboard-workspace`
- `GET /api/asset-workflow-runs/open-issues`
- `GET /api/project-assets/open`

Native mobile felt faster because dashboard data is hydrated from a device-local cache on mount; web had no equivalent and always paid full DB materialization cost.

---

## Solution Summary

Introduced shared read helpers in `DashboardReadQueries.cs` that:

1. Resolve **latest run per asset** via a lightweight head query (Id, AssetId, StartedAt, UpdatedAt), then load full run rows **only for those IDs**.
2. Use **column projections** for issue lists, pending signatures, and analytics where full entities are not needed.
3. Apply **SQL-side `userId` filters** (asset ID lists) before loading issue-bearing runs.

Frontend: gate dashboard mount fetches on `user.id` and skip org-wide workload/summary calls for field installers.

---

## Files Changed

| File | Change |
|------|--------|
| `server/Commtrac.Api/Services/DashboardReadQueries.cs` | **New** — shared query helpers and projection record types |
| `server/Commtrac.Api/Controllers/ProjectAssetsController.cs` | `GetOpen`, `GetDashboardWorkspace`, `WorkloadSummary`, `GetTechnicianWorkloadSummary` use latest-run helper |
| `server/Commtrac.Api/Controllers/AssetWorkflowRunsController.cs` | `GetOpenIssues`, `GetResolvedIssues`, `GetPendingSignatures` use projections + scoped asset filters |
| `server/Commtrac.Api/Controllers/DashboardController.cs` | `EvidenceCompleteness`, `WorkflowHealth` use slim projections; removed unused `ComputeMetrics` |
| `src/features/dashboard/Dashboard.tsx` | Mount effect waits for `user.id`; workload/summary only for manager/admin/supervisor |

---

## Backend Detail

### `DashboardReadQueries.cs` (new)

| Helper | Purpose |
|--------|---------|
| `GetLatestRunsByAssetIdAsync` | Latest run per asset; optional run filter (e.g. `!IsLocked`) |
| `GetIssueRunsAsync` | `Id`, `AssetId`, `IssuesJson` only — no media blobs |
| `GetAssetsWithIssuesAsync` | Asset-level issues JSON only |
| `GetAssetIssueContextByIdsAsync` | Asset tag/name/location for issue DTO assembly |
| `GetProjectsByIdAsync` | Job number + customer name projection |
| `GetPendingSignatureRunsAsync` / `GetPendingSignatureAssetsAsync` | Scalar columns for signature queue |
| `GetCompletedRunsForEvidenceAsync` | Keeps `StepResultsJson` for media detection; drops snapshot |
| `GetRunsForHealthAsync` | Scalar columns only for health metrics |

### `ProjectAssetsController`

**Before:** Loaded all workflow runs for relevant assets (or entire table in some paths), then grouped in memory.

**After:** `GetLatestRunsByAssetIdAsync` loads at most one full run row per asset. Endpoints still call `CountWorkflowEvidence` / `BuildWorkflowSummary` on that latest run — response DTOs unchanged.

Affected routes:
- `GET /api/project-assets/open`
- `GET /api/project-assets/dashboard-workspace`
- `GET /api/project-assets/workload-summary`
- `GET /api/project-assets/technician-workload-summary`

### `AssetWorkflowRunsController`

**Open / resolved issues**
- Resolves assigned asset IDs in SQL when `?userId=` is provided.
- Loads issue runs via `GetIssueRunsAsync(restrictToAssetIds)` — never scans full table into memory when filtered.
- Loads asset/project context via narrow projections.

**Pending signatures**
- Loads pending runs via scalar projection (no JSON blobs).
- Fixes `userId` filter: previously could load all pending runs then filter in memory without reliable asset assignment join.

### `DashboardController`

**Evidence completeness**
- Uses `GetCompletedRunsForEvidenceAsync` — still reads `StepResultsJson` for completed runs in the window (needed for media detection), but omits `WorkflowSnapshotJson`.

**Workflow health**
- Uses `GetRunsForHealthAsync` — scalar columns only; metrics computed via `ComputeHealthMetrics` on `HealthRunRow`.

---

## Frontend Detail

### `Dashboard.tsx`

1. **Mount guard:** Initial data load effect returns early when `user.id` is empty, preventing an unscoped `open-issues` fetch before auth context is ready.
2. **Role gate:** `technicianWorkloadSummary()` and `activeSummary()` run only for `isManager || isAdmin || isSupervisor`. Field installers no longer trigger org-wide aggregate endpoints on dashboard load.

No UI or DTO consumption changes.

---

## Expected Impact

| Audience | Expected change |
|----------|-----------------|
| **Web installers** | Large TTFB reduction on dashboard-workspace and open-issues (primary win) |
| **Web PMs / supervisors** | Faster workload and open-asset lists; analytics endpoints lighter |
| **Native mobile** | Minimal visible change (already cache-hydrated on mount) |

**Residual cost:** Endpoints that still need `StepResultsJson` on the latest run per asset (evidence counts on open assets / dashboard workspace) will remain slower when those runs contain large base64 payloads. Further gains require moving media out of JSON and/or DB indexes — out of scope for this patch.

---

## Verification

- `dotnet build` in `server/Commtrac.Api/` — **pass**
- `npm run build` (tsc + vite) — **pass**
- Response DTO shapes and sort orders preserved; no API contract changes.

---

## Not Included (future work)

- `webFreshCache` hydration for web dashboard reads
- Scoped inspection runs list (`GET /asset-workflow-runs?workflowType=Inspection` still loads full table)
- EF migration for composite indexes on `(AssetId, StartedAt)`
- Media storage migration out of `StepResultsJson`
- Sync engine fixes (silent 4xx drop, FIFO ordering, offline pause status)
