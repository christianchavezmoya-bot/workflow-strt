# Architecture

> **Human-authored overview.** This is the narrative companion to
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), which is **auto-generated** by
> [`scripts/update-architecture-docs.mjs`](scripts/update-architecture-docs.mjs)
> (route/nav/controller inventory, re-staged by the pre-commit hook). Edit *this*
> file by hand; never hand-edit the generated one. For the service/runtime
> decomposition see [`MICROSERVICES.md`](MICROSERVICES.md).

## What this is

A field-operations app for telecom/utility project management: projects,
installable assets, work instructions/workflows, inspections, issues, documents,
and e-signatures. **One React bundle ships three ways** — desktop web, and
Android/iOS via Capacitor wrappers — all talking to a single ASP.NET Core + SQLite
API.

| Target | Implementation | Location |
|---|---|---|
| Web browser | React 18 + TypeScript + MUI v5, built with Vite | `src/` → `dist/` |
| Android | Capacitor 8 wrapper around the same `dist/` build | `android/` |
| iOS | Capacitor 8 wrapper around the same `dist/` build | `ios/` |
| Backend API | ASP.NET Core 8 + EF Core (SQLite), JWT auth | `server/Commtrac.Api/` |

## Tech stack

- **Frontend**: React 18, TypeScript, MUI v5, Vite, Redux Toolkit, React Router v6.
- **Backend**: ASP.NET Core 8, EF Core over SQLite (WAL mode), JWT bearer auth.
- **Mobile**: Capacitor 8 (Android + iOS) wrapping the web build; native biometric/PIN
  lock, secure storage (Keychain/Keystore).
- **No lint step, no test suite.** No ESLint/Prettier config exists; Playwright is a
  dependency but has no configs or specs. `npm run build` (`tsc -b && vite build`) is
  the only typecheck. Do not invent `npm test` / `npm run lint`.

## Repository layout

| Path | Purpose |
|---|---|
| `src/app/` | App bootstrap, root `App.tsx`, lazy route table (`routes.tsx`) |
| `src/components/layout/` | `AppShell`, sidebar, topbar, mobile bottom-tab bar |
| `src/features/` | Page-level feature modules, one dir per domain |
| `src/services/` | ~60 domain services wrapping the axios client + local data |
| `src/repositories/` | Asset/Issue/Project event-emitting caches |
| `src/store/` | Redux Toolkit slices (projects, installations, users, customers, products) |
| `src/hooks/` | Cross-cutting hooks incl. `useSyncEngine`, `usePermissions` |
| `src/modules/bom-project/` | Feature-flagged, self-contained BOM-to-Project module |
| `server/Commtrac.Api/` | ASP.NET Core API: controllers, services, EF/SQLite, migrations |
| `docs/` | Generated `ARCHITECTURE.md` + supporting reference docs |
| `scripts/` | Doc generator, git-hook installer, android env helpers |

## Frontend architecture

### Layering

```
features/          page modules (one dir per domain)
   ↓
services/          ~60 files, one per domain — wrap the axios client + local data
   ↓
repositories/      Asset / Issue / Project — event-emitting caches
   ↓
store/             Redux slices: projects, installations, users, customers, products
```

Cross-cutting UI state lives in **React Contexts** wired up in `src/main.tsx`
(`ViewMode`, `AccessMode`, `ComplexView`, `NotificationInbox`, `FieldNotification`).
Routes are all **lazy-loaded** in `src/app/routes.tsx`; authenticated routes render
inside `AppShell`, which is a **desktop left-sidebar layout** or a **mobile
bottom-tab layout** depending on platform.

### The API client is offline-first — but only on native

`src/services/api.ts` is a single axios instance that handles:

- JWT injection on every request,
- **silent token refresh** (refreshes when < 30 min to expiry),
- a **stale-while-revalidate GET cache**, and
- IndexedDB fallback when the network is down.

**Critical gotcha:** caching, IndexedDB fallback, and offline behavior are gated on
`isMobileNativePlatform()`. **On web, requests pass straight through with no cache.**
When you touch request/response behavior, account for *both* paths. A `401` (except
auth and brand-settings calls) wipes the token and hard-redirects to `/login`.

### Offline write queue + sync engine

Writes that must survive offline go through `useSyncEngine`
(`src/hooks/useSyncEngine.ts`) → `queueOrSend`:

- **Online**: sends immediately.
- **Offline**: stores a `PendingAction` in IndexedDB (`src/services/localDB.ts`,
  `syncQueue.ts`) with an **optimistic patch**.

The engine flushes on reconnect, app-foreground, and visibility change, with
exponential backoff and **409/412 conflict detection** that the user resolves.
Locally-created entities get **temp IDs remapped to server IDs after first sync**
(`replaceEntityReferences` / `replaceRunIdReferences`) — preserve this when adding
new offline-capable entity types. `offlineStore.ts` holds workflow-run snapshots;
`mediaStore.ts` holds pending media blobs.

### Auth & permissions (frontend)

- On native, launch goes through a **biometric/PIN lock screen** before any routes
  render (`src/app/App.tsx` + `services/biometricAuth.ts`, `secureStorage.ts`).
- Tokens/user live in **secure storage** (Keychain/Keystore), not plain localStorage.
- Authorization is a **two-tier role→permission model** in `usePermissions.ts`:
  Tier 1 capability flags → Tier 2 per-domain view/edit/delete scopes, with
  hardcoded fallbacks.
- **Guards must wait for `permissionsReady`** before redirecting — the initial Viewer
  placeholder otherwise causes false-negative redirects (see `SettingsRoute`).

## Backend architecture

### Shape

- **Flat controllers**, one per resource (`Controllers/`), thin over EF Core.
- **Flat routes with `projectId` as a query param**, not nested — e.g.
  `GET /api/project-contacts?projectId=xxx`.
- Entities and DTOs are two monolithic files: `Models/Entities.cs` (~1400 lines) and
  `Models/Dtos.cs` (~1500 lines).
- Real-time push via `SseController` / `SseHub` (Server-Sent Events).
- **Background hosted services** for SQLite backup and document-search indexing (see
  [`MICROSERVICES.md`](MICROSERVICES.md)).

### Auth & permissions (backend)

JWT uses **short claim names** with `MapInboundClaims = false` (`Program.cs`). Role is
the `"role"` claim (`RoleClaimType = "role"`), **not** the long WS-Federation URI.
Do not "fix" this — several endpoints depend on it. An `OnTokenValidated` hook
back-fills `ClaimTypes.*` from the short claims so existing controllers keep working.

CORS policy `"frontend"` allows any localhost / private-LAN / IP-based origin with
credentials, so LAN devices can hit the API during mobile testing.

### Database initialization is unusual

`Data/DbInitializer.cs` runs on startup:

1. `db.Database.Migrate()` — applies the ~98 EF migrations under `Migrations/`.
2. A series of hand-written **`Ensure*` methods** that patch schema/indexes/columns
   *outside* the EF migration history.
3. **`Fix*` methods** that repair partially-applied migrations.

SQLite is put in **WAL mode with a busy timeout** here. When adding schema, prefer a
proper EF migration, but be aware these idempotent `Ensure*`/`Fix*` patches exist and
run **every boot**.

## Feature-flagged BOM module

`src/modules/bom-project/` is a **self-contained, flag-gated module**. Import it
**only** through `src/modules/bom-project/index.ts` — never reach into internals.

- Frontend flag: `VITE_ENABLE_BOM_MODULE=true`
- Backend flag: `ENABLE_BOM_PROJECT_MODULE=true` (set in `launchSettings.json`)

When off, its routes, menus, and APIs all disappear.

## Build, run & environment

### Frontend (repo root)

| Command | Effect |
|---|---|
| `npm run dev` | Vite dev server, port **5173**, binds `0.0.0.0` (LAN-visible for mobile) |
| `npm run build` | `tsc -b && vite build` — also the only typecheck |
| `npm run preview` | Serve the production build |
| `npm run docs:update` | Regenerate `docs/ARCHITECTURE.md` |
| `npm run hooks:install` | Install the pre-commit hook (also runs on `postinstall`) |

### Backend (`server/Commtrac.Api/`)

| Command | Effect |
|---|---|
| `dotnet run` | API on port **4000**; Swagger at `/swagger` in Development |
| `dotnet build` | Build/typecheck the API (or `dotnet build 915.sln` from root) |
| `dotnet ef migrations add <Name>` | Add a migration (applied on startup) |

### Mobile

- `npm run build && npx cap sync` — rebuild web assets and copy into native projects.
- Android from a terminal: `source scripts/android-env.sh` first, then
  `cd android && ./gradlew assembleDebug`.

### Environment config

- Frontend reads the API URL from **`VITE_API_BASE`** (`.env`). On `localhost`
  browser dev it defaults to `http://localhost:4000/api` regardless; native/LAN
  builds use `VITE_API_BASE` verbatim (`src/services/apiBase.ts`).
- **Native builds cannot reach `localhost`** — set `VITE_API_BASE` to a LAN IP (e.g.
  `http://192.168.1.x:4000/api`) before `npm run build`. Keep committed env files
  generic; put device IPs in untracked `.env.production.local`.
- `allow-network-access.ps1` (run as admin) opens Windows Firewall for ports
  5173/4000 for LAN device testing.
- Seeded admin on first run: `admin@commtrac.local` / `Admin123!`
  (`appsettings.json` → `SeedAdmin`).

## Conventions & gotchas

- `docs/ARCHITECTURE.md` is **generated** — edit the generator
  (`scripts/update-architecture-docs.mjs`), not the output.
- Windows dev box, PowerShell primary shell; the Bash tool is available for POSIX
  scripts.
- `Workflow` type field is `media` (not `mediaItems`); objects built from arrays need
  `media: []` to satisfy the type.
- `AssetIssue` requires both `issueType` and `isBlocking` fields, even for legacy
  creation paths.
- On `completeRun`, unresolved blocking issues cause the server to return **HTTP 422**.
- `.github/copilot-instructions.md` is **stale** and describes a different, older app —
  ignore it.
