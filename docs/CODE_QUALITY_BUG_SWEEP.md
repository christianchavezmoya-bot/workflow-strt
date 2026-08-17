# Code quality bug sweep — August 2026

**Snapshot of `main` @ `bac9d7b`.** A companion to
[`CODE_QUALITY_ASSESSMENT.md`](./CODE_QUALITY_ASSESSMENT.md), which judged *structure*. This document
is the result of pointing tooling at the tree and asking a narrower question: **what is actually
broken, unreachable, or duplicated right now?**

Everything below was reproduced against the working tree. Nothing here is inferred from a pattern or
assumed from a file name. Commands are in the [appendix](#appendix--reproducing-the-findings).

The findings feed phases 6 and 7 of the
[remediation plan](./CODE_QUALITY_REMEDIATION_PLAN.md#phase-6--correctness-sweep).

---

## Summary

| Category | Count | Notes |
|---|---:|---|
| Lint errors (blocking-grade) | **10** | Includes one permanently disabled feature |
| Lint warnings | 244 | Deliberate backlog, mostly `no-console` and unused vars |
| `react-hooks/exhaustive-deps` warnings | **44** | Concentrated in the two god files |
| Unreferenced files | **17** (~1,988 lines) | Assessment found 7; a wider sweep found 10 more |
| Layering violations (direct axios) | **0** | Assessment reported 5; all are `isAxiosError` type guards |
| Duplicated helper definitions | 1 pair | Identical today, divergence risk |
| Backend error response shapes | **3** | `message` (88), `error` (31), `status` (1) |
| Backend global exception handlers | **0** | |
| Backend `ModelState.IsValid` uses | **0** | Across 296 endpoints |

---

## 1. A feature is silently switched off in production

`src/features/workInstructions/WorkflowBuilder.tsx:2334`

```tsx
{false && productFeatures.length > 0 && (
```

The product-features picker in the workflow step editor is unreachable. Roughly 50 lines of JSX
below it — checkbox list, per-feature selection state, the `usedFeatureIds` guard — can never
render. The surrounding state (`selectedFeatIds`, `setSelectedFeatIds`) is still initialised and
reset on every add.

This is the single most interesting finding in the sweep, because it has two very different
explanations and **we do not currently know which is true**:

- a feature was deliberately disabled during a release and never cleaned up, in which case this is
  dead code to delete, or
- a feature was disabled to debug something and the `false` was never removed, in which case
  **users have been missing functionality**

This needs a product decision before any code change. It is the only finding in this document that
might be a user-visible bug rather than a maintenance problem.

## 2. The remaining nine lint errors

ESLint is configured with a deliberate ratchet: warnings are a backlog, but a small set of
genuinely bug-catching rules are errors. Ten fire today.

| File | Rule | Count |
|---|---|---:|
| `WorkflowBuilder.tsx:2334` | `no-constant-binary-expression` | 2 |
| `WorkOrderRunner.tsx` (779, 835, 909) | `prefer-const` | 3 |
| `GlobalOfficeMap.tsx` (40, 287) | `prefer-const` | 2 |
| `AssetDocumentsDialog.tsx:288` | `no-useless-escape` | 1 |
| `generateBomReport.ts:97` | `no-useless-escape` | 1 |
| `OfflineReadinessPanel.tsx:164` | `no-unused-expressions` | 1 |

Only the first is a behavioural finding. The rest are trivial, and that is the point — fixing nine
trivial things is what lets `lint` become a blocking CI gate, which is worth far more than the fixes
themselves.

The two `no-useless-escape` hits are in regular expressions. Both are harmless as written (`\-`
inside a character class), but an unnecessary escape in a regex is exactly the kind of thing that
becomes a real bug the next time someone edits it.

## 3. Hook dependency warnings cluster where the crashes already were

44 `react-hooks/exhaustive-deps` warnings, distributed like this:

| File | Warnings |
|---|---:|
| `AssetInstallationPage.tsx` | 8 |
| `Dashboard.tsx` | 5 |
| `PhotoUploadDialog.tsx` | 3 |
| `UserManagement.tsx` | 3 |
| 15 other files | 1–2 each |

The concentration matters more than the total. The assessment noted that the two god files contain
comments referring to past infinite re-render loops and pages hanging on spinners. Stale-closure and
missing-dependency bugs are the standard cause of exactly that symptom, and 13 of the 44 warnings
are in those two files.

These should **not** be bulk-fixed. Adding a missing dependency to a `useEffect` in a 7,752-line
component can trigger the very re-render loop the original author was working around. They should be
fixed one at a time, behind the characterisation tests from Phase 3, as part of the Phase 4 split.

## 4. Dead code is roughly triple what the assessment reported

The assessment named 7 unreferenced files. A sweep across every non-test module in `src/` found
**17 files totalling ~1,988 lines** with zero inbound imports.

Already known (7 files, 880 lines):

```
src/features/sites/SitesManagement.tsx          498
src/features/customers/CustomersPortal.tsx      175  (+ .css)
src/hooks/useOfflineGuard.tsx                    85
src/components/ui/TakeOverDialog.tsx             37
src/services/customFieldService.ts               32
src/services/issueService.ts                     28
src/components/ui/SummaryCard.tsx                25
```

Newly found (10 files, ~1,108 lines):

```
src/modules/bom-project/components/RulesEditor.tsx           389
src/modules/bom-project/components/GeneratedOutputPanel.tsx  230
src/modules/bom-project/components/SchemaRulesPanel.tsx      141
src/modules/bom-project/components/SourceBomGrid.tsx         132
src/modules/bom-project/components/CommitSummary.tsx          71
src/modules/bom-project/components/ComparisonFilters.tsx      71
src/modules/bom-project/utils/quantityHelpers.ts              23
src/modules/bom-project/services/bomId.ts                      5
src/utils/workflowConfigParser.ts                             24
src/utils/webSessionCache.ts                                  22
src/types/inspectionImport.ts                          (types only)
src/components/layout/ConnectivityDebugBar.tsx    (referenced only in a comment)
```

**Six of the ten are inside `src/modules/bom-project/`**, which the assessment praised as one of two
internal exemplars. That verdict still stands for its structure — public barrel, feature flag,
enforced import boundary — but the module carries over 1,000 lines of components nothing imports.
The exemplar needs a clean-out before anyone is told to copy it.

`ConnectivityDebugBar.tsx` deserves a separate note: its only occurrence outside its own file is a
mention in a comment in `connectivityMonitor.ts`. Grep-based dead-code detection would keep marking
it as live. It is not.

Also still at the repo root:

```
0001-fix-offline-update-status-features-actions-after-off.patch
0003-fix-offline-refresh-display-on-signature-sync-and-ru.patch
```

## 5. The axios "layering violations" do not exist

**This corrects the assessment, and it is the most important correction in this document.**

`CODE_QUALITY_ASSESSMENT.md` reports that three services "import axios directly, bypassing token
refresh and offline handling", and that two UI components break the no-direct-axios rule. The
remediation plan turned that into a Phase 2 item labelled *"a real bug fix, not cosmetics"*.

It is not a bug fix. **There is nothing to fix.**

Six files import `axios` outside `api.ts`. Every one of them uses it for exactly one thing:

```ts
if (axios.isAxiosError(error)) { … }
```

`isAxiosError` is a type guard. It issues no request. Counting actual HTTP calls:

| File | `api.*` calls | raw `axios.*` calls |
|---|---:|---:|
| `projectService.ts` | 10 | **0** |
| `projectAssetService.ts` | 24 | **0** |
| `assetWorkflowAssignmentService.ts` | 4 | **0** |
| `ResetPassword.tsx` | — | **0** |
| `MobileDocumentPreviewDialog.tsx` | — | **0** |
| `useTimeAnalyticsData.ts` | injected instance | **0** (type-only import) |

Across the entire `src/` tree there is **not one** `axios.get` / `.post` / `.put` / `.patch` /
`.delete` / `.request` / `.create` outside `api.ts`:

```bash
grep -rnE '\baxios\.(get|post|put|patch|delete|request|create)\(' src/ | grep -v 'src/services/api.ts'
# → no matches
```

So the rule the architecture doc states — *all HTTP goes through `api.ts`* — is **fully upheld**.
Token refresh, the stale-while-revalidate GET cache, the IndexedDB fallback and the 401 redirect all
apply to every request in the app.

Why this matters more than the finding it replaces: acting on the original wording would have meant
rewriting error handling in three working services that participate correctly in the offline-first
path, to fix a problem that does not exist. On native, changing how those calls are made risks the
cache and queue behaviour field users depend on. **This is a concrete example of why a finding
should be reproduced before it is scheduled.**

The genuine layering observation that survives is milder and unchanged: roughly 16 feature files
import `api` directly rather than going through a domain service, and `RecoveryCenter.tsx` inlines
about 15 endpoints. That is a consistency issue, not a correctness one.

## 6. A duplicated helper that has not diverged yet

`resolveConfigWorkflowTypeId` is defined twice:

- `src/features/dashboard/Dashboard.tsx:404`
- `src/features/installations/AssetInstallationPage.tsx:296`

The two copies are **byte-identical today**, so there is no live bug. The finding is the structural
one: workflow-type resolution is the logic that decides which workflow applies to an asset, it lives
in two places, and nothing prevents one from being fixed while the other is not.

## 7. Error swallowing is idiomatic here but unaudited

- 75 completely empty `catch {}` blocks
- 97 `catch` blocks whose entire body is a comment

The ESLint config explicitly allows this, with a documented rationale: errors are deliberately
swallowed on the sync and cache paths, because a failed cache read should not surface to a field
worker. That reasoning is sound.

What is missing is any distinction between the two cases. A swallowed IndexedDB read and a swallowed
write failure look identical in the source. There is no convention — a marker comment, a helper, a
narrow error type — separating "safe to ignore" from "we hope this never happens".

This is a convention gap rather than a list of bugs, which is why it belongs in the plan rather than
in a fix list.

## 8. Backend error handling has no contract

| Measure | Value |
|---|---:|
| Endpoints | 296 |
| Global exception handlers | 0 |
| `ModelState.IsValid` uses | 0 |
| Distinct error body shapes | 3 |

Error shapes in use: `{ message }` (88 sites), `{ error }` (31 sites), `{ status }` (1 site), plus
bare `NotFound()` and `UnprocessableEntity(...)` with no body.

No client can write one error handler. With no global exception handler, an unhandled exception
returns a framework default that does not match any of the three shapes, and the response body
differs between Development and Production.

Backend test coverage remains 4 test files against those 296 endpoints, and all four cover
infrastructure — migrations applying, Postgres schema parity, login — rather than any business rule.

## 9. Security findings, re-checked

Re-verifying the assessment's list turned up one correction and one addition.

| Finding | Status |
|---|---|
| `IssuesController.GetAll` returns every issue to any signed-in user | **Confirmed.** No project, office, or user filter |
| `SyncChangesController.GetChanges` not scoped to caller | Confirmed |
| `WorkflowConfigsController.ServeMedia` is `[AllowAnonymous]` | Confirmed — needs a decision, not necessarily a fix |
| `SseController` is `[AllowAnonymous]` | **Not a finding.** It is exempt from the fallback policy because `EventSource` cannot send an `Authorization` header; the JWT arrives as `?token=` and is validated by hand. The reasoning is documented in the file |
| `OfficesController.GetAll` is `[AllowAnonymous]` | **New.** Returns the full office list, including country and city, to unauthenticated callers. Plausibly intentional for a pre-login office picker — needs confirming, not assuming |
| `Jwt:ExpiresMinutes: 1440` | Confirmed — 24 hours on devices that leave the office |

There are 20 `[AllowAnonymous]` endpoints in total. Most are clearly legitimate: auth, health, public
sign-off, and the QR mobile-upload flow. The point is not that 20 is too many; it is that no
document currently states which are intentional, so each re-review has to rediscover the reasoning
from scratch.

---

## What this does not cover

- **Runtime behaviour.** Everything here is static. Nothing was found by running the app
- **Backend dead code.** The unreferenced-file sweep covered `src/` only
- **Performance.** Separate concern, tracked in `WEB_PERF_*`
- **The 244 lint warnings individually.** Counted and categorised, not triaged

---

## Appendix — reproducing the findings

```bash
# Lint errors only, mapped to files
npm run lint 2>&1 | awk '/^\/workspace/{f=$0} / error /{print f" :: "$0}' | grep -v no-console

# Hook dependency warnings by file
npm run lint 2>&1 | awk '/^\/workspace/{f=$0} /exhaustive-deps/{print f}' | sort | uniq -c | sort -rn

# Unreferenced files (heuristic — verify each hit before deleting)
for f in $(find src -name "*.ts" -o -name "*.tsx" | grep -v '\.test\.'); do
  base=$(basename "$f" | sed 's/\.tsx\?$//')
  [ "$(grep -rl --include=*.ts --include=*.tsx "$base" src/ | grep -v "^$f$" | wc -l)" -eq 0 ] && echo "$f"
done

# Permanently disabled UI
grep -rn '{false &&\|if (false)\|&& false' src/ --include=*.tsx --include=*.ts

# Layering violations
grep -rln 'from "axios"' src/

# Swallowed exceptions
grep -rEc 'catch\s*(\([^)]*\))?\s*\{\s*(/\*[^*]*\*/)?\s*\}' src/ --include=*.ts --include=*.tsx

# Backend error contract
grep -rhoE '(BadRequest|NotFound|Conflict|UnprocessableEntity)\(new \{ [a-z]+' \
  server/Commtrac.Api/Controllers/*.cs | sed 's/.*new { //' | sort | uniq -c | sort -rn
grep -rn 'UseExceptionHandler\|IExceptionHandler\|ExceptionFilter' server/Commtrac.Api --include=*.cs | wc -l
grep -rhoE '\[Http(Get|Post|Put|Patch|Delete)' server/Commtrac.Api/Controllers/*.cs | wc -l

# Anonymous endpoints
grep -rn 'AllowAnonymous' server/Commtrac.Api/Controllers/*.cs
```
