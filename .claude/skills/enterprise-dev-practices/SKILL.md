---
name: enterprise-dev-practices
description: >
  Enterprise software-development standards for THIS repo (Commtrac Codex 915 —
  React 18 + TS + MUI frontend, ASP.NET Core 8 + EF Core backend, Capacitor
  mobile). Load when adding a feature, reviewing a PR, refactoring, setting up
  CI/CD, adding tests, or making architecture/code-quality/testing decisions.
  Trigger words: best practices, code quality, architecture, layering, testing
  strategy, test coverage, CI/CD, pipeline, quality gate, PR review, refactor,
  conventions, "is this shippable", "how should I structure".
---

# Enterprise Dev Practices — Commtrac Codex 915

This skill is the engineering-standards playbook for this repo. It exists
because the repo has a clean architecture and TypeScript strict mode, but **no
CI, no test suite, and no linter** — so "good practices" here means *following
the layering that exists* and *closing the gaps deliberately*, not importing
generic advice that ignores the codebase.

All paths below are relative to the repo root (the `<unit>`).

## Before you commit: run the gates

There is one executable gate runner. Run it before finishing any change — it is
the local stand-in for the CI this repo doesn't have yet:

```bash
node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs
```

Verified this session (Windows, Node 24, .NET 8):

```
[PASS] typecheck  — npx tsc -b (typecheck only)
[PASS] backend    — dotnet build
[PASS] test       — 6 tests passed
[INFO] lint       — 13 error(s), 213 warning(s) [backlog — not enforced]
[PASS] docs       — ARCHITECTURE.md content up to date
[PASS] hygiene    — no tracked build/db/log artifacts
All 5 blocking gate(s) passed.
```

It exits nonzero if any **blocking** gate fails (INFO gates are advisory). Gates:

| Gate | What it runs | Blocking? |
|---|---|---|
| `typecheck` | `npx tsc -b` (add `--full` → `npm run build`) | ✅ The only TS typecheck; strict mode. |
| `backend`   | `dotnet build` in `server/Commtrac.Api` | ✅ `Nullable` on — the build *is* the check. |
| `test`      | `npm test` (vitest run) | ✅ Frontend unit tests. |
| `lint`      | `npm run lint` (eslint) | ⚠️ **Non-blocking backlog** — reports counts, doesn't fail. |
| `docs`      | regenerates `docs/ARCHITECTURE.md`, fails if content stale | ✅ Header/commit churn ignored. |
| `hygiene`   | `git ls-files` vs a junk pattern | ✅ No `.db`/`.log`/`dist`/`tempbuild` tracked. |
| `backendtest` | `dotnet test` in `server/` (opt-in) | boots the API against a temp DB — name it explicitly |
| `e2e`       | `npm run test:e2e` (opt-in) | Playwright smoke; auto-starts the dev server |

Run a subset by naming gates: `... check-gates.mjs typecheck backend`. Opt-in
gates run only when named: `... check-gates.mjs backendtest e2e`.
Use `--full` for the real bundle gate before a release build.

> **Lint is a backlog gate, on purpose.** The repo had no linter; the first run
> surfaced **13 error-level + 213 warning-level** findings. The runner reports
> them but doesn't block, and CI marks the lint job `continue-on-error`. Burn the
> 13 errors down (`prefer-const`, `no-case-declarations`,
> `no-constant-binary-expression`, `no-useless-escape`), then flip lint to
> blocking. Don't add *new* lint errors.

## The standards (read the reference for the area you're touching)

- **[references/architecture.md](references/architecture.md)** — the real
  layering (`features → services → repositories → store`), the offline-first
  boundaries you must not break, and where new code goes. Read before adding a
  feature or moving code between layers.
- **[references/code-quality.md](references/code-quality.md)** — naming/typing
  conventions, the codebase's landmine gotchas (`workflow.media`, `AssetIssue`
  required fields, the `"role"` claim, `permissionsReady`), and the PR review
  checklist. Read before writing code or reviewing a diff.
- **[references/testing.md](references/testing.md)** — the testing strategy for
  a repo starting from **zero tests**: what to test first (the sync engine, the
  permission model, the API cache), the pyramid for this stack, and how to stand
  up Vitest + the already-installed Playwright.
- **[references/ci-cd.md](references/ci-cd.md)** — a drop-in GitHub Actions
  pipeline built from the exact gates above (there is no `.github/workflows/`
  yet), plus branch-protection and release/versioning guidance.

## The non-negotiables (apply to every change)

1. **Green before done.** `check-gates.mjs` typecheck + backend must pass. TS
   strict means no `any` escape hatches to silence errors — fix the type.
2. **Respect the layer boundaries.** A React component never imports axios
   directly; it goes component → hook/service → `api.ts`. See architecture ref.
3. **Web and native are two code paths.** The API cache, IndexedDB, and offline
   queue are gated on `isMobileNativePlatform()`. Any request/response change
   must be reasoned about for *both* paths.
4. **Offline writes preserve the temp-ID → server-ID remap.** New offline-capable
   entities must go through the sync engine's `replaceEntityReferences` path.
5. **Schema changes are EF migrations**, not new `Ensure*` hacks in
   `DbInitializer` (those exist for legacy repair; don't grow them).
6. **Don't hand-edit generated docs.** Edit `scripts/update-architecture-docs.mjs`;
   let the pre-commit hook regenerate `docs/ARCHITECTURE.md`.
7. **Nothing secret or generated gets committed.** No DBs, logs, `dist/`, device
   IPs (use untracked `.env.production.local`).

## Current-state scorecard

Baseline was overhauled — most gaps are now closed (see git history for this
skill's introduction). Remaining ⚠️ items are the burn-down backlog.

| Practice | State | Action |
|---|---|---|
| TypeScript strict | ✅ on (`tsconfig.json`) | keep; never weaken |
| Backend nullable ref types | ✅ on (`.csproj`) | keep |
| Layered architecture | ✅ enforced by convention | keep boundaries |
| CI/CD | ✅ `.github/workflows/ci.yml` (frontend/backend/standards/e2e) | keep green |
| Frontend tests | ✅ Vitest wired, first specs pass (`npm test`) | grow coverage per testing ref |
| Backend tests | ✅ xUnit project + integration smoke (`server/Commtrac.Api.Tests`) | add the 422 flow next |
| e2e | ✅ Playwright config + smoke (`npm run test:e2e`) | add the login→workflow flow |
| Lint / format | ✅ ESLint + Prettier configured | ⚠️ burn down 13 lint errors, then enforce |
| Pre-push hook | ✅ `.githooks/pre-push` runs the gates | keep |
| Pre-commit hook | ⚠️ still only regenerates docs | fine as-is (heavy gates run pre-push) |
| Repo hygiene | ✅ backup `.db` files untracked; `.gitignore` broadened | `hygiene` gate green |
| Fresh-DB startup | 🐛 app can't init a brand-new DB (`no such column: p.IsDeleted`) | found by the backend test — fix `DbInitializer` order (see testing ref) |
| `Entities.cs` / `Dtos.cs` | ⚠️ ~1400 / ~1500-line monoliths | split by domain when you touch them |
| `axios` layer leaks | ⚠️ a few components/services bypass `api.ts` | route through `api.ts` when you touch them |
| Bundle size | ⚠️ `pdf-reporting` chunk >1 MB | lazy-load; already partly chunked in `vite.config.ts` |
