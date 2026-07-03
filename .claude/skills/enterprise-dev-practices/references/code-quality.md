# Code Quality Standards

Read before writing code or reviewing a diff in this repo. This is not generic
"write clean code" advice — it's the conventions and the specific landmines that
have bitten this codebase.

## Typing (the safety net, since there are no tests yet)

- **TypeScript is strict** (`tsconfig.json`: `strict: true`, `noFallthroughCasesInSwitch`).
  With no test suite, the type-checker is the primary correctness gate. **Never
  weaken it** — no `any` to silence an error, no `// @ts-ignore` without a
  one-line justification comment. Model the type correctly instead.
- **C# has `Nullable` + `ImplicitUsings` on** (`.csproj`). Treat nullable
  warnings as errors in review; don't `!`-suppress to make them go away.
- Validation lives in **Zod** schemas (frontend) + `react-hook-form` resolvers.
  New forms validate through Zod, not ad-hoc `if` checks.

## The landmines (these are real, from `CLAUDE.md` + the code)

These look like bugs but are load-bearing. Do **not** "fix" them:

| Trap | Reality |
|---|---|
| `workflow.media` looks misnamed | The `Workflow` type field is `media`, **not** `mediaItems`. Objects built from arrays need `media: []` to satisfy the type. |
| `AssetIssue` seems to need only a message | It requires **both** `issueType` and `isBlocking`, even on legacy creation paths. |
| The JWT `"role"` claim looks wrong | Server sets `MapInboundClaims = false` and uses **short claim names**; role is the `"role"` claim, not the WS-Federation URI. Several endpoints depend on this. |
| A guard redirects an authed user to `/login` | Guards must wait for `permissionsReady`. The initial Viewer placeholder in `usePermissions.ts` causes **false-negative redirects** if you don't (see `SettingsRoute`). |
| `completeRun` returns 422 | That's **by design** when unresolved blocking issues exist — handle it, don't treat it as a server bug. |
| A 401 hard-redirects to `/login` | Intentional (except auth/brand-settings calls) — it wipes the token. Don't add retry loops around it. |

## Permissions: the two-tier model

Authorization is `usePermissions.ts`: **Tier 1** capability flags → **Tier 2**
per-domain view/edit/delete scopes, with hardcoded fallbacks. When adding a
gated action:
1. Check the Tier-2 scope for the domain, not a raw role string.
2. Gate rendering *and* the route.
3. Wait for `permissionsReady` before any redirect decision.

## Naming & structure conventions (match what's there)

- Services: `<domain>Service.ts`, one per domain. Types: `src/types/<domain>.ts`.
- Features: `src/features/<domain>/` with `PascalCase.tsx` page components.
- Keep files single-purpose. The backend monoliths (`Entities.cs` ~1400,
  `Dtos.cs` ~1500) are the anti-pattern — **when you touch a domain in them,
  extract that domain to its own file** rather than appending.
- Match the surrounding file's comment density and idiom. This codebase is
  light on comments and relies on types + names; don't over-annotate.

## Secrets & config hygiene

- API base comes from `VITE_API_BASE`; localhost web dev defaults to
  `http://localhost:4000/api` regardless. **Keep committed env files generic** —
  device/LAN IPs go in untracked `.env.production.local`, never committed.
- No credentials, tokens, DB files, or logs in git. The `hygiene` gate in
  `check-gates.mjs` enforces this; it currently flags 8 tracked `.db` backups —
  clean those up.
- On native, tokens/user live in **secure storage** (Keychain/Keystore), not
  localStorage. Don't move them to plain storage "for convenience".

## Linting & formatting (now configured)

ESLint (flat config, `eslint.config.js`) and Prettier (`.prettierrc.json`) are
now set up. Scripts: `npm run lint`, `npm run format`, `npm run format:check`.

- The linter is a **non-blocking backlog gate** today: the first run surfaced
  **13 error-level + 213 warning-level** findings. CI runs lint `continue-on-error`
  and `check-gates.mjs` reports it as INFO. **Do not add new lint errors**; burn
  the existing 13 down (`prefer-const`, `no-case-declarations`,
  `no-constant-binary-expression` — this one can flag real bugs, look at each —
  `no-useless-escape`), then flip lint to blocking.
- Empty `catch {}` is allowed (idiomatic on the offline sync/cache paths).
- `no-console` warns (allows `console.warn`/`console.error`).
- Prettier is available but source hasn't been mass-reformatted (would be a huge
  diff) — format files as you touch them (`npm run format` on your changed set).

## PR / self-review checklist

Before you call a change done, confirm:

- [ ] `node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs` — typecheck + backend green.
- [ ] No new `any` / `@ts-ignore` / `!` null-suppression added to pass the check.
- [ ] Network access goes through `api.ts` (no new raw `axios` import in a component/service).
- [ ] Request/response changes considered for **both** web and native paths.
- [ ] New offline-capable entity? temp-ID remap extended (`replaceEntityReferences`).
- [ ] Schema change is an EF migration, not a `DbInitializer` `Ensure*` hack.
- [ ] New endpoint follows the flat `?projectId=` route convention.
- [ ] Permission-gated action checks the Tier-2 scope and waits for `permissionsReady`.
- [ ] No secrets/DBs/logs/generated files staged; `docs/ARCHITECTURE.md` not hand-edited.
- [ ] Touched a monolith (`Entities.cs`/`Dtos.cs`)? extracted the domain rather than growing it.
- [ ] The change is verified by actually exercising the flow (see testing.md), not just typecheck.
