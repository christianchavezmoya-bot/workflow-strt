# Code quality assessment — August 2026

**Snapshot of `main` @ `bac9d7b`.** A point-in-time review, not a living document — re-run it rather
than edit it. The follow-up work is tracked separately in
[`CODE_QUALITY_REMEDIATION_PLAN.md`](./CODE_QUALITY_REMEDIATION_PLAN.md).

**Question asked:** if this repo were handed to a professional developer, would they find it built to
a reasonable standard — easy to understand, troubleshoot, and extend — or would they consider it
below average?

**Method:** measured directly against the working tree (file counts, line counts, import graphs,
test distribution), plus a read of every area called out below. Standards were taken from the repo's
own playbook in [`.claude/skills/enterprise-dev-practices/`](../.claude/skills/enterprise-dev-practices/SKILL.md)
rather than imported from outside. All figures are reproducible from the commands in the appendix.

---

## Verdict

**Below average in structure, above average in several subsystems, not a rewrite candidate.**

A professional would not conclude this was written by an amateur. They would conclude it is a
product that shipped fast and successfully and outgrew its own architecture. The conventions are
learnable in a day. The risk is not that a newcomer cannot understand the code — it is that they
cannot change the most important parts *safely*.

Against the three things that were actually asked:

| | Assessment |
|---|---|
| **Understand it** | Moderately easy. Good docs and comments, but a misleading architecture diagram and inconsistent naming slow the mental model. |
| **Troubleshoot it** | Genuinely well supported. Diagnostics, sync support bundles, fault reporting, triage docs. A strength. |
| **Extend it safely** | This is where it hurts. Two enormous screens and near-zero test coverage of critical paths. |

Scale: **116,913 lines** of frontend TypeScript across **480 files**; **29,079 lines** of backend C#
across **100 files** (excluding migrations); **67 EF migrations**.

---

## What is genuinely good

Listed first because a fair reader should not dismiss the whole codebase on the basis of the
problems that follow.

**TypeScript strict mode is real, not decorative.** Across 480 files there are only **13 `as any`**
casts and **2** suppression comments (`@ts-ignore` / `@ts-expect-error`). Most legacy React
codebases this size are far worse.

**The offline and sync subsystem is the best-engineered part of the app.** `useSyncEngine.ts`,
`localDB.ts`, `syncQueue.ts` and `offlineBootstrapService.ts` are cohesive, deliberately documented,
and handle genuinely hard problems — queueing, conflict detection, temp-ID remapping. For a
Capacitor offline-first field app this is above average.

**Two modules are internal exemplars.** `src/modules/bom-project/` has a public barrel, a feature
flag, and an enforced "do not import internals" rule. `src/features/timeAnalytics/` cleanly
separates pages, hooks, services and types with the API client injected at the boundary. Any
refactor should copy these rather than invent a new pattern.

**The auth stack is not a toy** — BCrypt, TOTP two-factor with recovery codes, login rate limiting
(5 attempts / 15 min), server-side session records, audit logging, trusted-device tokens.

**Backend infrastructure is thoughtfully built** — `IFileStorageService` with Local and S3
implementations, background workers for document-search indexing and SQLite backup, SSE push,
and a Postgres schema-parity test guarding the dual-provider path.

**Documentation culture is unusually strong** — 32 active documents plus 35 archived, a generated
architecture inventory, bug triage guide, release checklist, and a written maintenance policy.
Commit messages are descriptive and explain *why*.

---

## Findings, ordered by impact on a new developer

### 1. Two files are effectively unmaintainable

| File | Lines |
|---|---:|
| `src/features/installations/AssetInstallationPage.tsx` | **7,752** |
| `src/features/dashboard/Dashboard.tsx` | **6,921** |
| `src/features/admin/UserManagement.tsx` | 4,768 |
| `src/features/settings/Settings.tsx` | 4,376 |
| `src/features/workInstructions/WorkOrderRunner.tsx` | 3,829 |
| `src/features/workInstructions/WorkflowBuilder.tsx` | 3,595 |

These are not files containing many components — each is a *single* component. `AssetInstallationPage`
alone holds **147 `useState`**, **41 `useMemo`**, **26 `useEffect`**, and roughly 2,600 lines of JSX.
**23 files exceed 1,000 lines.**

This is the single biggest problem in the repo. A developer asked to change asset installation
behaviour cannot reason about the blast radius. In-file comments referring to infinite re-render
loops and pages hanging on spinners indicate past changes have already gone wrong here.

Mitigating note: sibling files (`CaptureTablePage.tsx`, `OperationsVirtualizedTableBody.tsx`,
`useProjectCaptureData.ts`) show extraction was started and stopped short. The direction is right.

### 2. Almost nothing that matters is tested

| Area | Test files | Source files |
|---|---:|---:|
| `utils/` | 31 | 94 |
| `services/` | 21 | 102 |
| `hooks/` | 1 | 25 |
| `features/` | 1 | 84 |
| `components/` | **0** | 60 |
| Backend | **5** meaningful tests | ~296 HTTP endpoints |

253 frontend tests sounds healthy until you see they cluster on small pure functions. The
7,752-line page, the entire component layer, and workflow completion logic have no coverage. The
backend's tests cover migrations applying and login working — valuable, but they protect no
business rule.

The practical consequence: **a refactor cannot be verified.** This is what makes the god files
permanent rather than merely ugly, and it is why the remediation plan puts tests before structure.

### 3. Schema is managed by four competing mechanisms

To know how a table comes into existence you must understand all of:

| Mechanism | Count |
|---|---:|
| EF migrations | 67 |
| `Ensure*` methods in `DbInitializer.cs` (patch schema outside migration history) | 23 |
| `Fix*` methods (reconcile the two) | 2 |
| `PostgresSchemaEnsurer` (separate cloud path) | 1 file |

`DbInitializer.cs` is 1,412 lines and runs raw ADO.NET DDL on every SQLite boot. This directly
caused the Postgres staging blockers in PRs #183–#185: schema existed in one path and not the other.

### 4. Business logic lives in controllers

| Metric | Value |
|---|---:|
| Controllers | 54 files / **16,425 lines** |
| Services | 28 files / **5,760 lines** |
| Ratio | **~2.9 : 1** |
| Controllers with no service dependency | **~48%** |

`AssetWorkflowRunsController.cs` is **2,650 lines** with 24 endpoints and 87 direct database calls.
Workflow completion, time tracking, signature state and asset status transitions sit inline in HTTP
handlers — precisely the logic most worth unit testing.

There is also **no global exception handling** and **no validation framework** (zero uses of
`ModelState.IsValid`). At least six different error response shapes exist across controllers
(`{ message }`, `{ error }`, bare `NotFound()`, `UnprocessableEntity(...)`, and others), so no
client can rely on a single error contract.

### 5. The documented architecture is roughly half aspirational

The stated layering is `features → services → repositories → store`, with the rule that a component
never imports axios directly.

| Claim | Reality |
|---|---|
| Components never import axios | Broken in 2 UI files (`ResetPassword.tsx`, `MobileDocumentPreviewDialog.tsx`) |
| All HTTP goes through `api.ts` | 3 services import axios directly, bypassing token refresh and offline handling: `projectService.ts`, `projectAssetService.ts`, `assetWorkflowAssignmentService.ts` |
| Components go through domain services | ~16 feature files import `api` directly; `RecoveryCenter.tsx` inlines ~15 endpoints |
| `repositories/` is a data layer | 4 files, consumed by 3 screens |
| Redux is the store layer | 4 catalog slices only; domain entities live in services/IndexedDB |

A newcomer following the documented diagram would be misled. The layering is not wrong so much as
**overstated**.

### 6. Naming is inconsistent enough to slow you down

- Feature directories mix three conventions: `dashboard`, `mobile-upload`, `workInstructions`
- **~31%** of service modules lack the `Service` suffix (`localDB.ts`, `syncQueue.ts`, `mediaStore.ts`)
- Some screens end in `Page`, many do not (`Dashboard.tsx`, `Settings.tsx`, `UserManagement.tsx`)

None of this is fatal. The cost is that there is no rule you can rely on when guessing where
something lives.

### 7. Dead code and stray files

Seven files confirmed with **zero references** anywhere in the codebase:

```
src/features/customers/CustomersPortal.tsx   (+ .css)
src/features/sites/SitesManagement.tsx
src/services/issueService.ts
src/services/customFieldService.ts
src/components/ui/SummaryCard.tsx
src/components/ui/TakeOverDialog.tsx
src/hooks/useOfflineGuard.tsx
```

Also committed at the repo root: two `.patch` files and a `.bak` copy of `.claude/settings.json`.

Small individually, but this is the kind of thing that makes a newcomer distrust what they read.

---

## Onboarding is the weakest link

**The README never explains how to run the app.** It is 32 lines covering documentation generation
and Android environment setup. There is no prerequisites list, no `npm install`, no `npm run dev`,
no instruction to start the backend, no mention of port 4000, and no login credentials.

Also absent: `CONTRIBUTING.md`, `LICENSE`, `CODEOWNERS`, `.nvmrc`, `.editorconfig`, and an `engines`
field pinning Node and .NET versions.

The information exists — in `CLAUDE.md` and `docs/` — but a human developer's first instinct is the
README, and it does not help them. This is the cheapest high-impact fix available.

Related: the engineering standards playbook
([`SKILL.md`](../.claude/skills/enterprise-dev-practices/SKILL.md)) still opens by stating the repo
has "no CI, no test suite, and no linter". All three now exist; its own scorecard further down says
so. Same staleness that was corrected in `CLAUDE.md` in PR #186.

---

## Security observations

Verified directly against the source, not inferred.

| Finding | Location | Detail |
|---|---|---|
| Unauthenticated media download | `WorkflowConfigsController.ServeMedia` | `[AllowAnonymous]`; anyone with the URL can fetch workflow media. IDs are GUIDs so not trivially enumerable, but it is not access-controlled |
| Issues not scoped to the user | `IssuesController.GetAll` | Returns every issue in the database to any signed-in user — no project or office filter |
| Sync feed not scoped | `SyncChangesController.GetChanges` | Same pattern for asset/project identifiers |
| Long token lifetime | `appsettings.json` → `Jwt:ExpiresMinutes: 1440` | 24 hours, on devices that leave the office |

Foundations are otherwise sound: authenticated-by-default fallback policy with explicit
`[AllowAnonymous]` opt-outs, BCrypt, rate limiting, and parameterised SQL in the raw queries checked.

---

## Scorecard

| Dimension | Rating |
|---|---|
| Offline / sync engineering | Above average |
| Documentation culture | Above average |
| Backend infrastructure (storage, email, search, backups) | Above average |
| Type safety | Slightly above average |
| Consistency of macro-patterns | Average |
| Security posture | Average |
| Layering adherence | Below average |
| Naming consistency | Below average |
| Dead code | Below average |
| Schema management | Below average |
| File size / change safety | **Well below average** |
| Test coverage of critical paths | **Well below average** |
| README / onboarding | **Well below average** |

---

## Appendix — reproducing the figures

```bash
# Frontend and backend size
find src \( -name "*.ts" -o -name "*.tsx" \) | wc -l
find src \( -name "*.ts" -o -name "*.tsx" \) -exec cat {} + | wc -l
find server/Commtrac.Api -name "*.cs" -not -path "*/obj/*" -not -path "*/bin/*" \
  -not -path "*/Migrations/*" | wc -l

# Largest files
find src \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | sort -rn | head -20
find src \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | awk '$1>1000 && $2!="total"' | wc -l

# Controller vs service balance
find server/Commtrac.Api/Controllers -name "*.cs" -exec cat {} + | wc -l
find server/Commtrac.Api/Services    -name "*.cs" -exec cat {} + | wc -l

# Schema mechanisms
grep -c "private static void Ensure" server/Commtrac.Api/Data/DbInitializer.cs
grep -c "private static void Fix"    server/Commtrac.Api/Data/DbInitializer.cs
ls server/Commtrac.Api/Migrations/*.cs | grep -v "Designer\|Snapshot" | wc -l

# Layer leaks
grep -rln "from \"axios\"" src/

# Type-safety escape hatches
grep -rn "as any" src/ | wc -l
grep -rn "@ts-ignore\|@ts-expect-error" src/ | wc -l
```
