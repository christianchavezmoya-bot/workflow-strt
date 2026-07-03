# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A field-operations app for telecom/utility project management: projects, installable assets,
work instructions/workflows, inspections, issues, documents, e-signatures. One React bundle ships
three ways — desktop web, and Android/iOS via Capacitor wrappers — talking to an ASP.NET Core + SQLite API.

- **Frontend**: React 18 + TypeScript + MUI v5, Vite, Redux Toolkit, React Router v6 (`src/`)
- **Backend**: ASP.NET Core 8 + EF Core (SQLite), JWT auth (`server/Commtrac.Api/`)
- **Mobile**: Capacitor 8 Android + iOS wrapping the same `dist/` web build (`android/`, `ios/`)

> Note: `.github/copilot-instructions.md` is **stale and describes a different, older app** — ignore it.

## Commands

Frontend (repo root):
- `npm run dev` — Vite dev server, port 5173, binds `0.0.0.0` (LAN-visible for mobile testing)
- `npm run build` — **`tsc -b && vite build`**; this is also the only typecheck. Run it to verify TS changes.
- `npm run preview` — serve the production build
- `npm run docs:update` — regenerate `docs/ARCHITECTURE.md` (also runs in the pre-commit hook)
- `npm run hooks:install` — install the git pre-commit hook (also runs on `postinstall`)

Backend (`server/Commtrac.Api/`):
- `dotnet run` — API on **port 4000**; Swagger UI at `/swagger` in Development
- `dotnet build` — build/typecheck the API (or `dotnet build 915.sln` from root)
- `dotnet ef migrations add <Name>` — add a migration (applied automatically on startup, see below)

Mobile:
- `npm run build && npx cap sync` — rebuild web assets and copy into native projects
- Android from a terminal: `source scripts/android-env.sh` first (aligns JDK/SDK with Android Studio), then `cd android && ./gradlew assembleDebug`

**There is no lint step and no test suite.** No ESLint/Prettier config exists; Playwright is a dependency but there are no configs or specs. Do not invent `npm test`/`npm run lint` — they don't exist.

## Local dev setup

- Frontend reads the API URL from **`VITE_API_BASE`** (`.env`). On `localhost` browser dev it defaults to `http://localhost:4000/api` regardless; native/LAN builds use `VITE_API_BASE` verbatim (see `src/services/apiBase.ts`).
- Native builds **cannot reach `localhost`** — set `VITE_API_BASE` to a LAN IP (e.g. `http://192.168.1.x:4000/api`) before `npm run build`. Keep committed env files generic; put device IPs in untracked `.env.production.local`.
- `allow-network-access.ps1` (run as admin) opens Windows Firewall for ports 5173/4000 for LAN device testing.
- Seeded admin on first run: `admin@commtrac.local` / `Admin123!` (`appsettings.json` → `SeedAdmin`).

## Architecture — the non-obvious parts

### Frontend layering
`features/` (page modules, one dir per domain) → `services/` (~60 files: one per domain, wrapping the axios client + local data) → `repositories/` (Asset/Issue/Project, event-emitting caches) → `store/` (Redux slices for projects/installations/users/customers/products). Cross-cutting UI state lives in React Contexts wired up in `src/main.tsx` (ViewMode, AccessMode, ComplexView, NotificationInbox, FieldNotification). Routes are all lazy-loaded in `src/app/routes.tsx`; authed routes render inside `AppShell` (desktop sidebar / mobile bottom-tab layout).

### The API client is offline-first, but only on native (`src/services/api.ts`)
A single axios instance handles JWT injection, **silent token refresh** (refreshes when <30 min to expiry), and a **stale-while-revalidate GET cache**. Critical: the caching, IndexedDB fallback, and offline behavior are gated on `isMobileNativePlatform()` — **on web, requests pass straight through with no cache.** When touching request/response behavior, account for both paths. A 401 (except auth/brand-settings calls) wipes the token and hard-redirects to `/login`.

### Offline write queue + sync engine
Writes that should survive offline go through `useSyncEngine` (`src/hooks/useSyncEngine.ts`) → `queueOrSend`: online sends immediately; offline stores a `PendingAction` in IndexedDB (`src/services/localDB.ts`, `syncQueue.ts`) with an optimistic patch. The engine flushes on reconnect, app-foreground, and visibility change, with exponential backoff and 409/412 **conflict detection** the user resolves. Locally-created entities get temp IDs that are **remapped to server IDs after first sync** (`replaceEntityReferences` / `replaceRunIdReferences`) — preserve this when adding new offline-capable entity types. `offlineStore.ts` holds workflow-run snapshots; `mediaStore.ts` holds pending media blobs.

### Auth & permissions
JWT uses **short claim names** and `MapInboundClaims = false` on the server (`Program.cs`); role is the `"role"` claim, not the long WS-Federation URI — don't "fix" this, several endpoints depend on it. On native, launch goes through a **biometric/PIN lock screen** before routes render (`src/app/App.tsx` + `services/biometricAuth.ts`, `secureStorage.ts`). Tokens/user live in secure storage (Keychain/Keystore), not plain localStorage. Frontend authorization is a **two-tier role→permission model** in `usePermissions.ts` (Tier 1 capability flags → Tier 2 per-domain view/edit/delete scopes) with hardcoded fallbacks; guards must wait for `permissionsReady` before redirecting or the initial Viewer placeholder causes false-negative redirects (see `SettingsRoute`).

### Backend shape
Flat controllers (one per resource, `Controllers/`), thin over EF Core. **Routes are flat with `projectId` passed as a query param**, not nested (e.g. `GET /api/project-contacts?projectId=xxx`). Entities and DTOs are two monolithic files: `Models/Entities.cs` (~1400 lines) and `Models/Dtos.cs` (~1500 lines). SSE push via `SseController`/`SseHub`; background hosted services for SQLite backup and document-search indexing.

### Database initialization is unusual (`Data/DbInitializer.cs`)
On startup it runs `db.Database.Migrate()` **and then a series of hand-written `Ensure*` methods** that patch schema/indexes/columns outside the EF migration history (plus `Fix*` methods that repair partially-applied migrations). When adding schema, prefer a proper EF migration, but be aware these idempotent `Ensure*` patches exist and run every boot. SQLite is put in WAL mode with a busy timeout here. There are ~98 migrations under `Migrations/`.

### Feature-flagged BOM module
`src/modules/bom-project/` is a self-contained, flag-gated module. Import it **only** through `src/modules/bom-project/index.ts` (never reach into internals). Enabled by `VITE_ENABLE_BOM_MODULE=true` (frontend) and `ENABLE_BOM_PROJECT_MODULE=true` (backend, set in `launchSettings.json`). Routes/menus/APIs all disappear when off.

## Conventions & gotchas

- `docs/ARCHITECTURE.md` is **generated** by `scripts/update-architecture-docs.mjs` (regex-parses routes/nav/controllers) and re-staged by the pre-commit hook — don't hand-edit it; edit the generator.
- Windows dev box, PowerShell primary shell. The Bash tool is also available for POSIX scripts.
- `Workflow` type field is `media` (not `mediaItems`); objects built from arrays need `media: []` to satisfy the type.
- `AssetIssue` requires both `issueType` and `isBlocking` fields even for legacy creation paths.
- On `completeRun`, unresolved blocking issues cause the server to return **HTTP 422**.
