# Code quality remediation plan

Companion to [`CODE_QUALITY_ASSESSMENT.md`](./CODE_QUALITY_ASSESSMENT.md) (snapshot of `main` @
`bac9d7b`). That document says what is wrong; this one says how to fix it without breaking a
working, in-use product.

**Goal.** Not perfection. The target is that **no competent developer inheriting this repo would
call any part of it below average.** Phases 1–4 achieve that. Chasing "excellent" on every axis is
not worth it for a product this size.

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

### Phase 1 — Presentation and hygiene
**Risk: none.** No running code is touched.

- A README that actually starts the app: prerequisites, `npm install`, `npm run dev`, starting the
  backend on port 4000, seeded login, and where to go next
- Add `CONTRIBUTING.md`, `LICENSE`, `.nvmrc`, `.editorconfig`, and an `engines` field
- Delete the 7 confirmed orphaned files, the 2 root `.patch` files, and the tracked `.bak`
- Fix the stale opening paragraph in `.claude/skills/enterprise-dev-practices/SKILL.md`
  (still claims no CI, no tests, no linter)

*Why first:* biggest single change to a newcomer's first impression, for the least effort and no risk.

### Phase 2 — Correctness and honesty
**Risk: low.** Small, isolated, individually verifiable changes.

- Route `projectService.ts`, `projectAssetService.ts` and `assetWorkflowAssignmentService.ts`
  through `api.ts`. **This is a real bug fix, not cosmetics** — those three currently bypass token
  refresh and offline handling
- De-duplicate helpers that exist in two copies: `resolveConfigWorkflowTypeId` and the
  inspection-type checks (in both `Dashboard.tsx` and `AssetInstallationPage.tsx`)
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
  caller, and decide whether `ServeMedia` should stay `[AllowAnonymous]`

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
| 4, 5 | After the cloud deployment is stable |

---

## Definition of done

The programme is complete when a developer inheriting the repo would say:

- The README got me running in under ten minutes
- No single file made me afraid to change it
- The tests told me when I broke something
- The architecture doc described the code I actually found
- Nothing I opened turned out to be dead

The accepted remaining weakness afterwards is backend controller structure, which is a fair trade
against the effort of Phase 5.
