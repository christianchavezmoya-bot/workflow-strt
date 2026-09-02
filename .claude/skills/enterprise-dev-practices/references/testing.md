# Testing Strategy

> **Applied (baseline now in place):** the three harnesses below are wired up
> with a passing first spec each — `npm test` (Vitest, `src/**/*.test.ts`),
> `dotnet test` in `server/Commtrac.Api.Tests` (xUnit + `WebApplicationFactory`
> login smoke), and `npm run test:e2e` (Playwright, `e2e/smoke.spec.ts`). This
> doc is now the **roadmap for growing coverage**, not a from-scratch plan.

**Original starting position: zero automated tests.** The strategy below is
ordered by value — what to test *next* now that the scaffolding exists.

## Principle: test the load-bearing, non-obvious logic first

With finite effort, cover the code where a silent bug is most expensive and
where types alone can't protect you. In this app that is, in order:

1. **The offline sync engine** (`src/hooks/useSyncEngine.ts`, `syncQueue.ts`,
   `localDB.ts`). Temp-ID → server-ID remapping, conflict (409/412) handling,
   flush-on-reconnect. A bug here loses field data. Highest value.
2. **The permission model** (`usePermissions.ts`). Tier-1 → Tier-2 resolution
   and the `permissionsReady` gate. A bug here is a security/authorization
   defect.
3. **The API client** (`src/services/api.ts`). Silent token refresh, the
   web-vs-native gating, 401 → redirect. Test both `isMobileNativePlatform()`
   branches.
4. **Backend controllers** — the 422-on-blocking-issue rule on `completeRun`,
   the flat `?projectId=` routing, JWT `"role"` claim authorization.

Do **not** start by writing shallow render tests for every MUI screen. That's
high-effort, low-signal.

## The pyramid for this stack

```
        e2e (Playwright)         few — critical flows: login → project → asset → workflow run
      ─────────────────────
     integration (backend)       some — controllers against a test SQLite DB
   ───────────────────────────
  unit (frontend + backend)      many — sync engine, permissions, api cache, DTO mapping
```

### Unit / integration — frontend (add Vitest)

Vite is already here, so Vitest is the natural fit (jsdom for hook/component tests):

```bash
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/coverage-v8
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
Put specs next to code as `*.test.ts(x)` or under `src/**/__tests__/`. First spec
to write: a `useSyncEngine` test that queues an action offline, simulates
reconnect, and asserts the temp ID was remapped.

### Integration — backend (xUnit + SQLite) — DONE, with a caveat

`server/Commtrac.Api.Tests` exists (xUnit, references the API, has
`Microsoft.AspNetCore.Mvc.Testing`). `Program.cs` ends with
`public partial class Program { }` so `WebApplicationFactory<Program>` can boot it.

- **`MigrationsTests`** (green): applies all ~98 EF migrations to a fresh temp
  SQLite DB and asserts none are pending. This is the migration-chain safety net.
- **`AuthLoginTests`** (green): the `WebApplicationFactory` login smoke — boots
  the whole app on a brand-new temp DB and logs in. Writing it **found and drove
  the fix for a real bug** 👇.

> **🐛→✅ Fresh-DB init bug (found by this test, now fixed).** Booting the app on
> a brand-new database crashed with `SQLite Error 1: 'no such column: IsDeleted'`
> (then `DeleteReason`). Root cause: five entities carry a soft-delete column
> cluster (`IsDeleted`, `DeletedAtUtc`, `DeletedByUserId`, `DeleteReason`) with
> `!IsDeleted` query filters, but **no migration creates those columns** — they
> were model-only, patched ad hoc on existing DBs. A fresh deploy would fail.
> **Fix:** `DbInitializer.EnsureSoftDeleteColumns` idempotently adds the cluster
> to all five tables (`Projects`, `Installations`, `Documents`, `ProjectAssets`,
> `BomImportRuns`) right after `Migrate()`, before any seeding query. The login
> test now guards it. *Lesson:* prefer a real migration for mapped columns — this
> class of drift is exactly what a fresh-DB integration test catches.

Next backend test: POST a workflow completion with an unresolved blocking issue →
assert **HTTP 422**, using the same `ApiTestFactory`.

### e2e — Playwright — DONE (frontend smoke)

`playwright.config.ts` + `e2e/smoke.spec.ts` exist; `npm run test:e2e` runs them.
The config auto-starts the Vite dev server. One-time browser install:

```bash
npx playwright install --with-deps chromium   # CI does this in the e2e job
```

- **`smoke.spec.ts`** (green) is deliberately **backend-independent**: it asserts
  the SPA mounts React and doesn't white-screen/crash — reliable whether or not
  the API is up. Keep it that way so CI (which starts only the dev server) is
  stable. *Gotcha found the hard way:* an earlier version asserted the login
  password field, which only renders when the API on :4000 is reachable — that
  made the smoke non-hermetic.
- **Next: the login→project→workflow-run flow.** This needs the API running and
  seeded, so it belongs in a separate backend-backed suite/CI job (start the API,
  wait for `:4000`, then run the browser flow). The fresh-DB blocker is fixed, so
  a clean CI database now seeds. Automate: login (`admin.dev@stratango.local` /
  `Admin123!`) → open a project → start an asset workflow run → complete a step.

## Until the suite exists: verify by exercising the flow

Every nontrivial change must be **verified by driving the actual flow**, not just
`tsc`. Use the `/verify` skill or manually: `npm run dev` (web, port 5173) +
`dotnet run` (API, port 4000), reproduce the before-state, apply the change, and
observe the after-state in the running app. A typecheck pass is necessary, not
sufficient — this repo has no tests to catch a logic regression for you.

## Coverage targets (once seeded)

Don't chase a global %. Set floors where they matter:
- Sync engine + permissions + `api.ts`: aim **high** (80%+), these are critical.
- Controllers touching auth or workflow completion: cover the error paths (401/422/409).
- UI screens: a render-without-crash + one happy-path interaction is plenty.

Wire `vitest run --coverage` and `dotnet test` into `check-gates.mjs` and CI as
soon as the first specs land, so coverage can't regress silently.
