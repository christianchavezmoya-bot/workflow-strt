# Modernisation plan — dependencies, not patterns

> **Start with [`EXCELLENCE_PROGRAMME.md`](./EXCELLENCE_PROGRAMME.md)**, which sequences this plan
> together with `CODE_QUALITY_REMEDIATION_PLAN.md` into ten stages and adds the UX divergence
> protocol. This document remains the detail for dependency work; M1–M9 map onto stages S1, S4, S7
> and S9 there.

**Snapshot of `main` @ `bac9d7b`, August 2026.** Companion to
[`CODE_QUALITY_REMEDIATION_PLAN.md`](./CODE_QUALITY_REMEDIATION_PLAN.md), which deals with structure.
This one deals with the question "what here is legacy, and how do we modernise it without the app
changing for a user?"

Same rule as the remediation plan applies throughout:

> Any user-visible change in behaviour, layout or speed produced by this work is a **defect**, not an
> improvement.

---

## The headline: the code is not legacy, the dependencies are

The instinct with a codebase this size is to expect old React patterns. Measured against the tree,
they are not there:

| Legacy pattern | Occurrences |
|---|---:|
| `defaultProps` | **0** |
| `PropTypes` | **0** |
| Legacy lifecycle (`componentWillMount`, `UNSAFE_*`) | **0** |
| `makeStyles` / `withStyles` / `createStyles` | **0** |
| `moment.js` | **0** |
| Class components | **1** |

The single class component is `src/components/FaultBoundary.tsx`, and it *has* to be one — React
still provides no hook equivalent for `getDerivedStateFromError` / `componentDidCatch`. It is correct
as written.

So there is no pattern-modernisation project here. Function components, hooks, TypeScript strict,
`dayjs`, Redux Toolkit, Vite — the app is already built the modern way. **What is out of date is the
dependency ladder underneath it**, and in two places that is now urgent for reasons that have nothing
to do with developer taste.

---

## Urgent, and not really "modernisation"

### 1. Security: 16 advisories, 1 critical, 6 high

`npm audit --omit=dev` on production dependencies:

| Severity | Package | Fix |
|---|---|---|
| **Critical** | `jspdf` ≤ 4.2.0 | **4.2.1 — a patch bump** |
| High | `axios` (installed 1.13.4) | 1.19.0 |
| High | `xmldom`, `form-data`, `nanoid`, `postcss` | transitive, `npm audit fix` |
| High | `xlsx` | **no fix available** |
| Moderate | 9 others incl. `react-router` open-redirect | mostly `npm audit fix` |

Two of these deserve individual attention.

**`axios` carries roughly twenty advisories** at the installed version, including SSRF via `NO_PROXY`
bypass, several prototype-pollution gadgets, and header injection. This is the most load-bearing
dependency in the app — the bug sweep confirmed that *every* HTTP call in `src/` goes through
`api.ts`, which means every call goes through axios. The upgrade is 1.13 → 1.19, a minor bump with no
API change, so the work is verification rather than migration.

**`xlsx` has no fix and will not get one.** SheetJS no longer publishes to npm; the registry copy is
frozen at 0.18.5 with an unpatched prototype-pollution and a ReDoS advisory. It is used in six
places:

```
src/utils/generateBomReport.ts
src/utils/exportIssuesBoard.ts
src/utils/captureTableExport.ts
src/modules/bom-project/services/bomTemplateGenerator.ts
src/modules/bom-project/services/workbookParser.ts
src/features/installations/AssetDocumentsDialog.tsx
```

Three options, and this needs a decision rather than a default — **resolved in
[`S2_PRODUCT_DECISIONS.md`](./S2_PRODUCT_DECISIONS.md) §2: accept contained risk until S9; migrate
the parse path then.**

1. **Move to the SheetJS vendor distribution.** Same library, same API, patched — but it is installed
   from the vendor CDN rather than npm, which changes the install story and CI
2. **Replace with `exceljs`.** Maintained on npm, but a different API and a real rewrite of six call
   sites, including `workbookParser.ts`
3. **Accept and contain.** Note that the risky paths are parsing *user-supplied* workbooks —
   `workbookParser.ts` and `AssetDocumentsDialog.tsx`. Generation paths are lower risk

The exposure is real but narrow: an attacker needs to get a crafted spreadsheet in front of a user
who imports it.

### 2. .NET 8 reaches end of support on 10 November 2026

This is a **dated deadline**, roughly three months out at the time of writing, and it is the one item
in this document that is not optional.

| Version | Type | End of support |
|---|---|---|
| .NET 8 (current) | LTS | **10 November 2026** |
| .NET 9 | STS | 10 November 2026 |
| .NET 10 | LTS | November 2028 |

After that date the runtime keeps working, but Microsoft ships no security patches. **.NET 9 is not a
valid target** — it expires the same day. The only sensible move is .NET 8 → .NET 10 LTS.

Scope: `TargetFramework` in `Commtrac.Api.csproj`, the EF Core 8 / Npgsql 8 packages, `Dockerfile`
(currently `sdk:8.0` and `aspnet:8.0`), and CI. Worth noting that .NET 9+ ships built-in OpenAPI
support, so `Swashbuckle.AspNetCore` may become removable — a simplification, not a requirement.

This should be scheduled **around** the cloud move rather than after it. Deploying to a hosted
environment on a runtime that stops receiving patches three months later is a poor starting position.

---

## The dependency ladder

Everything else, ordered by how far behind and how visible.

| Package | Installed | Latest | Majors behind | User-visible risk |
|---|---|---|---:|---|
| `@mui/material` + icons | 5.18 | 9.3 | **4** | **High** — design system |
| `@mui/x-date-pickers` | 8.26 | 9.11 | 1 | Medium |
| `react` / `react-dom` | 18.3 | 19.2 | 1 | Medium |
| `react-router-dom` | 6.30 | 7.18 | 1 | Medium |
| `zod` | 3.25 | 4.4 | 1 | **Medium** — validation message text |
| `@hookform/resolvers` | 3.10 | 5.9 | 2 | Medium |
| `react-leaflet` | 4.2 | 5.0 | 1 | Medium — maps |
| `pdfjs-dist` | 5.5 | 6.2 | 1 | Medium — document preview |
| `typescript` | 5.9 | 7.0 | 1 | Low — compile time only |
| `vite` | 7.3 | 8.2 | 1 | Low — budgets catch regressions |
| `eslint` | 9.39 | 10.8 | 1 | **None** — dev only |
| `@vitejs/plugin-react` | 4.7 | 6.0 | 2 | None — dev only |
| `@testing-library/jest-dom` | 6.9 | 7.0 | 1 | None — dev only |
| Capacitor 8.x, `dayjs`, `docx`, `mammoth`, `prettier`, `playwright`, `vitest`, RTK, `react-redux`, `react-hook-form` | — | — | 0 | None — patch/minor |

### MUI is the real project

Four major versions is the largest single item here, and unlike the others it is a **design system**.
Component defaults, spacing scales, palette handling and the `Grid` API all changed across v5 → v9.
Upgrading it without visual drift is the hard part, and visual drift is precisely what we said counts
as a defect.

One piece of good news: the `Grid` API migration is far smaller than the version gap suggests.
`<Grid item>` appears **72 times across only 6 files**:

```
src/features/dashboard/Dashboard.tsx
src/features/projects/ProjectForm.tsx
src/features/workInstructions/WorkflowBuilder.tsx
src/features/issues/IssuesBoard.tsx
src/components/DynamicFieldsForm.tsx
src/modules/bom-project/pages/BomCommitPage.tsx
```

Also worth resolving early: the tree currently runs `@mui/x-date-pickers` v8 against
`@mui/material` v5. Confirm that pairing is actually supported before treating the current state as a
stable baseline.

### React 19 is gated behind MUI

React 18 → 19 is one major and the app's own code is ready for it — no `defaultProps` on function
components, no legacy lifecycle, no string refs. The blocker is third-party compatibility, and the
biggest third party is MUI v5, which predates React 19.

That fixes the ordering: **MUI first, React second.** Attempting React 19 on MUI v5 means fighting
peer-dependency warnings and undefined behaviour in a UI library that renders every screen.

### zod 4 can change what users read

Worth calling out because it is easy to classify as internal. `zod` produces the validation messages
shown in forms. Version 4 changed default message text and error shapes. Unless messages are pinned
or explicitly overridden, **a user could see different wording on a form error** — which is a
user-visible change, and therefore a defect by the rule at the top of this document.

---

## Order of work

Grouped so that each stage is independently shippable and revertible, easiest and most urgent first.

| Stage | Contents | UX risk | Verification |
|---|---|---|---|
| **M1 Security patches** | `jspdf` → 4.2.1 (critical), `npm audit fix` for the transitive highs | None | CI + a PDF export spot-check |
| **M2 axios** | 1.13 → 1.19 | None expected | Full e2e + **manual offline phone pass** — this is the sync path |
| **M3 xlsx decision** | ~~Choose~~ **S2: accept until S9**, then `exceljs` on parse path | None now | Import and export round-trip on real workbooks in S9 PR |
| **M4 .NET 10** | Runtime, EF Core, Npgsql, Dockerfile, CI | None | `dotnet test`, migration chain on both providers, staging standup |
| **M5 Dev-only majors** | ESLint 10, `@vitejs/plugin-react` 6, jest-dom 7, TypeScript 7 | None | CI green |
| **M6 Build tooling** | Vite 8 | Low | Bundle budgets + web-perf timings before/after |
| **M7 MUI 5 → 9** | Incremental, one major at a time | **High** | Screenshot comparison per screen, per major |
| **M8 React 19** | After MUI | Medium | Full e2e + manual phone pass |
| **M9 Remaining majors** | router 7, zod 4, resolvers 5, react-leaflet 5, pdfjs 6, x-date-pickers 9 | Medium | One per PR; zod needs message pinning |

### Rules

1. **One package major per PR.** Never bundle two migrations — a visual regression must be
   attributable to one of them
2. **M7 goes one major at a time** — v5→v6, v6→v7, and so on. Not v5→v9 in a single step
3. **Screenshot before and after** for anything in M7, M8 or M9. The perf gates protect speed; nothing
   currently protects layout, and that is the gap this work is most likely to fall into
4. **Manual phone pass for M2, M4 and M8.** Automation runs Chromium only; nothing exercises
   Capacitor, the sync queue or offline behaviour
5. **Do not run a blanket `npm update`.** M1 is a deliberately narrow `npm audit fix`, not a
   whole-tree bump

---

## What this does not include

| Not doing | Why |
|---|---|
| Rewriting `FaultBoundary` as a function component | React provides no hook for error boundaries. It is correct as a class |
| Replacing Redux Toolkit, Vite, `dayjs` or `idb` | All current and appropriate. There is nothing to modernise |
| Migrating off Capacitor | Version 8 is current; only patch bumps are outstanding |
| Adopting React Server Components / a framework | This is an offline-first Capacitor app bundled as static assets. RSC solves a problem it does not have |
| Chasing every latest major on principle | `typescript` 7 and `eslint` 10 are worth taking because they are cheap and invisible. Nothing here is worth taking purely to raise a version number |

---

## Appendix — reproducing

```bash
# Production vulnerabilities by severity
npm audit --omit=dev

# How far behind each package is
npm outdated

# Legacy React patterns (all expected to be zero except one class)
grep -rn 'defaultProps\|PropTypes\|componentWillMount\|UNSAFE_' src/
grep -rn 'makeStyles\|withStyles\|createStyles' src/
grep -rn 'extends React.Component\|extends Component' src/ --include=*.tsx

# MUI Grid migration scope
grep -rn '<Grid item' src/ --include=*.tsx | wc -l
grep -rl '<Grid item' src/ --include=*.tsx

# Backend target framework
grep -n 'TargetFramework' server/Commtrac.Api/Commtrac.Api.csproj
grep -n 'FROM mcr.microsoft.com' Dockerfile
```
