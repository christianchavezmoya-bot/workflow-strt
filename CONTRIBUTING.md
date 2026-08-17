# Contributing

Start with [`README.md`](README.md) to get the app running, then [`CLAUDE.md`](CLAUDE.md) for the
parts of the architecture you would not guess from reading the code.

---

## Before you push

The pre-push hook runs these for you. Running them yourself first is faster than waiting for CI.

```bash
npm run build      # also the only typecheck
npm test
npm run lint       # blocking — a new error fails CI
cd server/Commtrac.Api && dotnet build
```

## What CI checks

Seven jobs on every pull request:

| Job | Checks |
|---|---|
| `frontend` | build, bundle size budgets, unit tests, lint |
| `backend` | `dotnet build`, `dotnet test` |
| `standards` | docs are regenerated, repo hygiene |
| `e2e`, `e2e-full` | browser smoke tests |
| `e2e-perf`, `e2e-web-perf` | performance budgets |

Lint is **blocking**. Error-level findings are at zero — keep them there. The ~244 warnings are a
deliberate backlog; do not spend a week on them, but do not add to them either.

---

## The rule that matters most right now

The app is in daily use on web and on phones, online and offline. We are part-way through a planned
improvement programme ([`docs/EXCELLENCE_PROGRAMME.md`](docs/EXCELLENCE_PROGRAMME.md)) whose
governing rule is:

> Any user-visible change in behaviour, layout or speed is a **defect**, not an improvement —
> including changes someone believes are better.

If a change genuinely cannot be made invisible, stop and write a divergence note rather than deciding
alone. The procedure and the register are in that document.

To check you changed nothing visible:

```bash
npm run test:e2e:visual              # every screen against reference images
npm run perf:baseline:compare        # nothing got bigger or slower
```

---

## Pull requests

**One logical change per PR.** During the programme this is stricter still: one file extraction, one
hook-dependency fix, or one dependency major per PR. A regression has to be attributable to a single
change and revertible on its own.

Write commit messages that explain **why**, not what — the diff already says what. The existing
history is a good guide.

---

## Conventions

### Frontend

| Thing | Convention |
|---|---|
| Layering | `features/` → `services/` → `repositories/` → `store/` |
| HTTP | **Always** through `services/api.ts`. Never import axios to make a request |
| New services | Name them `<domain>Service.ts` |
| New screens | Name them `<Name>Page.tsx` |
| Cross-cutting UI state | React Context, wired up in `src/main.tsx` |
| Routes | Lazy-loaded in `src/app/routes.tsx` |

Existing files that break these are not being renamed — that would destroy `git blame` for no
user-visible gain. Apply the conventions to new and touched code.

Two internal examples worth copying rather than inventing a third pattern:
`src/modules/bom-project/` (public barrel, feature flag, enforced import boundary) and
`src/features/timeAnalytics/` (clean separation of pages, hooks, services, types).

### Backend

| Thing | Convention |
|---|---|
| Controllers | One per resource, flat routes with `projectId` as a **query param**, not nested |
| Schema | Prefer a proper EF migration. Be aware `DbInitializer` also patches schema on every boot |
| Dual provider | Everything must work on **both** SQLite and Postgres. Raw SQL needs quoted PascalCase identifiers |

### Testing

Put tests next to the code as `<name>.test.ts`. Prefer tests that pin real behaviour over tests that
raise a coverage number.

When changing something with no coverage, **write the test first**, capturing current behaviour
including its quirks. A quirk someone relies on is a feature.

---

## Gotchas that have bitten people

- `npm run build` is the **only** typecheck. There is no separate `tsc` script.
- Offline behaviour is **native-only**. The request cache, IndexedDB fallback and offline queue are
  gated on running inside Capacitor. On web, requests pass straight through — account for both paths.
- The JWT uses **short claim names** with `MapInboundClaims = false`. The role claim is `"role"`, not
  the long WS-Federation URI. Several endpoints depend on this; do not "fix" it.
- `docs/ARCHITECTURE.md` is **generated**. Edit `scripts/update-architecture-docs.mjs`.
- Permission guards must wait for `permissionsReady` before redirecting, or the initial Viewer
  placeholder causes false-negative redirects.
- On `completeRun`, unresolved blocking issues make the server return **HTTP 422**. That is intended.
- `.github/copilot-instructions.md` is **stale and describes a different, older app**. Ignore it.

---

## Found a bug?

If it blocks what you are doing, fix it. If not, add it to
[`docs/KNOWN_BUGS.md`](docs/KNOWN_BUGS.md) rather than fixing it inline — it keeps unrelated changes
out of your PR without losing the finding.
