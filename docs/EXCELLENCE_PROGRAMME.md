# Excellence programme — below average to excellent, without breaking anything

**The single entry point.** This document bundles three separate pieces of analysis into one ordered
programme and adds the mechanism that makes it safe to run against a product already in daily use.

| Source document | What it contributes |
|---|---|
| [`CODE_QUALITY_ASSESSMENT.md`](./CODE_QUALITY_ASSESSMENT.md) | The structural verdict and scorecard |
| [`CODE_QUALITY_BUG_SWEEP.md`](./CODE_QUALITY_BUG_SWEEP.md) | Reproduced defects, dead code, security re-check |
| [`CODE_QUALITY_REMEDIATION_PLAN.md`](./CODE_QUALITY_REMEDIATION_PLAN.md) | Phases 1–8, structure and tests |
| [`MODERNIZATION_PLAN.md`](./MODERNIZATION_PLAN.md) | Dependency ladder, M1–M9, the .NET deadline |

Read this document to know **what happens next and in what order**. Read the others for detail.

---

## The premise

The app works. Web, phone-online and phone-offline are all behaving correctly for real users. That
is the thing being protected, and it outranks every improvement listed here.

> **The governing rule.** Any user-visible change in behaviour, layout or speed is a **defect**, not
> an improvement — including changes someone believes are better. Where a change genuinely cannot be
> made invisible, we **stop, assess what is lost, and decide** before continuing.

The second half of that rule is the part most programmes skip, so it is formalised below as the
[UX divergence protocol](#the-ux-divergence-protocol).

## Where we are and where this ends

| Dimension | Now | After |
|---|---|---|
| README / onboarding | Well below average | Above average |
| Test coverage of critical paths | Well below average | Above average |
| File size / change safety | Well below average | Above average |
| Dead code | Below average | Above average |
| Layering adherence | Below average | Above average |
| Naming consistency | Below average | Average |
| Schema management | Below average | **Unchanged — deliberate** |
| Security posture | Average | Above average |
| Dependency currency | **Below average** | Above average |
| Backend structure | Below average | Average |
| Offline / sync engineering | Above average | Above average, now tested |
| Documentation culture | Above average | Above average |
| Type safety | Slightly above average | Above average |

One dimension is deliberately left where it is. The four competing schema mechanisms are ugly but
load-bearing legacy repair, already guarded by the migration integrity test, and rewriting them
risks breaking existing installations for no user-visible gain.

---

## The UX divergence protocol

Every change gets classified before it is merged. The class determines what happens.

| Class | Meaning | Action |
|---|---|---|
| **0** | Invisible. No rendered output, timing or behaviour differs | Proceed. Normal review |
| **1** | Cosmetically identical in intent — sub-pixel shifts, identical text, same interaction | Proceed. Note it in the PR |
| **2** | Noticeable but functionally equivalent — a colour token shifts, a message is reworded, a spinner appears in a different place | **Before/after evidence required.** Explicit sign-off before merge |
| **3** | Functional difference — something appears, disappears, moves, or behaves differently | **STOP.** Write a divergence note. Do not merge on a developer's judgement |

### The divergence note

A Class 3 change requires this written down before any decision:

1. **What changes** for the user, in plain language, from their point of view
2. **What is lost** — capability, familiarity, muscle memory, speed
3. **Why it cannot be avoided** — what was tried
4. **Compensation options** — how the loss could be offset, with the cost of each
5. **Recommendation** — proceed, compensate, defer, or abandon

Then one of four outcomes. **Abandon is a legitimate and expected outcome**; a plan that never
abandons anything was not really assessing.

Accepted divergences are recorded in the [register](#divergence-register) at the bottom of this
document, so the next person knows a change was deliberate rather than a bug.

### Divergences we already know are coming

Named now so they are not discovered mid-migration:

| Likely divergence | Class | Source | Compensation |
|---|---|---|---|
| MUI visual drift across 4 majors — spacing, elevation, typography defaults | 2 | S9 | Pin the current look via theme overrides; migrate one major at a time with screenshot diffs |
| `zod` 4 changes default validation message wording | 2 | S9 | Pin messages explicitly rather than accepting new defaults |
| Error text users see, once one error contract exists | 2 | S5 | Likely an improvement — but assess and sign off rather than assume |
| Refresh timing after hook-dependency fixes — more or fewer spinners | 2 | S8 | Compare before/after; treat extra network calls as a regression |
| The disabled workflow-builder picker, if re-enabled | **3** | S2 | **Decided: stay retired.** Delete dead code in S8 instead — see [`S2_PRODUCT_DECISIONS.md`](./S2_PRODUCT_DECISIONS.md) |
| Deleting `SitesManagement.tsx` / `CustomersPortal.tsx` — unreferenced but whole screens | **3** | S1 | Confirm they were never reachable, not merely unrouted today |

---

## Stages

Ten stages. Each is independently shippable and revertible. Each names what proves it did no harm.

### S0 — Baseline and safety net
**Class 0. Blocks everything else.**

You cannot prove "nothing changed" without a record of how things were. This does not exist today
and is the single most important addition to the programme.

- **Visual baseline.** A Playwright screenshot harness covering the ~31 routes in `src/app/routes.tsx`,
  at desktop and phone viewport. Today e2e visits five screens; that is not enough to detect layout
  drift during the MUI work
- **Performance baseline.** Record actual `web-perf` timings, bundle sizes per chunk, and
  offline-open numbers as *values*, not just pass/fail against a ceiling. A change that is 30% slower
  but under budget currently passes silently
- **Behavioural baseline.** Confirm all 7 CI checks green on `main` and capture the run as the
  reference point

Nothing else starts until this exists. It is also what turns the governing rule from an intention
into something enforceable.

*Verified by:* the harness runs clean twice in a row on unchanged code.

### S1 — Zero-risk wins
**Class 0.** Sources: remediation Phase 1, modernisation M1.

- Delete the **17 unreferenced files** (~1,988 lines) and 2 root `.patch` files. Verify each — two of
  them are whole screens and need the Class 3 check above; `ConnectivityDebugBar.tsx` survives naive
  grep because its only mention is in a comment
- A README that actually starts the app. Add `CONTRIBUTING.md`, `LICENSE`, `.nvmrc`,
  `.editorconfig`, `engines`
- Fix the stale opening paragraph in the standards playbook (still claims no CI, tests or linter)
- **Security patches:** `jspdf` → 4.2.1 clears the one **critical** advisory and is a patch bump;
  `npm audit fix` for the transitive highs
- Fix the 9 remaining lint errors, then **make lint blocking in CI**

Expect no speed change from the deletions — Vite already tree-shakes those files out of the bundle.
Verified against `dist/`.

*Verified by:* CI green, baseline harness unchanged, one PDF export spot-check.

### S2 — Decisions that need a human
**Blocks parts of S1 and S9.** Sources: bug sweep.

**Status: complete** — verdicts in [`S2_PRODUCT_DECISIONS.md`](./S2_PRODUCT_DECISIONS.md).

Three questions only the product owner can answer:

1. **The workflow-builder product-features picker** is unreachable behind `{false && …}` in
   `WorkflowBuilder.tsx:2334`. Retired deliberately, or a debugging change that shipped? If the
   latter, users have been missing functionality
2. **`xlsx` has no security fix and will not get one** — SheetJS left npm. Choose: vendor
   distribution, replace with `exceljs`, or accept a contained risk on the two paths that parse
   user-supplied workbooks
3. **The 20 `[AllowAnonymous]` endpoints.** Most are clearly correct. Record the verdict for each in
   one place so the next reviewer does not rediscover the reasoning — `SseController`'s exemption is
   correct and already documented; `OfficesController.GetAll` returning offices to unauthenticated
   callers needs confirming

*Verified by:* written answers, not code.

### S3 — Tests before structure
**Class 0.** Source: remediation Phase 3.

**Status: complete** — see [`S3_TEST_FOUNDATION.md`](./S3_TEST_FOUNDATION.md) for coverage tracker.

The ordering rule of the whole programme: **characterise, then extract.** There is no coverage on the
biggest files, so a refactor of them cannot currently be verified — you would trade a known-ugly
working app for an unknown-broken one.

In priority order: workflow completion including the blocking-issue rule that returns HTTP 422; the
two-tier permission model in `usePermissions.ts`; the offline queue's temp-ID → server-ID remap
(highest-consequence logic in the app); backend controller tests for the workflow endpoints. Then
characterisation tests for the two god files, written immediately before splitting them.

Pin behaviour **including quirks**. A quirk someone relies on is a feature.

*Verified by:* new tests pass on unchanged code before any refactor begins.

### S4 — Runtime currency
**Class 0 expected. Carries the programme's only deadline.** Sources: M2, M4.

- **axios 1.13 → 1.19.** ~20 advisories at the installed version, including SSRF and prototype
  pollution. It sits under every HTTP call in the app. Minor bump, no API change — the work is
  verification, and it **must include a manual offline phone pass** because this is the sync path
- **.NET 8 → .NET 10 LTS.** End of support is **10 November 2026**. `.NET 9` expires the same day so
  it is not a stepping stone. Touches `TargetFramework`, EF Core 8, Npgsql 8, the `Dockerfile`
  (`sdk:8.0` / `aspnet:8.0`) and CI

Schedule S4 **around the cloud move, not after it**. Going live on a runtime that stops receiving
security patches three months later is a poor starting position.

*Verified by:* `dotnet test`, migration chain on both SQLite and Postgres, staging standup, manual
phone pass.

### S5 — One error contract
**Class 2 — error text users read will change.** Source: remediation Phase 8.

296 endpoints, three error body shapes (`{ message }` × 88, `{ error }` × 31, `{ status }` × 1), zero
global exception handlers, zero `ModelState.IsValid`. No client can write one error handler, and an
unhandled exception returns a framework default matching none of the three.

Add a global exception handler and one shape, keeping the old shapes readable during a transition
rather than switching in one release. Add request validation to the workflow and asset endpoints
first, where a malformed payload currently reaches EF Core. Give the frontend one place that
understands the contract.

**Also before the cloud move**, despite being a late phase in the source plan: once real users are
hosted, a consistent error shape is the difference between a diagnosable fault report and a
screenshot of a blank dialog.

*Verified by:* every changed endpoint has a test asserting the new shape; a divergence note covering
the user-facing message changes.

### S6 — Backend structure and scoping
**Class 0, except two deliberate scope reductions.** Source: remediation Phase 5.

Move workflow logic out of `AssetWorkflowRunsController.cs` (2,650 lines, 24 endpoints, 87 direct
database calls) into services. Split `Entities.cs` and `Dtos.cs` by domain.

Security: scope `IssuesController.GetAll` — it currently returns **every issue in the database to any
signed-in user** — and `SyncChangesController` to the caller. Both are Class 3 in the strict sense:
some users will see fewer rows than before. That is the intent, but it needs a divergence note
confirming nobody depends on the over-broad behaviour.

*Verified by:* the new controller tests from S3; explicit test that a user cannot see another
office's issues.

### S7 — Build and tooling currency
**Class 0.** Sources: M5, M6.

ESLint 10, `@vitejs/plugin-react` 6, `@testing-library/jest-dom` 7, TypeScript 7, Vite 8. All either
dev-only or build-only. Vite 8 is the only one that can affect output, and the bundle budgets plus
the S0 perf baseline catch that.

*Verified by:* CI green, bundle sizes within budget **and** compared against the S0 baseline.

### S8 — Structure: split the god files
**Class 1–2. The largest body of work.** Sources: remediation Phases 4, 6, 7.

Only possible because S3 exists.

- `AssetInstallationPage.tsx` (7,752 lines) and `Dashboard.tsx` (6,921), **one extraction per PR**.
  Suggested order for the installation page: column configuration, CSV import, workflow assignment
  panel, table body, leaving orchestration in the page. Continue the direction started by
  `CaptureTablePage.tsx` — do not invent a second scheme
- Then the next tier: `WorkOrderRunner.tsx` (3,829) first, because it is the screen a field worker
  spends the most time in, then `UserManagement.tsx` (4,768), `Settings.tsx` (4,376),
  `WorkflowBuilder.tsx` (3,595)
- The **44 `react-hooks/exhaustive-deps` warnings**, 13 of them in the two god files. **One per PR.**
  Adding a missing dependency can trigger the exact re-render loop the original author worked around
  — the in-file comments show that has already happened. This is the highest behavioural risk in the
  programme
- Establish component testing. `src/components` has 60 source files and **zero** tests today
- A convention for deliberate error swallowing: 75 empty `catch {}` and 97 comment-only. The
  rationale is sound but nothing distinguishes "safe to ignore" from "we hope this never happens"

*Verified by:* S0 screenshot harness per extraction; perf numbers compared to baseline, not just to
budget; manual phone pass before merging anything in this stage.

### S9 — The design system
**Class 2, highest visual risk. Deliberately last.** Sources: M7, M8, M9.

By this point there are tests, a screenshot harness, component-testing practice, and smaller files
for MUI to touch.

- **MUI 5.18 → 9.3, one major at a time.** Not v5 → v9 in one step. It is a design system: component
  defaults, spacing scales, palette handling and the `Grid` API all changed. The Grid migration is
  smaller than the gap suggests — 72 `<Grid item>` usages across **6 files**
- Resolve the current `@mui/x-date-pickers` v8 against `@mui/material` v5 pairing before treating
  today's state as a stable baseline
- **React 18 → 19, after MUI.** The app's own code is ready — no `defaultProps`, no legacy lifecycle,
  no string refs. The blocker is MUI v5 predating React 19
- Then `react-router` 7, `zod` 4 (**pin validation messages**), `@hookform/resolvers` 5,
  `react-leaflet` 5, `pdfjs-dist` 6, `x-date-pickers` 9 — one per PR

*Verified by:* screenshot diff per screen per major; a divergence note for every Class 2 drift that
survives theme pinning.

---

## Sequencing against the cloud move

| Before the move | Around the move | After it is stable |
|---|---|---|
| S0 baseline | S4 runtime currency (.NET deadline) | S6 backend structure |
| S1 zero-risk wins | S5 error contract | S7 tooling |
| S2 decisions | | S8 structure |
| S3 tests | | S9 design system |

Three cloud blockers gate real users independently of this programme: email does not send,
production CORS will reject the phone apps, and server logs do not survive a restart. Those come
first.

S8 and S9 wait because restructuring the largest screens or the design system while diagnosing a
cloud problem makes any fault impossible to attribute — was it the move, or the refactor?

---

## How we will know if something breaks

| Layer | Catches |
|---|---|
| 7 CI checks per PR | typecheck, backend build, unit tests, lint, docs/hygiene, 4 Playwright suites |
| `check:bundle-budget` | `AssetInstallationPage` over 95 KB gzip, `Dashboard` over 40 KB |
| `test:e2e:web-perf` | login and asset-content timings against a strict budget |
| `offline-open-perf.spec.ts` | offline open exceeding its ≤ 1 s contract |
| **S0 screenshot harness** *(new)* | layout drift — nothing covers this today |
| **S0 perf baseline** *(new)* | slower-but-still-under-budget regressions |
| Pre-push hook | the same gates before code leaves the machine |
| **In-app fault reporting** | anything that reaches a user arrives with diagnostics attached, not as "it broke" |

The last row matters more than it looks. The fault reporting built in PR #188 means a regression that
escapes every gate still arrives as a reference code with breadcrumbs, platform, app version and a
support bundle — rather than a phone call.

### Holes that remain

- **No automated native coverage.** Playwright runs Chromium. Capacitor, biometrics, IndexedDB
  fallback and the sync queue on a real device stay manual. Hence the mandatory phone pass on S4, S8
  and S9
- **No offline e2e** beyond the open-perf contract. The queue, conflict resolution and temp-ID remap
  are covered by unit tests from S3, not end to end

### Rollback

Every stage is a sequence of small PRs on `main`, each independently revertible. No long-lived
refactor branch. No stage leaves the app half-migrated across a release boundary. If a regression is
found after merge, the fix is `git revert` of one PR — which is only true if the "one extraction, one
hook fix, one package major per PR" rule is respected.

---

## Definition of done

A developer inheriting the repo would say:

- The README got me running in under ten minutes
- No single file made me afraid to change it
- The tests told me when I broke something
- The architecture doc described the code I actually found
- Nothing I opened turned out to be dead
- Lint and tests both block a bad PR, so I trusted green CI
- When an API call failed, one error shape told me why
- Where errors were swallowed, the code said whether that was intentional
- Nothing was running on an unsupported runtime

And a user would say: nothing changed.

### Measurable signals

| Signal | Check |
|---|---|
| No lint errors, lint blocking | `npm run lint` exits 0 and runs in CI |
| No unreferenced modules | dead-code sweep returns nothing |
| No file over ~1,500 lines | `find src -name "*.ts*" -exec wc -l {} + \| awk '$1>1500'` |
| Components are tested | `find src/components -name "*.test.ts*"` non-empty |
| No production advisories above moderate | `npm audit --omit=dev` |
| Supported runtime | `TargetFramework` is `net10.0` |
| One error contract | one global exception handler; one shape in new endpoints |
| Visual parity | screenshot harness diff is empty, or every diff has a signed divergence note |

---

## Divergence register

Accepted user-visible changes, recorded so they are not later mistaken for bugs. Empty until the
programme starts.

| Date | Stage | Change | Class | What was lost | Compensation | Approved by |
|---|---|---|---|---|---|---|
| 2026-08-17 | S2 | Workflow-builder “From features” input picker stays **off** | — | Old bulk-add-input UI (superseded by step-type auto-populate) | None — replacement already shipped | S2 register |
