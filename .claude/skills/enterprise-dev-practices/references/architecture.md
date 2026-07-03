# Architecture Standards

Ground truth for how this app is layered and the boundaries you must not break.
Read before adding a feature, moving code between layers, or reviewing structure.

## Frontend layering (top → bottom)

```
features/        page modules, one dir per domain (17 dirs) — React + MUI, routing targets
  └─ hooks/      cross-cutting behavior (useSyncEngine, usePermissions, …) (15)
       └─ services/     one file per domain (59) — wrap the axios client + local data
            └─ repositories/  event-emitting caches: Asset / Issue / Project (3)
                 └─ store/     Redux Toolkit slices: projects, installations, users, customers, products (5 slices)
```

Cross-cutting UI state is **React Context**, not Redux — wired in `src/main.tsx`
(ViewMode, AccessMode, ComplexView, NotificationInbox, FieldNotification). Don't
add a Redux slice for ephemeral UI state; don't add a Context for server data.

Routes are lazy-loaded in `src/app/routes.tsx`; authed routes render inside
`AppShell` (desktop sidebar / mobile bottom-tab).

### The one rule that keeps this clean

**A component never talks to the network directly.** The path is:

```
component → hook or service → src/services/api.ts (the single axios instance) → server
```

`api.ts` owns JWT injection, silent refresh, the GET cache, and 401 handling.
Bypassing it means a request with no auth, no refresh, no cache, no offline path.

> **Existing leaks to fix, not copy** (verified via `grep -rn "from 'axios'" src`):
> `src/features/auth/ResetPassword.tsx` imports axios in a component, and a few
> services (`projectService`, `projectAssetService`, `assetWorkflowAssignmentService`)
> reach for `axios` directly. New code goes through `api.ts`. When you touch one
> of those files, route it through the shared client.

## The two hard boundaries (break these and things silently fail)

### 1. Web vs. native are different code paths

`api.ts` caching, IndexedDB fallback, and all offline behavior are gated on
`isMobileNativePlatform()`. **On web, requests pass straight through — no cache.**
Any change to request/response handling must be reasoned about for *both* paths.
Test a change on web *and* consider native, or you'll ship a bug that only
appears on a phone in the field with no signal.

### 2. Offline writes go through the sync engine

Writes that must survive offline go through `useSyncEngine` → `queueOrSend`:
- **online** → send immediately.
- **offline** → store a `PendingAction` in IndexedDB with an optimistic patch;
  flush on reconnect / foreground / visibility change, with backoff + 409/412
  conflict detection.

Locally-created entities get **temp IDs remapped to server IDs after first sync**
(`replaceEntityReferences` / `replaceRunIdReferences`). **When you add a new
offline-capable entity type, you must extend this remap** or references will
dangle after sync. `offlineStore.ts` holds workflow-run snapshots; `mediaStore.ts`
holds pending media blobs.

## Backend shape

- **Flat controllers**, one per resource (56 in `Controllers/`), thin over EF Core.
- **Routes are flat, `projectId` is a query param** — `GET /api/project-contacts?projectId=xxx`,
  not nested `/api/projects/{id}/contacts`. Follow this for new endpoints.
- Entities and DTOs are two monoliths: `Models/Entities.cs` (~1400 lines),
  `Models/Dtos.cs` (~1500 lines). **When you add a domain, split it into its own
  partial/file rather than growing the monolith.** Enterprise-grade means these
  get smaller over time, not larger.
- SSE push via `SseController`/`SseHub`; background hosted services for SQLite
  backup and document-search indexing.

### Database changes

Prefer a **proper EF migration** (`dotnet ef migrations add <Name>`; applied on
startup). Be aware `Data/DbInitializer.cs` runs `Migrate()` then hand-written
`Ensure*`/`Fix*` patches every boot — these exist to repair legacy/partial
migrations. **Do not add new schema as `Ensure*` hacks**; that path is legacy.
SQLite runs in WAL mode with a busy timeout, set here.

## Feature-flagged modules

`src/modules/bom-project/` is self-contained and flag-gated. **Import it only
through `src/modules/bom-project/index.ts`** — never reach into `pages/`,
`services/`, `store/` internals. Gated by `VITE_ENABLE_BOM_MODULE=true` (frontend)
and `ENABLE_BOM_PROJECT_MODULE=true` (backend). This is the template for any new
optional module: one public `index.ts`, everything else private.

## Where new code goes (decision guide)

| You're adding… | Put it in | Not in |
|---|---|---|
| A new page/screen | `src/features/<domain>/` | a giant shared component file |
| Server calls for a domain | `src/services/<domain>Service.ts` via `api.ts` | a component, raw axios |
| Cached, event-emitting entity state | a repository | a component's `useState` |
| Server-entity global state | a `store/` slice | a Context |
| Ephemeral cross-page UI state | a Context in `main.tsx` | a Redux slice |
| A new REST resource | a flat controller + `projectId` query param | a nested route |
| A schema change | an EF migration | a new `Ensure*` in `DbInitializer` |
| An optional/experimental area | a flag-gated module with one `index.ts` | scattered `if (flag)` checks |
