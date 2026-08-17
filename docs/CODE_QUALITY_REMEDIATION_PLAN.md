# Code quality remediation plan

Companion to [`CODE_QUALITY_ASSESSMENT.md`](./CODE_QUALITY_ASSESSMENT.md) (snapshot of `main` @
`bac9d7b`). That document says what is wrong; this one says how to fix it without breaking a
working, in-use product. Concrete defects and dead code are itemised separately in
[`CODE_QUALITY_BUG_SWEEP.md`](./CODE_QUALITY_BUG_SWEEP.md).

**Two targets, chosen deliberately.**

| Track | Phases | Target |
|---|---|---|
| **Baseline** | 1–5 | No competent developer inheriting this repo calls any part of it below average |
| **Excellence** | 6–8 | A developer would call it well engineered, not merely acceptable |

Phases 1–5 were scoped on the judgement that chasing excellence on every axis is not worth it for a
product this size. That judgement holds for *some* axes — backend controller structure, schema
consolidation — and those stay out of scope permanently. But three areas are worth pushing past
average, and they are separated out as phases 6–8 so the decision to stop after phase 5 stays
available.

**Status:** not started. Deliberately deferred until device testing and the cloud move are done —
see [Sequencing](#sequencing-against-the-cloud-move).

---

## The rule that makes this safe

Every instinct says split the 7,752-line file first. That is what breaks applications.

There is no automated coverage on that page today, so a refactor of it **cannot be verified** — you
would be trading a known-ugly working app for an unknown-broken one.

The safe order is inverted:

> **Characterise, then extract.** Write tests that pin the *current* behaviour, including its
> quirks. Then move one section out from behind those tests. Ship it. Repeat.

Every step is independently releasable and revertible. Nothing sits half-refactored on `main`.

## What is already working in our favour

The safety net is largely built, which makes this far more tractable than the file sizes suggest:

- **7 CI checks** on every PR (`frontend`, `backend`, `standards`, and four Playwright jobs)
- **Pre-push hook** running typecheck, backend build, docs and hygiene gates locally
- **TypeScript strict** — catches a large class of extraction mistakes at compile time
- **Migration integrity + Postgres schema parity tests** guarding the database layer
- **In-app fault reporting** (PR #188) — if something does slip through, it arrives with
  diagnostics attached instead of as "it broke"
- **Two internal exemplars** — `src/modules/bom-project/` and `src/features/timeAnalytics/`. Copy
  these; do not invent a third pattern.

---

## Phases

### Baseline track (phases 1–5)

### Phase 1 — Presentation and hygiene
**Risk: none.** No running code is touched.

- A README that actually starts the app: prerequisites, `npm install`, `npm run dev`, starting the
  backend on port 4000, seeded login, and where to go next
- Add `CONTRIBUTING.md`, `LICENSE`, `.nvmrc`, `.editorconfig`, and an `engines` field
- Delete the **17** confirmed orphaned files (~1,988 lines), the 2 root `.patch` files, and the
  tracked `.bak`. Six of the 17 are inside `src/modules/bom-project/` — see the
  [bug sweep](./CODE_QUALITY_BUG_SWEEP.md#4-dead-code-is-roughly-triple-what-the-assessment-reported).
  Verify each individually: `ConnectivityDebugBar.tsx` survives a naive grep because its only
  external mention is inside a comment
- Fix the stale opening paragraph in `.claude/skills/enterprise-dev-practices/SKILL.md`
  (still claims no CI, no tests, no linter)

*Why first:* biggest single change to a newcomer's first impression, for the least effort and no risk.

### Phase 2 — Correctness and honesty
**Risk: low.** Small, isolated, individually verifiable changes.

- **Decide the fate of the disabled product-features picker** in `WorkflowBuilder.tsx:2334`, which is
  unreachable behind a hardcoded `{false && …}`. Either a feature was retired and left in place, or a
  debugging change shipped and users have been missing functionality. This needs a product answer
  before a code change, and it is the one finding in the sweep that may be user-visible
- Fix the remaining **9 lint errors**, then make `npm run lint` a blocking CI gate. The fixes are
  trivial (`prefer-const`, two useless regex escapes, one unused expression); the gate is the point
- ~~Route `projectService.ts`, `projectAssetService.ts` and `assetWorkflowAssignmentService.ts`
  through `api.ts`~~ — **withdrawn.** The assessment reported these as bypassing token refresh and
  offline handling. They do not. All six files that import axios use it only for the
  `axios.isAxiosError()` type guard; there is not one raw HTTP call outside `api.ts` anywhere in
  `src/`. See the
  [bug sweep](./CODE_QUALITY_BUG_SWEEP.md#5-the-axios-layering-violations-do-not-exist). **Do not
  "fix" these files** — changing how three working services issue requests would put the native
  cache and offline queue at risk to solve nothing
- Correct the architecture doc on the *surviving* layering point: ~16 feature files import `api`
  directly instead of going through a domain service, and `RecoveryCenter.tsx` inlines ~15
  endpoints. Consistency, not correctness — apply the convention to new and touched code
- De-duplicate `resolveConfigWorkflowTypeId`, defined identically in both `Dashboard.tsx` and
  `AssetInstallationPage.tsx`. No live bug today — the two copies match — but workflow-type
  resolution decides which workflow applies to an asset, and nothing stops one copy being fixed alone
- Correct the architecture docs so the described layering matches reality — either adopt
  `repositories/` properly or document it honestly as a caching pattern for hot lists
- Settle naming conventions and apply them to new code (do not mass-rename existing files; that
  destroys `git blame` for no user-visible gain)

### Phase 3 — The foundation
**Risk: low.** Adds no behaviour change at all. This is what makes Phase 4 possible.

Test the logic that actually matters, in rough priority order:

1. **Workflow completion**, including the blocking-issue rule that returns HTTP 422
2. **The permission model** (`usePermissions.ts`) — the two-tier role → capability mapping
3. **The offline queue's temp-ID → server-ID remap** — the highest-consequence logic in the app
4. **Backend controller tests** for the workflow endpoints

Then characterisation tests for the two god files, immediately before splitting them.

### Phase 4 — Split the god files
**Risk: medium.** Mitigated entirely by doing it incrementally.

`AssetInstallationPage.tsx` (7,752) and `Dashboard.tsx` (6,921), **one extraction per PR**, each
green through CI before the next begins. Do not attempt a single big-bang split.

Extraction was already started by whoever wrote `CaptureTablePage.tsx` and
`OperationsVirtualizedTableBody.tsx` — continue that direction rather than starting a new scheme.

Suggested order for the installation page: column configuration, then CSV import, then the workflow
assignment panel, then the table body, leaving orchestration in the page.

### Phase 5 — Backend structure
**Risk: low-to-medium.** Lower urgency: fat controllers are annoying rather than dangerous.

- Move workflow logic out of `AssetWorkflowRunsController.cs` (2,650 lines) into services
- Add global exception handling and a single error response shape
- Split `Entities.cs` (1,559) and `Dtos.cs` (1,826) by domain
- Address the security findings: scope `IssuesController.GetAll` and `SyncChangesController` to the
  caller, and decide whether `ServeMedia` and `OfficesController.GetAll` should stay
  `[AllowAnonymous]`. Record the verdict for all 20 anonymous endpoints in one place so the next
  reviewer does not have to rediscover the reasoning — `SseController`'s exemption, for example, is
  correct and already documented in the file

---

### Excellence track (phases 6–8)

Everything above lands the repo at "no part is below average". These three phases are what separate
that from "well engineered". Each is independently worth doing and independently skippable.

### Phase 6 — Correctness sweep
**Risk: low individually, medium in aggregate.** Every item is small; the volume is what needs care.

Driven directly by [`CODE_QUALITY_BUG_SWEEP.md`](./CODE_QUALITY_BUG_SWEEP.md).

- Work through the **44 `react-hooks/exhaustive-deps` warnings**, 13 of which are in the two god
  files. **One per PR in those two files.** Adding a missing dependency to a `useEffect` inside a
  7,752-line component can trigger the exact re-render loop the original author was working around,
  and the in-file comments show that has already happened once. Do these behind the Phase 3
  characterisation tests, ideally as part of the Phase 4 extractions
- Establish a convention for deliberate error swallowing. There are 75 empty `catch {}` blocks and 97
  whose body is only a comment. The rationale is sound — a failed cache read should not surface to a
  field worker — but nothing distinguishes "safe to ignore" from "we hope this never happens". A
  narrow helper or a marker comment, applied to new and touched code, is enough
- Burn down the `no-console` warnings in the paths that ship to production, leaving them only where a
  diagnostic is intentional

### Phase 7 — Finish what phase 4 starts
**Risk: medium.** Same technique as phase 4, applied to the next tier.

Phase 4 splits the two worst files. **23 files exceed 1,000 lines**, and the next four are large
enough to have the same "cannot reason about the blast radius" problem:

| File | Lines |
|---|---:|
| `src/features/admin/UserManagement.tsx` | 4,768 |
| `src/features/settings/Settings.tsx` | 4,376 |
| `src/features/workInstructions/WorkOrderRunner.tsx` | 3,829 |
| `src/features/workInstructions/WorkflowBuilder.tsx` | 3,595 |

Same rule: characterise, then extract, one extraction per PR. `WorkOrderRunner.tsx` should come
first — it is the screen a field worker spends the most time in, so it carries the highest cost when
it breaks and the highest value when it is safe to change.

Also in scope: establish component testing as a practice. `src/components` currently has **60 source
files and zero test files**. The target is not a coverage percentage; it is that the next person to
add a shared component has an obvious example to copy.

### Phase 8 — A real error contract
**Risk: low.** Additive, and independently shippable.

The backend has 296 endpoints, three error body shapes (`{ message }` × 88, `{ error }` × 31,
`{ status }` × 1), zero global exception handlers, and zero uses of `ModelState.IsValid`.

- Add a global exception handler and one error response shape. Keep the old shapes readable by
  clients during a transition rather than switching in a single release
- Adopt request validation where request bodies are non-trivial. Not everywhere — start with the
  workflow and asset endpoints, where a malformed payload currently reaches EF Core
- Give the frontend a single place that understands the error contract, so a new screen gets correct
  error handling by default instead of inventing its own

This is the phase most worth doing **before** the cloud move rather than after, despite its number:
once real users are on a hosted deployment, a consistent error shape is the difference between a
diagnosable fault report and a screenshot of a blank dialog.

---

## Deliberately out of scope

Knowing what *not* to do is part of the plan.

| Not doing | Why |
|---|---|
| Forcing full `repositories/` adoption | Used by 3 screens and works there. Rewriting 80 files to match a diagram is cost without benefit — fix the diagram instead |
| Restructuring the sync engine | Best-engineered part of the app and the highest-consequence thing to break: a bug there loses a field worker's actual work. **Test it, do not restructure it** |
| Consolidating the 23 `Ensure*` schema patches | Ugly but load-bearing legacy repair, already guarded by the migration test. Rewriting risks breaking existing installations for no user-visible gain |
| Mass-renaming files for consistency | Destroys `git blame` history. Apply conventions to new and touched code instead |
| Burning down all 244 lint warnings | Lint is a deliberate backlog gate. Fix the 10 errors, then make it blocking. Do not spend a week on warnings |
| Splitting the remaining 17 files over 1,000 lines | Phases 4 and 7 cover the six that genuinely hurt. Below roughly 1,500 lines a single-purpose screen is navigable, and the churn costs more than it returns |
| Chasing a coverage percentage | A number invites tests written to move the number. Phases 3, 6 and 7 name the logic worth protecting instead |
| Rewriting the backend into a layered architecture | Phase 5 and 8 make controllers survivable and errors predictable. Full CQRS-style restructuring of 54 controllers is not proportionate to the problem |

---

## Not breaking what works

The app is in daily use and behaving correctly on web, phone-online and phone-offline. **Every phase
here is a refactor, not a feature.** The success condition is that a user notices nothing at all.

Stated as a rule for anyone working the plan:

> Any user-visible change in behaviour, layout or speed produced by this programme is a **defect**,
> not an improvement — including changes someone thinks are better. Ship those separately, as
> product work, so they can be judged on their own.

### What already enforces this

The safety net is better than the file sizes suggest, and most of it predates this plan:

| Guardrail | What it catches |
|---|---|
| 7 CI checks per PR | typecheck, backend build, unit tests, lint, docs/hygiene, 4 Playwright suites |
| `check:bundle-budget` | route chunks exceeding gzip ceilings (`AssetInstallationPage` 95 KB, `Dashboard` 40 KB) |
| `test:e2e:web-perf` | login and asset-content timings against a strict budget in CI |
| `offline-open-perf.spec.ts` | offline open staying within its ≤1 s contract |
| `test:e2e:full` + `smoke` | login, navigation, work-instructions builder paths |
| Pre-push hook | typecheck, backend build, docs and hygiene gates before anything leaves the machine |
| TypeScript strict | a large share of extraction mistakes, at compile time |

The two budget gates matter most here: a split that accidentally pulls a heavy dependency into a
route chunk, or a hook change that adds a network round trip to first paint, **fails CI rather than
reaching a user**.

### Where the net has holes

Honest about what will not be caught automatically:

- **No component tests.** `src/components` has 60 source files and 0 tests. Phase 3 characterisation
  tests close this only for the two god files
- **No automated native coverage.** Playwright runs Chromium. Nothing exercises Capacitor, the
  biometric lock, IndexedDB fallback, or the sync queue on a real device. Phone verification stays
  manual
- **No offline e2e beyond the open-perf contract.** The queue, conflict resolution and temp-ID remap
  have no end-to-end test
- **Perf budgets are ceilings, not baselines.** A change that makes the dashboard 30% slower while
  staying under budget passes

That gap list is exactly why Phase 3 comes before Phase 4, and why the phases below are ordered by
how much of them the net can see.

### Risk to user experience, by phase

| Phase | UX risk | Speed effect | Notes |
|---|---|---|---|
| 1 Hygiene | **None** | **None** | Deleting unreferenced files changes no bundle — Vite already tree-shakes them. Expect better readability, not a faster app |
| 2 Correctness | **Very low** | None | Now that the axios item is withdrawn, what remains is lint fixes and a de-duplicated helper. The one open question is the disabled feature, which is a product decision |
| 3 Tests | **None** | **None** | Adds no runtime code |
| 8 Error contract | **Low, if staged** | None | Error *bodies* change. Frontend and backend must move together, old shapes kept readable during transition, or users see raw error text |
| 4 / 7 Splits | **Medium** | Could go either way | New component boundaries change render scope. Usually neutral-to-faster; a badly drawn boundary can add re-renders. Bundle budgets catch the chunk-size half, not the render half |
| 6 Hook deps | **Highest** | Could regress | Changing a dependency array changes *when effects fire*. A wrong fix can add network calls, refetch loops, or the re-render loops the original author worked around |

### Working rules that follow from that table

1. **One extraction or one hook fix per PR.** Never batch. A behaviour regression must be
   attributable to a single change and revertible on its own
2. **Characterise before you touch.** Pin current behaviour in a test — including quirks that look
   like bugs — then change the code. A quirk someone relies on is a feature
3. **Manual phone pass before merging anything in phases 4, 6 and 7.** Automation does not cover
   native. The device prompts in `AGENT_RETEST_INDEX.md` exist for this
4. **Treat a perf budget pass as necessary, not sufficient.** For the god-file work, record the
   `web-perf` numbers before and after and compare them, rather than only checking the gate is green
5. **If a phase cannot be verified, stop and add the test first.** That is the whole premise of the
   ordering

### What a user should notice afterwards

Nothing — with three intended exceptions:

- **Fewer spurious re-renders** on the dashboard and installation page once the hook-dependency work
  is done, which may show as less flicker rather than as raw speed
- **Clearer error messages** after Phase 8, because a single contract lets the frontend say what went
  wrong instead of falling back to generic text
- **Faster route transitions** *if* Phase 4 and 7 splits let Vite chunk the big screens more finely.
  This is a possible benefit, not a promise, and it is not a reason to do the work

Everything else — same screens, same flows, same offline behaviour, same speed.

---

## Sequencing against the cloud move

**Hold Phase 4 until after the cloud move is stable.**

Three cloud blockers gate real users: email does not send, production CORS will reject the phone
apps, and server logs do not survive a restart. Restructuring the two largest screens at the same
time would make any cloud problem far harder to diagnose, because a fault could not be attributed
to either the move or the refactor.

| Phase | When |
|---|---|
| 1, 2 | Safe any time, including during device testing |
| 3 | Good to do **before** the cloud move — those tests protect the workflow logic first real users will exercise |
| 8 | Also **before** the move, despite its number — a single error contract is what makes a hosted fault diagnosable |
| 4, 5 | After the cloud deployment is stable |
| 6 | Alongside 4, since the hook-dependency fixes belong inside those extractions |
| 7 | After 4 has proven the extraction technique on the two worst files |

The numbering is priority order within each track, not execution order. Phase 8 is numbered last
because it is the least urgent for a developer reading the code, and scheduled early because it is
the most urgent for anyone diagnosing production.

---

## Definition of done

### Baseline (phases 1–5)

A developer inheriting the repo would say:

- The README got me running in under ten minutes
- No single file made me afraid to change it
- The tests told me when I broke something
- The architecture doc described the code I actually found
- Nothing I opened turned out to be dead

The accepted remaining weakness afterwards is backend controller structure, which is a fair trade
against the effort of Phase 5.

### Excellence (phases 6–8)

The same developer would additionally say:

- Lint and tests both block a bad PR, so I trusted green CI
- The largest screen I opened was navigable in one sitting
- When an API call failed, one error shape told me why
- Where errors were swallowed, the code said whether that was intentional
- I could tell which endpoints are public on purpose

Measurable signals, for anyone auditing later:

| Signal | Command |
|---|---|
| No lint errors, lint is blocking | `npm run lint` exits 0 and runs in CI |
| No unreferenced modules | the dead-code sweep in the bug sweep appendix returns nothing |
| One HTTP path | `grep -rln 'from "axios"' src/` returns only `api.ts` and the type-only injection |
| No file over ~1,500 lines | `find src -name "*.ts*" -exec wc -l {} + \| awk '$1>1500'` |
| Components are tested | `find src/components -name "*.test.ts*"` is non-empty |
| One error contract | one global exception handler; a single error shape in new endpoints |
