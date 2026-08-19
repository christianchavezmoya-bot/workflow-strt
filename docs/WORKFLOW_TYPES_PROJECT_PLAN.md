# Workflow Types ↔ Project Scope — Implementation Plan

Phase 0 sign-off (Aug 2026):

| Decision | Answer |
|----------|--------|
| Multiple workflow types per project? | **No** — one catalog type per project (Mixed hidden on create; legacy MIXED until PM picks one type) |
| Repair / Commissioning UI? | **Installation-style** for now (report layout may differ later) |
| Delete guard? | **Block** soft-delete when any project, published config, or active assignment references the type |
| Keep `WorkflowMode` column? | **Yes** — derive from the chosen type for tabs/dashboard legacy consumers |

## Data model

- **`Projects.WorkflowTypeId`** (nullable string, FK-ish to Settings catalog)
  - Single type per project
  - Null only on legacy **MIXED** rows until edited
- **`Projects.WorkflowMode`** (derived, kept)
  - Inspection type → `INSPECTION_ONLY`
  - All other types (Installation, Repair, Commissioning, …) → `INSTALLATION_ONLY`
  - Legacy `MIXED` unchanged until PM selects one type
- **`Projects.IsInstallationProject`** — `true` when mode is `INSTALLATION_ONLY` or legacy `MIXED`

Shared server rules live in `server/Commtrac.Api/Services/WorkflowTypeRules.cs`.

## PR breakdown

### PR A — Backend (this PR)

- [x] `ProjectEntity.WorkflowTypeId` + EF migration + SQLite/Postgres backfill from legacy mode
- [x] `ProjectDto.workflowTypeId`; create/update validates active catalog type and derives mode
- [x] `AssetWorkflowAssignmentsController` — 409 when config type ≠ project type (skip guard for legacy MIXED without type)
- [x] `WorkflowTypesController.Delete` — 409 when referenced
- [x] Unit + integration tests

### PR B — Frontend types + helpers

- Add `workflowTypeId` to TS `Project` type and API mappers
- Mirror `WorkflowTypeRules` helpers in `src/` (derive mode, install-style check)

### PR C — Project form

- Replace Installation / Inspection / Mixed radios with **single-select** from Settings → Workflow Types (active catalog)
- On edit of legacy MIXED: force PM to pick one type (no Mixed option)
- Send `workflowTypeId` on save; stop sending raw `workflowMode` once wired

### PR D — Asset assignment filtering

- Filter assign-workflow dialogs to configs whose effective type matches `project.workflowTypeId`
- Legacy MIXED: keep current “show all” until type is set

### PR E — Builder publish

- Require workflow type on publish (already partially supported on configs)

### PR F — Settings delete UX

- Surface 409 from delete API with “in use by project/config/assignment” messaging

## Migration / backfill

```sql
UPDATE Projects SET WorkflowTypeId = CASE COALESCE(WorkflowMode, …)
  WHEN 'INSPECTION_ONLY' THEN 'wftype-inspection'
  WHEN 'MIXED' THEN NULL
  ELSE 'wftype-installation'
END WHERE WorkflowTypeId IS NULL;
```

## Testing

- `WorkflowTypeRulesTests` — derivation, config resolve, assignment guard matrix
- `ProjectWorkflowTypeTests` — create with type id; assignment 409 vs legacy MIXED allow
- Existing migration chain tests must stay green
