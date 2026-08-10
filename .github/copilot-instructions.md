# Commtrac Codex 915 — Copilot / agent instructions

This repository is **Commtrac**: a field-operations app for telecom/utility project management (React 18 + TypeScript + MUI frontend, ASP.NET Core 8 + SQLite API, Capacitor mobile).

**Authoritative developer guide:** [`CLAUDE.md`](../CLAUDE.md) at the repo root.

**Generated architecture reference:** [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) (auto-updated by `npm run docs:update` / pre-commit hook — do not hand-edit).

## Quick orientation

- **Frontend:** `src/` — Vite, Redux Toolkit, lazy routes in `src/app/routes.tsx`
- **Backend:** `server/Commtrac.Api/` — flat controllers, EF Core + SQLite
- **Mobile:** Capacitor wraps the same `dist/` build (`android/`, `ios/`)
- **Native offline:** gated on `isMobileNativePlatform()` in `src/services/api.ts`, sync engine in `src/hooks/useSyncEngine.ts`

## Commands

- Frontend: `npm run dev`, `npm run build`, `npm test`
- Backend: `dotnet run` in `server/Commtrac.Api/` (port 4000)
- No ESLint/Prettier step; do not invent `npm run lint`

## Conventions

- Do not reach into `src/modules/bom-project/` internals — import via `index.ts` only (flag-gated).
- JWT role claim is short name `"role"`, not WS-Federation URI.
- Project/asset routes use flat API paths with `projectId` query params, not nested REST URLs.
