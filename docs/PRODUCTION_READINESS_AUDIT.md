# Strata N-Go — Phase -1 Production Readiness Audit (Combined)

**Status:** Read-only investigation — no infrastructure, DNS, AWS, or code changes.  
**Audit date:** 2026-08-31  
**Sources:** Cursor Cloud Agent + Claude Code (Mac) — five parallel read-only investigations, merged below.  
**Canonical baseline (preserved):** Git `6e4018c3e8ec6cdb87ef26c07693cf5cfa259d7f` — DEV web PASS, API healthy, iPhone PASS, offline sync PASS, S3 upload PASS.  
**Reference plan:** `Strata_NGo_Staging_Production_Implementation_Plan` (approved Dev + Production architecture — not yet implemented).

---

## Terminology (human, from Phase -1 forward)

| Name | Meaning today | Target URLs / resources |
|------|---------------|-------------------------|
| **DEV** | Current shared pre-production environment — **do not rename** existing `staging-*` AWS resources | Web: `staging.strata-ngo.com` (today `www.strata-ngo.com` still serves DEV web). API: `api.staging.strata-ngo.com`. AWS: `strata-ngo-*-staging`, ECS `commtrac-api-ae2c`, etc. |
| **PRODUCTION** | Real users — **new isolated stack** | Web: `www.strata-ngo.com`. API: `api.strata-ngo.com`. New RDS, S3, ECS, Secrets Manager, CloudFront. |

**Critical naming tension:** `www.strata-ngo.com` is **live DEV web today** but is the **planned PRODUCTION web hostname**.

---

## Combined executive summary

Strata N-Go is **operationally stable on DEV** at baseline `6e4018c3`. Field workflows, offline sync, and document upload are validated. **Neither audit considers the app ready for real production users.** Several P0 issues are **trivially exploitable today** on the live DEV web/mobile builds (client-side privilege escalation, token logging, ungated debug UI).

| Question | Answer |
|----------|--------|
| **Ready to begin Dev/Production separation?** | **YES** — treat this findings list as **required scope inside** the implementation plan; several P0s can only be fixed properly as part of separation (prod stack, prod appsettings, prod bundle ID, build lanes). |
| **Ready for real production users today?** | **NO** — 8 thematic P0 blockers; several exploitable as-is. |

**Finding counts (merged register):** **10 P0** · **12 P1** · **7 P2** · **4 P3**

---

## Production readiness scorecard (reconciled)

Both audits agree: **no category is a clean PASS** for production go-live. Offline/sync is strong on DEV but carries deploy-order risk (ATTENTION, not PASS).

| Area | Score | Combined rationale |
|------|-------|-------------------|
| **Authentication** | **BLOCKER** | Client-side `dev_role_override`; JWT + trusted-device token logged on 2FA; 24h tokens; web JWT in `localStorage`. |
| **Security** | **BLOCKER** | Ungated debug panel; CORS fail-open; legacy SSE JWT-in-URL; seed fallbacks; cleartext mobile; no security headers. |
| **Web** | **BLOCKER** | Debug UI ships to all users; tracked `.env.production` LAN IP; bare `npm run build` bypasses API URL validation. |
| **iOS** | **BLOCKER** | Personal bundle ID + signing; ATS disabled; same debug/token issues as web. |
| **Android** | **BLOCKER** | Same as iOS (`com.christianchavez.kinet`, cleartext). |
| **Backend** | **BLOCKER** | `appsettings.Production.json` unfilled scaffold; StrataNgoSeeder password fallbacks; CORS; dual schema path. |
| **Database/migrations** | **BLOCKER** | Seeder fallbacks on fresh DB; Ensure* + migrations dual path; startup migrate default `true`. |
| **Debug isolation** | **BLOCKER** | `DebugPanel` always mounted; `__apiDebugLogs` always on; auth `console.log` in prod bundles. |
| **Release process** | **BLOCKER** | Four conflicting version numbers; no `/api/version`; no enforced prod promotion. |
| **Offline/sync** | **ATTENTION** | Validated on device @ baseline; bundle 404 drop + mobile-before-API deploy risk remain. |
| **AWS configuration** | **ATTENTION** | DEV stack healthy; **no production stack**; handoff docs partially stale. |
| **Observability** | **ATTENTION** | Health endpoint only; support bundles well sanitized; no backend release identity. |

---

## P0 — Thematic production blockers (8 groups)

These are the **highest-priority themes** called out by both audits. Full IDs in the register below.

### P0-1 — Client-side privilege escalation (`dev_role_override`)

Any logged-in user can grant themselves Admin UI for the **entire session** with a devtools one-liner — **no build gate, no server check**:

```javascript
localStorage.setItem('dev_role_override', 'Admin')
```

| | |
|---|---|
| **Read** | `src/hooks/useAuth.ts` L20–26 — override applied to `effectiveUser.role` |
| **Write** | `src/components/layout/Topbar.tsx` L46–52 — Admin web menu sets/removes override |
| **Impact** | All client-side permission checks (`usePermissions`) see Admin; menus, routes, actions unlock |
| **DEV** | Acceptable for Admin “Test as role” with banner | **PRODUCTION** | **Remove override path** or server-validated impersonation only |
| **IDs** | S-013, D-010 |

### P0-2 — Live secrets in browser console (2FA login)

On every successful 2FA verification, the **full auth response object** (including JWT and `trustedDeviceToken`) is printed to the browser console in production bundles:

| | |
|---|---|
| **File** | `src/features/auth/Login.tsx` L197 — `console.log("[Login] 2FA verify response:", result)` |
| **Also** | L195, L199, L116, L133; `src/app/App.tsx` auth tracing; `src/services/secureStorage.ts` key logging |
| **DEV** | Strip in dev builds or verbose logging OK | **PRODUCTION** | **Remove** — never log auth result objects |
| **IDs** | S-014, D-015 |

### P0-3 — Fresh production DB silently seeds known passwords

`StrataNgoSeeder` (driving DEV today via `SeedProfile=StrataNgo`) uses **`?? "Admin123!"` / `?? "Pm123!"`** with **zero environment gate**. The safer pattern already exists in the same codebase:

| | |
|---|---|
| **Unsafe** | `server/Commtrac.Api/Data/StrataNgoSeeder.cs` L58–62 |
| **Safe pattern** | `server/Commtrac.Api/Data/DbInitializer.cs` L258–277 — `ResolveSeedAdminPassword()` throws in non-Development |
| **Scaffold** | `server/Commtrac.Api/appsettings.Production.json` — generic template (`app.yourdomain.com`, `us-east-1`, no `SeedProfile`, empty JWT key) — **never filled in for Strata** |
| **Risk** | Fresh prod RDS + forgotten Secrets Manager → real admin with public password |
| **IDs** | S-005, DB-005, E-009, W-005 |

### P0-4 — Mobile cannot ship to real users (identity + signing)

| | |
|---|---|
| **Bundle ID** | `com.christianchavez.kinet` — personal, not corporate (`capacitor.config.ts` L4; Android/iOS projects) |
| **Impact** | No legitimate App Store / enterprise distribution channel for Strata N-Go production |
| **Recommendation** | **N-Go Dev** (`com.strata.ngo.field.dev` or similar) + **N-Go** (`com.strata.ngo.field`) under corporate Apple/Google accounts |
| **IDs** | M-001, M-002 |

### P0-5 — Ungated debug surface on every authed screen

| | |
|---|---|
| **Mount** | `src/components/layout/AppShell.tsx` L124 — `<DebugPanel />` unconditional |
| **Panel** | `src/components/layout/DebugPanel.tsx` — API host, user email/role, pending queue, request log, export JSON |
| **Logs** | `src/services/api.ts` — `window.__apiDebugLogs` on every request, all builds |
| **IDs** | D-001, D-002 |

### P0-6 — Build/config mismatch permanently in repo

Same class of bug as the device API-mismatch incident — but **encoded in git**:

| | |
|---|---|
| **Tracked LAN URL** | `.env.production` L2 — `VITE_API_BASE=http://10.7.15.155:4000/api` |
| **Unguarded path** | `npm run build` / CI (`.github/workflows/ci.yml`) — no `VITE_API_BASE` validation |
| **Guarded path** | `scripts/build-cloud-web.mjs` — HTTPS + no localhost for prod mode |
| **IDs** | E-003, E-012 |

### P0-7 — No production infrastructure + DNS confusion

| | |
|---|---|
| **Today** | Only DEV (`staging-*` AWS); `www.strata-ngo.com` → DEV web |
| **Needed** | Isolated prod RDS, S3, ECS, Secrets Manager, CloudFront; `api.strata-ngo.com` |
| **Rule** | Do **not** rename staging resources to dev |
| **IDs** | E-001, E-002 |

### P0-8 — Backend auth surface + CORS fail-open

| | |
|---|---|
| **CORS** | `server/Commtrac.Api/Program.cs` — empty `AllowedOrigins` → localhost + any IP origin with credentials |
| **SSE legacy** | `server/Commtrac.Api/Controllers/SseController.cs` L79, L103–120 — `?token=<jwt>` still accepted |
| **Staging widen** | `appsettings.Staging.json` — `AllowDeviceOrigins: true` must **never** reach production |
| **IDs** | B-002, B-003, S-002 |

### P0-9 — Offline deploy-order / silent queue loss *(cross-cutting)*

| | |
|---|---|
| **Risk** | New mobile + old API → `/sync-bundle` 404 → queued ops **dropped** (`useSyncEngine.ts`) |
| **Rule** | Deploy **API → web → mobile**; add 404 fallback before prod mobile rollout |
| **IDs** | O-002, O-003 |

---

## P1 — Must address before users (12)

| ID | Summary | Key path |
|----|---------|----------|
| E-008 | Strata-specific prod appsettings (region, CORS, S3, email URL) | `appsettings.Production.json` |
| D-005 | Sync Center technical details (queue IDs) — admin-only on prod | `SyncCenterPage.tsx` |
| D-012 | `onboarding_flags_override` localStorage can force debug in prod | `featureFlags.ts` |
| S-001 | Tracked `.tmp-build/` artifacts in git | `server/Commtrac.Api/.tmp-build/` |
| S-007 | JWT in `localStorage` on web | `secureStorage.ts` |
| S-008 | Push token in plain `localStorage` | `pushNotificationService.ts` |
| B-001 | No security headers (HSTS, CSP, X-Frame-Options) | `Program.cs`, CDN |
| B-007 | Forgot-password not rate-limited | `AuthController.cs` |
| DB-001 | Dual schema: EF migrations + `Ensure*` / `PostgresSchemaEnsurer` | `DbInitializer.cs` |
| DB-003 | `RunMigrationsOnStartup: true` default in base appsettings | `appsettings.json` |
| DB-004 | `SeedProfile: StrataNgo` on prod must be omitted/gated | `appsettings.Staging.json` |
| R-001–R-004 | Version fragmentation; no `/api/version` | `package.json`, `featureFlags.ts`, native projects |

Also: **M-004** (biometric skip), **E-013–E-015** (cleartext/ATS), **S-006** (MinimalSeeder fallbacks), **B-005** (exception message leaks).

---

## P2 — Recommended hardening (7)

| ID | Summary |
|----|---------|
| B-005, B-006, B-008, B-010 | Exception leaks; in-memory rate limits; 24h JWT; anonymous workflow media |
| O-001, O-005 | API versioning policy; N-1 mobile test matrix |
| R-003, R-005, R-007 | Native version sync; bundle digest promotion; DEV/PROD env badge |
| W-006 | Visible environment indicator during DNS migration |
| E-011 | Explicit `build:dev-web` / `build:prod-web` npm aliases |
| D-011 | ComplexView easter-egg (5 logo taps) — admin-only |

---

## P3 — Future maintenance (4)

| ID | Summary |
|----|---------|
| E-018 | Refresh handoff ECS rev (`:22` doc vs live `:23`) |
| M-007 | iOS prompt: `.xcworkspace` → `npx cap open ios` (SPM project) |
| D-009 | Rename “Diagnostic” clocks (cosmetic) |
| Prior deferred | SSE duplicate tickets, UIKit warnings, health ping storm, CI lint |

---

## Implementation plan seed (Dev/Production separation)

Use this as the **first draft scope** for the implementation plan. **Do not implement until Christian/Mac sign-off on this audit.**

### Phase A — Code hardening (no new AWS; safe on DEV first)

| Step | Work | Closes |
|------|------|--------|
| A1 | Remove/gate `DebugPanel`, `__apiDebugLogs`, auth `console.log` (incl. L197) | P0-2, P0-5 |
| A2 | Remove `dev_role_override` from prod builds; DEV-only or server impersonation | P0-1 |
| A3 | `StrataNgoSeeder` → use `ResolveSeedAdminPassword()`; delete password fallbacks | P0-3 |
| A4 | Remove `.env.production` from git; CI fails if prod build without `build-cloud-web.mjs` | P0-6 |
| A5 | Purge `.tmp-build/` from git | P1 S-001 |
| A6 | Reject SSE `?token=` in non-Development; CORS fail-fast when origins empty | P0-8 |
| A7 | `/sync-bundle` 404 → per-op fallback | P0-9 |

### Phase B — Build lanes (still no prod AWS)

| Step | Work | Closes |
|------|------|--------|
| B1 | `build:dev-web` → `api.staging.strata-ngo.com` | E-011 |
| B2 | `build:prod-web` → `api.strata-ngo.com` (validated, not deployed) | E-011 |
| B3 | `VITE_APP_ENV=dev\|prod` + DEV badge in UI | R-007, W-006 |
| B4 | `version:sync` in release checklist | R-001–R-003 |
| B5 | Author real `appsettings.Production.json` (Strata, ap-southeast-2) | P0-3, E-008 |

### Phase C — Production AWS (new isolated stack)

| Step | Work | Closes |
|------|------|--------|
| C1 | Prod RDS, S3, ECS, Secrets Manager, CloudFront (per implementation plan) | P0-7 |
| C2 | Prod secrets: JWT, admin password, connection string — **before** first ECS boot | P0-3 |
| C3 | `SeedProfile` unset on prod; migrate job only (`cloud-migrate.sh`) | DB-004, DB-006 |
| C4 | Prod CORS: `www.strata-ngo.com` only; `AllowDeviceOrigins: false` | P0-8 |
| C5 | `/api/version` endpoint + Docker build args (git SHA) | R-004 |

### Phase D — DNS + mobile identity

| Step | Work | Closes |
|------|------|--------|
| D1 | Move DEV web to `staging.strata-ngo.com`; free `www` for prod cutover | P0-7 |
| D2 | Corporate bundle IDs: **N-Go Dev** + **N-Go** | P0-4 |
| D3 | Prod native: cleartext off, ATS restricted, biometric skip forbidden | P1 E-013–E-015, M-004 |
| D4 | Device acceptance on both lanes | O-007 |

### Phase E — Production go-live gate

- [ ] All P0 closed  
- [ ] P1 closed or explicitly accepted with sign-off  
- [ ] Staging (DEV) baseline still PASS @ promoted artifact  
- [ ] Prod smoke: login, workflow, offline sync, S3 upload, pending → 0  
- [ ] Promotion log: git SHA + web bundle hash + ECS task def + mobile build numbers  

---

## Full findings register

Severity: **Critical / High / Medium / Low**. Required before production: **Yes / No / Recommended**.

### AUDIT 1 — Environment configuration

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Sev | Req? | Fix | Risk |
|----|------|-----------|-------------------|-----|------------|-----|------|-----|------|
| E-001 | Env | *(none)* | No prod AWS stack | `staging-*` resources | New isolated prod stack | Crit | Yes | Implementation plan Phase C | Users on DEV data |
| E-002 | DNS | handoff docs, live DNS | `www` = DEV web today | Until `staging.strata-ngo.com` live | `www` + `api.strata-ngo.com` on prod | Crit | Yes | DNS cutover plan | Wrong environment |
| E-003 | Frontend | `.env.production` L2 | LAN IP committed | `.env.staging.local` | Remove from git | High | Yes | Example-only + secrets | Wrong API baked |
| E-004 | Frontend | `.env.staging.strata-ngo.example` | Staging API URL | Canonical DEV bake | Absent from prod builds | Low | Yes | Separate env files | Staging API in prod |
| E-005 | Frontend | `.env.example` | localhost default | Local dev | N/A | Low | No | Keep | — |
| E-006 | Runtime | `src/services/apiBase.ts` | Bakes `VITE_API_BASE` | LAN rehost OK | HTTPS prod only | Med | Yes | Prod build gate | Wrong host |
| E-007 | Links | `publicFrontendBase.ts` | Blocks deprecated hosts for QR/email | DEV origins | `www.strata-ngo.com` | Med | Yes | Per-env DB setting | Broken links |
| E-008 | Backend | `appsettings.Staging.json` | Postgres, staging S3, device CORS | Correct DEV | Prod-specific file | High | Yes | Real prod overlay | CORS leak |
| E-009 | Backend | `appsettings.Production.json` | Unfilled scaffold (wrong region, generic domain) | N/A | Strata prod values | High | Yes | Author + review | Misconfigured prod |
| E-010 | Backend | `appsettings.json` | LAN email URL; migrate on startup default | Local dev | All overridden | Med | Yes | Scrub defaults | Migrate races |
| E-011 | Build | `build-cloud-web.mjs` | Guarded vs bare `npm run build` | `--staging` relaxes | HTTPS enforced | Low | Rec | `build:dev-web` / `build:prod-web` | Operator error |
| E-012 | Build | `package.json`, CI | CI builds without `VITE_API_BASE` | Compile gate | Never deploy CI artifact | Low | Rec | Document + enforce | Empty API URL |
| E-013 | Mobile | `capacitor.config.ts` L7–9 | cleartext true | LAN HTTP OK | HTTPS only | Med | Yes | Prod flavor | MITM |
| E-014 | Mobile | `AndroidManifest.xml` | cleartext traffic | DEV | false | Med | Yes | Prod manifest | Cleartext |
| E-015 | Mobile | `Info.plist` | ATS disabled | DEV | Exception domains | Med | Yes | Prod ATS | ATS bypass |
| E-016 | Flag | `.env.staging.strata-ngo.example` | `VITE_SKIP_BIOMETRIC` | Internal OK | Forbidden | High | Yes | CI reject | No lock screen |
| E-017 | Flag | BOM dual flags | Staging enabled | Match frontend/backend | Business decision | Low | Rec | Document | Module drift |
| E-018 | Docs | `CLAUDE_CODE_AWS_HANDOFF.md` | ECS `:22` stale | Update after separation | Prod runbook | Low | No | Refresh | Confusion |

**Proposed build scripts:**

| Script | API | Web |
|--------|-----|-----|
| `build:dev-web` | `https://api.staging.strata-ngo.com/api` | `staging.strata-ngo.com` (future) |
| `build:prod-web` | `https://api.strata-ngo.com/api` | `https://www.strata-ngo.com` |
| `build:dev-native` | same | → **N-Go Dev** |
| `build:prod-native` | same | → **N-Go** |

### AUDIT 2 — Debugging / developer UI

| ID | File/path | Current | DEV | PROD | Sev | Rec |
|----|-----------|---------|-----|------|-----|-----|
| D-001 | `DebugPanel.tsx`, `AppShell.tsx` L124 | Always mounted | DEV_ONLY or admin | REMOVE / admin-only | Crit | Gate |
| D-002 | `api.ts` | `__apiDebugLogs` always | DEV_ONLY | ADMIN_ONLY | High | Gate |
| D-003 | `ApiDebugPanel.tsx` | Sync Center API log | DEV/ADMIN | ADMIN_ONLY | Med | Gate |
| D-004 | `debugSnapshotService.ts` | Export baseline JSON | DEV/ADMIN | ADMIN_ONLY | Med | Gate |
| D-005 | `SyncCenterPage.tsx` | Technical details | Full OK | ADMIN_ONLY section | Med | Hide |
| D-006 | `syncSupportBundleService.ts` | Sanitized bundle | SAFE | SAFE | Low | Keep |
| D-007 | `syncDiagnosticsLog.ts` | Failure ring buffer | Log OK | UI admin-only | Low | Hide UI |
| D-008 | `staleAsset*.ts` | Internal purge | SAFE | SAFE | Low | Keep |
| D-009 | `DiagnosticClockBar.tsx` | Field clocks | SAFE | SAFE | Low | Rename optional |
| D-010 | `Topbar.tsx` L46–52, `useAuth.ts` L20–26 | Test as role + override | ADMIN/DEV | **REMOVE on prod** | **Crit** | See S-013 |
| D-011 | `ComplexViewContext.tsx` | 5-tap easter egg | ADMIN | ADMIN | Low | Gate |
| D-012 | `featureFlags.ts` | localStorage override | DEV | REMOVE | Med | Block in prod |
| D-013 | `ReportProblemDialog.tsx` | User fault report | SAFE | SAFE | Low | Keep |
| D-014 | `FaultReportsPage.tsx` | Admin diagnostics | ADMIN | ADMIN | Low | Keep |
| D-015 | `App.tsx`, `Login.tsx` L197, `secureStorage.ts` | Auth console.log | DEV_ONLY | **REMOVE** | High | Strip |
| D-016 | `UserManagement.tsx` | Admin debug logs | DEV | REMOVE | Low | Strip |
| D-017 | `Program.cs` | Swagger dev-only | ✓ | ✓ | Low | Keep |

### AUDIT 3 — Secret / token exposure

| ID | File/path | Current | DEV | PROD | Sev | Rec |
|----|-----------|---------|-----|------|-----|-----|
| S-001 | `.tmp-build/` tracked | Build artifacts in git | Remove | Never commit | High | Purge |
| S-002 | `SseController.cs` L79 | Legacy JWT in URL | Temp OK | REMOVE | High | Reject |
| S-003 | `useSseEvents.ts` | Ticket flow | OK | OK | Low | Keep |
| S-004 | SSE ticket query | Short-lived ticket | OK | Log risk | Med | Monitor |
| S-005 | `StrataNgoSeeder.cs` L58–62 | Password fallbacks | Secrets Manager | **Throw** | **Crit** | ResolveSeedAdminPassword |
| S-006 | `MinimalSeeder.cs`, `DbInitializer.cs` | Demo passwords | Dev only | No seed | High | Gate |
| S-007 | `secureStorage.ts` | JWT localStorage web | Accept DEV | Harden | Med | httpOnly eval |
| S-008 | `pushNotificationService.ts` | Push token localStorage | DEV | Secure storage | Med | Move |
| S-009 | `syncSupportBundleService.ts` | Token stripping | OK | OK | Low | Keep |
| S-010 | `api.ts` | No Auth header in debug log | OK | Gate collection | Low | — |
| S-011 | AWS | Staging secrets path | DEV SM | Prod SM separate | High | New secret |
| S-012 | Dev appsettings | Dev passwords in repo | Local only | Never deploy | Med | User-secrets |
| **S-013** | **`useAuth.ts` L20–26, `Topbar.tsx` L46–52** | **Client role override → Admin UI** | **Admin test tool** | **REMOVE** | **Crit** | **Build gate + delete prod path** |
| **S-014** | **`Login.tsx` L197** | **Full 2FA response logged (JWT + trusted device token)** | **DEV verbose** | **REMOVE** | **Crit** | **Delete log line** |

### AUDIT 4 — Production web

| ID | File/path | Notes | Sev |
|----|-----------|-------|-----|
| W-001 | `vite.config.ts` | Source maps off by default; document explicit `false` | Low |
| W-002 | `routes.tsx`, `infra/staging/nginx.conf` | SPA fallback pattern OK | Med |
| W-003 | `FaultBoundary.tsx`, `api.ts` | 5xx not always user-visible | Low |
| W-004 | Deploy docs | Immutable assets + no-cache index | Med |
| W-005 | Seeders, e2e | Default passwords in dev/e2e only | High |
| W-006 | *(none)* | No DEV/PROD banner | Med |

### AUDIT 5 — Production mobile

| ID | Notes | Sev |
|----|-------|-----|
| M-001 | `com.christianchavez.kinet` — personal ID | High |
| M-002 | Display name: **N-Go Dev** / **N-Go** | Med |
| M-003 | API baked at build time | Crit |
| M-004 | `VITE_SKIP_BIOMETRIC` | High |
| M-005 | IndexedDB persists per bundle ID | Low |
| M-006 | Post-update sync smoke | Med |
| M-007 | iOS `.xcworkspace` doc stale | Low |

### AUDIT 6 — Backend hardening

| ID | File | Notes | Sev |
|----|------|-------|-----|
| B-001 | `Program.cs` | No security headers | High |
| B-002 | `Program.cs` | CORS fail-open | Crit |
| B-003 | `appsettings.Staging.json` | AllowDeviceOrigins | High |
| B-004 | `appsettings.json` | AllowedHosts `*` | Med |
| B-005 | Controllers | ex.Message to client | Med |
| B-006 | `AuthController.cs` | In-memory rate limits | Med |
| B-007 | `AuthController.cs` | No forgot-password limit | Med |
| B-008 | JWT 24h | Long-lived tokens | Med |
| B-009 | `SseController.cs` | Anonymous status | Low |
| B-010 | `WorkflowConfigsController.cs` | Anonymous media GET | Med |
| B-011 | `SettingsController.cs` | LAN helper anonymous | Low |
| B-012 | `Program.cs` | ForwardedHeaders open | Med |
| B-013–B-015 | Auth defaults, JWT guard, Swagger | Positive | Low |

### AUDIT 7 — Database / migrations

| ID | Notes | Sev |
|----|-------|-----|
| DB-001 | Ensure* + migrations dual path | High |
| DB-002 | FixEnsuredMigrations history insert | High |
| DB-003 | RunMigrationsOnStartup default true | High |
| DB-004 | SeedProfile on prod | High |
| DB-005 | StrataNgoSeeder fallbacks | Crit |
| DB-006 | cloud-migrate.sh job | Med |
| DB-007 | Rollback = RDS snapshot | Med |

### AUDIT 8 — Offline / backward compatibility

| ID | Notes | Sev |
|----|-------|-----|
| O-001 | No API versioning | Med |
| O-002 | Mobile-before-API deploy | High |
| O-003 | RUN_BUNDLE 404 drops ops | High |
| O-004 | Additive IndexedDB | Low |
| O-005 | N-1 test matrix | Med |
| O-006 | Delta sync fallback | Low |
| O-007 | Baseline validated DEV | Low |

### AUDIT 9 — Release identity

| ID | Current | Sev |
|----|---------|-----|
| R-001 | `package.json` → 0.1.0 | High |
| R-002 | `APP_VERSION` → 1.2.0 | High |
| R-003 | Native 1.0 / code 1 | Med |
| R-004 | No `/api/version` | Med |
| R-005 | Web bundle hash | Med |
| R-006 | Fault report version | Low |
| R-007 | No env badge | Med |

### AUDIT 10 — Feature flags

| Flag | Type | DEV | PROD |
|------|------|-----|------|
| `VITE_API_BASE` | Build | staging API | prod API |
| `VITE_ENABLE_DEBUG_UI` *(proposed)* | Build | true | false |
| `VITE_APP_ENV` *(proposed)* | Build | `dev` | `prod` |
| `VITE_SKIP_BIOMETRIC` | Build | optional | **forbidden** |
| `dev_role_override` | localStorage | remove | **forbidden** |
| `SeedProfile` | Server | StrataNgo | none |
| `AllowDeviceOrigins` | Server | true | false |
| BOM dual flags | Build + server | aligned | decision |

---

## Positive controls (both audits)

1. `build-cloud-web.mjs` — HTTPS + no-localhost for prod mode  
2. `JwtKeyResolver` + `HostingSecretGuard` — weak key fail-fast  
3. Swagger — Development only  
4. Support bundle sanitization — tested token stripping  
5. SSE ticket flow — client migrated  
6. Default auth policy — authenticated unless `[AllowAnonymous]`  
7. DEV baseline @ `6e4018c3` — offline sync, S3, queue drain validated  
8. `ResolveSeedAdminPassword()` — safe pattern exists (extend to StrataNgoSeeder)  
9. `publicFrontendBase.ts` — blocks deprecated hosts for user links  
10. IndexedDB — additive-only schema upgrades  

---

## Open items from prior engagement (unchanged)

| Item | Status |
|------|--------|
| Stale asset 404 recurrence | Open |
| SSE duplicate tickets | Open |
| UIKit warnings (iOS) | Open |
| Health ping duplication | Open |
| CI frontend lint | Open |
| PR #322 email toggle | Draft |

---

## Final answers

| Question | Answer |
|----------|--------|
| **Ready to begin Dev/Production separation?** | **YES** — use Phase A–E above as scope inside the implementation plan. |
| **Ready for real production users today?** | **NO** — P0-1 through P0-8 exploitable or blocking; prod stack does not exist. |

---

*Merged audit @ `6e4018c3`. No passwords, JWTs, or secret values recorded. PR #325.*
