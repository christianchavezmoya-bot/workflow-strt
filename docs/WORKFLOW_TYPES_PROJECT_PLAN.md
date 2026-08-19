# Workflow types ↔ project scope — implementation plan

**Goal:** Admin-defined workflow types drive **which types a project supports**, **which configs can be published**, and **which configs can be assigned to assets** — without breaking existing Installation / Inspection / Mixed behavior.

**Status:** Plan only — execute as phased PRs after sign-off.

---

## Current state (what already exists)

| Layer | Today |
|-------|--------|
| **Settings → Workflow Types** | CRUD via `WorkflowTypesController` + Settings UI. Seeded ids: `wftype-installation`, `wftype-commissioning`, `wftype-inspection`, `wftype-repair`. |
| **Workflow config** | `WorkflowConfigs.WorkflowTypeId` + legacy `ConfigType` string. Builder publish dialog already picks a type. |
| **Asset assignment** | `AssetWorkflowAssignments.WorkflowTypeId` + `WorkflowConfigId`. No project-level filter on create (POST accepts any published config). |
| **Project** | `Projects.WorkflowMode` enum: `INSTALLATION_ONLY` \| `INSPECTION_ONLY` \| `MIXED` (+ hidden Mixed on new projects, PR #260). Drives tabs, dashboard buckets, inspection inbox, assets filters. |

**Gap:** Project “Workflow Mode” (3 radios) and Settings “Workflow Types” (open catalog) are **two separate concepts**. This plan connects them via **`allowedWorkflowTypeIds`** on the project.

---

## Target model

```
Settings Workflow Types (catalog)
        │
        ▼
Project.allowedWorkflowTypeIds[]     ← PM multi-select at create/edit
        │
        ├──► workflowMode (derived, kept for legacy UI) 
        │
        ├──► Workflow Builder publish  ← type must be active in catalog
        │
        └──► Asset assignment          ← only configs whose workflowTypeId ∈ allowed set
```

### Rules

1. **PM must pick ≥1 active workflow type** on project save.
2. **Assignment** rejected (API 400) if config’s `workflowTypeId` ∉ project allowed set.
3. **`workflowMode` is derived**, not chosen directly (radios replaced by type checklist):
   - Allowed set includes **Inspection** and any **install-like** type (Installation, Commissioning, Repair, …) → `MIXED`
   - Allowed set is **Inspection only** → `INSPECTION_ONLY`
   - Otherwise → `INSTALLATION_ONLY`
4. **Inspection-like** for module visibility: type name/id contains `"inspection"` (same as today’s `isInspectionWorkflowType`). All other types use **installation-style** runner UI for now.
5. **Mixed** stays in DB for legacy rows; not offered on new projects (already hidden).

---

## Phase 0 — Sign-off (no code)

Confirm with product owner:

- [ ] Multi-select: project can allow **Installation + Inspection + Repair** at once (yes = derived `MIXED` + both modules where applicable).
- [ ] Commissioning / Repair use **installation workspace** until dedicated modules exist.
- [ ] Deleting a workflow type in Settings: **block** if referenced by any project, config, or assignment (not soft-delete only).
- [ ] Existing projects: auto-migrate allowed set from current `workflowMode` (see Phase 1).

---

## Phase 1 — Backend schema + API (PR A)

### Database

- Add column on `Projects`:
  - `AllowedWorkflowTypeIdsJson` (`text`, default `[]`) — JSON array of workflow type ids.
- EF migration + `DbInitializer`/`PostgresSchemaEnsurer` idempotent patch if needed.

### API

**`ProjectDto` / create / update requests**

- Add `allowedWorkflowTypeIds: string[]`.
- On create/update:
  - Validate every id exists and `IsActive`.
  - Require `Count >= 1`.
  - Compute and persist `WorkflowMode` via `DeriveWorkflowMode(allowedIds, types)` (server-side single source of truth).
  - Sync `IsInstallationProject` = `workflowMode != INSPECTION_ONLY`.

**`AssetWorkflowAssignmentsController.Create`**

- Load asset → project → allowed ids.
- Resolve config’s effective type id (`WorkflowTypeId` ?? match by `ConfigType` name).
- If not in allowed set → **400** with clear message.

**Optional (same PR):** bulk assign endpoint / inspection import assignment — same validation.

### Migration script (on boot)

For each project where `AllowedWorkflowTypeIdsJson` is empty:

| `WorkflowMode` | Default allowed ids |
|----------------|---------------------|
| `INSPECTION_ONLY` | `[wftype-inspection]` |
| `MIXED` | `[wftype-installation, wftype-inspection]` |
| `INSTALLATION_ONLY` or null | `[wftype-installation]` |

Legacy null `WorkflowMode` + `IsInstallationProject=false` → inspection-only mapping.

### Files (indicative)

- `server/Commtrac.Api/Models/Entities.cs` — `ProjectEntity`
- `server/Commtrac.Api/Models/Dtos.cs` — `ProjectDto`, create/update records
- `server/Commtrac.Api/Controllers/ProjectsController.cs` — derive + validate
- `server/Commtrac.Api/Controllers/AssetWorkflowAssignmentsController.cs` — gate create
- `server/Commtrac.Api/Services/WorkflowTypeRules.cs` — **new** shared derive/validate helpers
- `server/Commtrac.Api.Tests/` — derive + assignment rejection tests

### Gate

- `dotnet build` + new unit tests pass.
- Fresh Docker seed: create project with `[installation, repair]` → `INSTALLATION_ONLY` mode, assignment of repair config succeeds; inspection config fails.

---

## Phase 2 — Frontend types + project service (PR B)

### Types

- `Project.allowedWorkflowTypeIds?: string[]` in `src/types/project.ts`.

### Services

- `projectService` create/update payloads include `allowedWorkflowTypeIds`.
- Redux `projectSlice` / offline patches preserve field.

### Shared helper (new)

`src/utils/projectWorkflowTypes.ts`:

- `deriveWorkflowModeFromAllowedTypes(ids, typesCatalog)`
- `projectHasInspectionFromAllowed(ids, typesCatalog)`
- `filterConfigsByProjectAllowed(configs, allowedIds, typesCatalog)` — uses existing `resolveConfigWorkflowTypeId`.

### Gate

- Typecheck only; no UI change yet. API round-trip in manual test.

---

## Phase 3 — Project form UI (PR C)

Replace **Workflow Mode** radios in `ProjectForm.tsx` with:

- **“Workflow types for this project”** — checkbox group loaded from `workflowTypeService.list()` (active only).
- Default new project: `[wftype-installation]` or last-used PM preference (optional).
- Edit existing: show checkboxes from `allowedWorkflowTypeIds`; legacy MIXED shows both Installation + Inspection checked.
- Helper text: “Controls which workflow configs can be assigned to assets on this job.”
- Remove/hide workflow mode radios entirely (mode shown read-only chip optional: “Derived: Installation + Inspection”).

Validation (zod): min 1 type selected.

### Gate

- Create project with Installation + Repair → save → reload shows same ids.
- Project detail tabs still correct (installation tab for install-like types; inbox if Inspection allowed).

---

## Phase 4 — Asset assignment filtering (PR D)

Apply `filterConfigsByProjectAllowed` everywhere configs are picked:

| Surface | File(s) |
|---------|---------|
| Assets page assign dialog | `AssetInstallationWorkflowAssignDialog.tsx`, `assetInstallationWorkflowAssign.ts` |
| Bulk assign | `AssetInstallationBulkWorkflowAssignDialog.tsx` |
| Dashboard quick assign | `DashboardAssignWorkflowDialog.tsx` |
| CSV import config mapping | `assetInstallationCsvImport.ts` (warn/skip disallowed) |

UX:

- Workflow type dropdown (if still shown) limited to **allowed types only**.
- Config dropdown lists **published configs matching selected type AND allowed set**.
- Empty state: “No published workflows for this type on this project — check project workflow types or publish a config.”

### Gate

- Project allows Installation only → Inspection config not listed; API POST returns 400 if forced.
- Staging: assign Chambers_default on AIM-100 project with Installation allowed.

---

## Phase 5 — Builder publish enforcement (PR E)

**Already partially there** — tighten:

- `WorkflowBuilder.tsx` / `WorkInstructions.tsx` publish dialog: **require** `workflowTypeId` (disable Publish until selected).
- Filter type dropdown to **active catalog only** (already from API).
- Optional: show warning if `configType` label ≠ selected type name (reuse `workflowTypeMismatchMessage`).

No project filter on publish (configs are global per product); project filter applies only at **assignment**.

### Gate

- Cannot publish without type.
- Published config with Repair type assignable only on projects that include Repair.

---

## Phase 6 — Settings guardrails (PR F)

**Workflow Types tab** (`Settings.tsx` + `WorkflowTypesController`):

- On delete/deactivate: server checks references (projects allowed list, configs, assignments).
- Return 409 with counts: “Used by 3 projects, 2 configs.”
- UI: show usage hint on each type row (optional follow-up).

### Gate

- Cannot delete `wftype-installation` while a project references it.

---

## Phase 7 — Regression + staging (PR G / manual)

### Automated

- Extend `assetInstallationWorkflowAssign.test.ts` with project-allowed filter cases.
- Add `projectWorkflowTypes.test.ts` for derive logic.
- Backend tests for assignment 400.

### Manual checklist (Docker staging)

1. Admin: add **Commissioning** type in Settings.
2. PM: new project → check Installation + Commissioning only.
3. Builder: publish config with Commissioning type.
4. Assets: assign config — success; Inspection config not in list.
5. Dashboard / project detail tabs match allowed types.
6. Existing MIXED legacy project still opens both modules after migration.

---

## PR sequence (recommended)

| PR | Phase | Title |
|----|-------|--------|
| A | 1 | `feat(api): project allowedWorkflowTypeIds + assignment validation` |
| B | 2 | `feat(web): project allowed workflow type types + helpers` |
| C | 3 | `feat(web): project form multi-select workflow types` |
| D | 4 | `feat(web): filter asset assignment by project allowed types` |
| E | 5 | `fix(web): require workflow type on publish` |
| F | 6 | `feat(api): block workflow type delete when referenced` |
| G | 7 | tests + docs update |

**Deploy order:** A before B–F; B before C–D; ship C+D together for user-visible value.

---

## What we are NOT doing in this epic

- Replacing dashboard “My Installs / My Inspections” with dynamic per-type tabs.
- New UI modules for Repair / Commissioning (they reuse installation flows).
- Removing `workflowMode` column (kept derived indefinitely).
- Changing workflow **steps JSON** or offline sync protocol.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Offline native assigns disallowed config | Server 400 on sync; optional client pre-filter using cached project allowed ids from bootstrap. |
| Legacy API clients omit `allowedWorkflowTypeIds` | Server derives from `workflowMode` on update when array empty. |
| PM removes type after assets assigned | Allow save but show warning; existing assignments stay; new assigns blocked. Optional cleanup job later. |
| Name-based “inspection” detection fragile | Phase 2+ add optional `WorkflowType.Behavior` enum (`installation` \| `inspection`) — follow-up migration. |

---

## Effort shape (technical, not calendar)

- **Phase 1 (API + migration):** invasive but isolated; highest priority.
- **Phase 3–4 (UI):** most user-visible; moderate touch count (~8–12 files).
- **Phase 5–6:** small.
- **Total:** ~6 PRs, safe to land incrementally with feature working after PR C+D.

---

## Next step

After sign-off on **Phase 0** checklist, start **PR A** (`WorkflowTypeRules` service + migration + assignment gate).
