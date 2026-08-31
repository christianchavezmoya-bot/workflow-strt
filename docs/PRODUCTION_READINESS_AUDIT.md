# Strata N-Go — Phase -1 Production Readiness Audit

**Status:** Read-only investigation — no infrastructure, DNS, AWS, or code changes made during this audit.  
**Audit date:** 2026-08-31  
**Canonical baseline (preserved):** Git `6e4018c3e8ec6cdb87ef26c07693cf5cfa259d7f` — web staging PASS, API healthy, iPhone PASS, offline sync PASS, S3 upload PASS.  
**Reference plan:** `Strata_NGo_Staging_Production_Implementation_Plan` (approved Dev + Production architecture — not yet implemented).

---

## Terminology (human, from Phase -1 forward)

| Name | Meaning today | Target URLs / resources |
|------|---------------|-------------------------|
| **DEV** | Current shared pre-production environment (do **not** rename existing `staging-*` AWS resources) | Web: migrate to `staging.strata-ngo.com` (today `www.strata-ngo.com` still serves DEV web). API: `api.staging.strata-ngo.com`. AWS: `strata-ngo-*-staging`, ECS `commtrac-api-ae2c`, etc. |
| **PRODUCTION** | Real users — **new isolated stack** (not yet built) | Web: `www.strata-ngo.com`. API: `api.strata-ngo.com`. New RDS, S3, ECS, Secrets Manager, CloudFront. |

**Critical naming tension:** `www.strata-ngo.com` is **live DEV web today** but is the **planned PRODUCTION web hostname**. DNS and bucket migration must be explicit when splitting environments.

---

## Executive summary

Strata N-Go is **operationally stable on DEV** (staging-labelled AWS) at baseline `6e4018c3`. Offline sync, document upload, and field workflows are validated. The application is **not ready for real production users** without addressing debug UI exposure, seed/password fallbacks, environment configuration hygiene, release identity, and production hardening.

| Question | Answer |
|----------|--------|
| **Ready to begin Dev/Production separation?** | **YES** — with this audit as the checklist; separation work can start in planning/infra phases using findings below. |
| **Ready for real production users today?** | **NO** — P0 blockers remain (debug surface, seed fallbacks, domain/config confusion, missing prod stack). |

---

## Production readiness scorecard

| Area | Score | Rationale |
|------|-------|-----------|
| **Authentication** | **ATTENTION** | JWT + refresh works; 24h token lifetime; web tokens in `localStorage`; forgot-password not rate-limited. |
| **Security** | **BLOCKER** | Always-on debug panel; CORS fail-open; legacy SSE JWT-in-URL; seed password fallbacks; cleartext mobile; no security headers. |
| **Web** | **ATTENTION** | Build pipeline exists; committed LAN `.env.production`; debug UI ships; no source maps (good). |
| **iOS** | **ATTENTION** | Personal bundle ID; ATS disabled; debug panel; version drift; DEV build validated. |
| **Android** | **ATTENTION** | Same bundle ID/cleartext/debug issues as iOS. |
| **Backend** | **ATTENTION** | Good auth default + JWT guard + Swagger gated; dual schema path; exception leaks; no `/api/version`. |
| **Offline/sync** | **PASS** | Validated on device at baseline; additive IndexedDB; deploy-order risk on new endpoints. |
| **Database/migrations** | **ATTENTION** | Migrations + parallel `Ensure*` patches; StrataNgoSeeder fallbacks; startup migrate default `true`. |
| **AWS configuration** | **ATTENTION** | DEV stack healthy; **no production stack**; handoff docs partially stale (ECS rev). |
| **Observability** | **ATTENTION** | Health endpoint only; support bundles good; no backend release identity; verbose client console in prod. |
| **Debug isolation** | **BLOCKER** | `DebugPanel` ungated; `__apiDebugLogs` always on; auth path `console.log` in production bundles. |
| **Release process** | **ATTENTION** | Four conflicting version numbers; `version:sync` not in CI; no immutable prod promotion doc enforced yet. |

---

## Findings register

Severity: **Critical / High / Medium / Low**.  
Required before production: **Yes / No / Recommended**.

---

### AUDIT 1 — Environment configuration

| ID | Area | File/path | Current behaviour | DEV behaviour | PRODUCTION behaviour | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|---------------|----------------------|----------|----------------------|-----------------|------|
| E-001 | Env | *(none)* | No production AWS stack, RDS, S3, ECS, or Secrets Manager | Existing `staging-*` resources | New isolated `prod` resources per implementation plan | Critical | Yes | Execute implementation plan Phase 2+; do not rename staging resources | Real users on DEV data/API |
| E-002 | DNS | `docs/CLAUDE_CODE_AWS_HANDOFF.md`, live DNS | `www.strata-ngo.com` → DEV web; `api.staging.strata-ngo.com` → DEV API | Keep until DEV web moves to `staging.strata-ngo.com` | `www.strata-ngo.com` + `api.strata-ngo.com` on prod stack | Critical | Yes | Planned DNS cutover with comms; bake prod API URL only in prod builds | Users hit wrong environment |
| E-003 | Frontend env | `.env.production` (tracked) | `VITE_API_BASE` = private LAN IP (`10.7.15.155`) committed to git | Use `.env.staging.local` / `.env.staging.strata-ngo.example` | Remove from git; prod URL only in CI secrets / `.env.production.local` | High | Yes | Delete tracked file; add `.env.production.strata-ngo.example` with `https://api.strata-ngo.com/api` placeholder | Wrong API baked into mobile/web |
| E-004 | Frontend env | `.env.staging.strata-ngo.example` | `VITE_API_BASE=https://api.staging.strata-ngo.com/api` | Canonical DEV native/web bake source | Must not appear in prod builds | Low | Yes | Prod builds use separate env file + `build:prod-web` script | Staging API in prod app |
| E-005 | Frontend env | `.env.example` | `http://localhost:4000/api` | Local dev default | N/A | Low | No | Keep for local dev | — |
| E-006 | Runtime API | `src/services/apiBase.ts` | Bakes `VITE_API_BASE`; localhost/LAN runtime rehosting on web | LAN + Docker overrides OK | HTTPS prod API only; no localhost fallback in prod bundle | Medium | Yes | Prod build must pass `build-cloud-web.mjs` HTTPS gate | App calls wrong host |
| E-007 | Public links | `src/services/publicFrontendBase.ts` | Uses live origin on HTTPS; blocks deprecated `staging.` / `api.*` for QR/email | DEV: `www` or future `staging.strata-ngo.com` | PROD: `https://www.strata-ngo.com` | Medium | Yes | Align DB `NotificationSettings.FrontendBaseUrl` per environment | Broken invite/QR links |
| E-008 | Backend | `appsettings.Staging.json` | Postgres, S3 `strata-ngo-media-staging`, CORS `www.strata-ngo.com`, `AllowDeviceOrigins: true` | Correct for DEV | Prod file must use prod bucket, origins, `AllowDeviceOrigins: false` | High | Yes | New `appsettings.Production.json` (Strata-specific, not generic template) | CORS/device-origin leak |
| E-009 | Backend | `appsettings.Production.json` | Generic template (`app.yourdomain.com`, placeholder S3) | N/A | Must be Strata-specific before prod deploy | High | Yes | Author prod overlay matching implementation plan | Misconfigured prod |
| E-010 | Backend | `appsettings.json` | Default SQLite; `Email:FrontendBaseUrl` LAN IP; `RunMigrationsOnStartup: true` | Local dev | Prod must override all via env/Secrets Manager | Medium | Yes | Scrub LAN defaults from committed base | Wrong email links / migrate races |
| E-011 | Build | `scripts/build-cloud-web.mjs` | Prod: HTTPS required, no localhost; `--staging` relaxes | `npm run build:cloud-web:staging` | `npm run build:cloud-web` with prod `VITE_API_BASE` | Low | Recommended | Add explicit `build:dev-web` / `build:prod-web` npm aliases (see Audit 4) | Operator error |
| E-012 | Build | `package.json`, `.github/workflows/ci.yml` | CI runs `npm run build` without `VITE_API_BASE` | Compile gate only | Deploy must never use CI artifact as prod bundle | Low | Recommended | Document: deploy always via `build:cloud-*` | Empty/wrong API in accidental deploy |
| E-013 | Mobile | `capacitor.config.ts` | `androidScheme: http`, `cleartext: true` | Needed for LAN HTTP testing | HTTPS-only; cleartext off | Medium | Yes | Prod native profile: `https` scheme, cleartext false | MITM / store rejection |
| E-014 | Mobile | `android/app/src/main/AndroidManifest.xml` | `usesCleartextTraffic="true"` | DEV LAN OK | Disable for prod release | Medium | Yes | Manifest flag false for prod flavor | Cleartext traffic |
| E-015 | Mobile | `ios/App/App/Info.plist` | `NSAllowsArbitraryLoads = true` | DEV LAN OK | Restrict ATS to prod API domain | Medium | Yes | Exception domains only | ATS bypass |
| E-016 | Feature flag | `.env.staging.strata-ngo.example` | `VITE_SKIP_BIOMETRIC=true` documented for testing | DEV/TestFlight internal OK | Must be unset/false | High | Yes | Build-time guard rejecting skip in prod pipeline | Biometric gate disabled |
| E-017 | Feature flag | `.env*`, backend | `VITE_ENABLE_BOM_MODULE` / `ENABLE_BOM_PROJECT_MODULE` | Enabled on DEV example | Explicit prod business decision | Low | Recommended | Document paired flags per environment | Module accidentally on/off |
| E-018 | AWS docs | `docs/CLAUDE_CODE_AWS_HANDOFF.md` | ECS rev `:22` documented; live `:23` | DEV reference | Prod runbook separate | Low | No | Refresh handoff after separation | Operator confusion |

**Proposed build scripts (do not implement yet):**

| Script | API URL | Web host |
|--------|---------|----------|
| `build:dev-web` | `https://api.staging.strata-ngo.com/api` | `staging.strata-ngo.com` (future) or current `www` during transition |
| `build:prod-web` | `https://api.strata-ngo.com/api` | `https://www.strata-ngo.com` |
| `build:dev-native` | Same as dev-web | Capacitor sync → **N-Go Dev** lane |
| `build:prod-native` | Same as prod-web | Capacitor sync → **N-Go** lane |

---

### AUDIT 2 — Debugging / developer UI

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|-----|------------|----------|----------------------|-----------------|------|
| D-001 | Debug UI | `src/components/layout/DebugPanel.tsx`, `AppShell.tsx` | Floating bug icon on **every** authed screen; shows API host, user email/role, pending count, API log, copy/download JSON | **DEV_ONLY** or admin-gated | **Remove** or **PRODUCTION_ADMIN_ONLY** (hidden entry) | Critical | Yes | Gate on `import.meta.env.DEV` or Admin role; never ship ungated | API topology + PII exposure |
| D-002 | API logs | `src/services/api.ts` | `window.__apiDebugLogs` populated on every request in all builds | **DEV_ONLY** | **PRODUCTION_ADMIN_ONLY** | High | Yes | Wrap `pushDebugLog` in dev/admin gate | Request history leak |
| D-003 | Debug UI | `src/components/ui/ApiDebugPanel.tsx` | Full API log dialog from Sync Center | **DEV_ONLY** or **PRODUCTION_ADMIN_ONLY** | Same | Medium | Recommended | Admin-only or remove | Support vs exposure tradeoff |
| D-004 | Debug export | `src/services/debugSnapshotService.ts` | Baseline JSON with route, API host, auth user summary, pending sample | **DEV_ONLY** or **PRODUCTION_ADMIN_ONLY** | Same | Medium | Recommended | Gate with D-001 | PII in exports |
| D-005 | Sync Center | `src/features/sync/SyncCenterPage.tsx` | User-facing sync, conflicts, **Technical details** (queue IDs, URLs, payload sizes) | Full panel OK | Core: **PRODUCTION_SAFE**; technical section: **PRODUCTION_ADMIN_ONLY** | Medium | Recommended | Collapse/hide technical block for non-admin | Field users see op IDs |
| D-006 | Support bundle | `src/services/syncSupportBundleService.ts` | Sanitized JSON; strips tokens from URLs; includes user id/email/role | **PRODUCTION_SAFE** | **PRODUCTION_SAFE** | Low | No | Keep; used for fault reports | — |
| D-007 | Sync diagnostics | `src/services/syncDiagnosticsLog.ts`, `localDB.ts` | IndexedDB failure ring buffer; shown in Sync Center Diagnostics | Logging: **PRODUCTION_SAFE**; UI: **PRODUCTION_ADMIN_ONLY** | Same | Low | Recommended | Hide diagnostics accordion for standard users | Noise for field users |
| D-008 | Stale assets | `src/utils/staleAsset*.ts` | Internal purge/filter; message in API debug log only | **PRODUCTION_SAFE** (internal) | Same | Low | No | No dedicated UI needed | — |
| D-009 | Clocks | `src/components/ui/DiagnosticClockBar.tsx`, `Topbar.tsx` | UTC/office/site clocks (labeled “Diagnostic”) | **PRODUCTION_SAFE** | **PRODUCTION_SAFE** | Low | No | Consider rename to “Field clocks” | — |
| D-010 | Admin tools | `src/components/layout/Topbar.tsx` | Web Admin: “Test as user/role”, TEST MODE banner, search-index widget | **PRODUCTION_ADMIN_ONLY** | **PRODUCTION_ADMIN_ONLY** or **DEV_ONLY** | Medium | Recommended | Disable on prod web or audit-log impersonation | Permission bypass perception |
| D-011 | Easter egg | `src/contexts/ComplexViewContext.tsx` | 5 logo taps toggles complex PM view (native) | **DEV_ONLY** or **PRODUCTION_ADMIN_ONLY** | Same | Low | Recommended | Gate by role | Hidden power features |
| D-012 | Onboarding | `src/onboarding/config/featureFlags.ts` | `debugMode` defaults to DEV; `localStorage.onboarding_flags_override` can force debug in prod | Override: **DEV_ONLY** | **REMOVE** override in prod | Medium | Yes | Ignore localStorage override when `PROD` | Debug UI in prod |
| D-013 | Fault reports | `src/features/support/ReportProblemDialog.tsx` | User report + auto support bundle | **PRODUCTION_SAFE** | **PRODUCTION_SAFE** | Low | No | Keep | — |
| D-014 | Fault admin | `src/features/support/FaultReportsPage.tsx` | Admin downloads attached diagnostics | **PRODUCTION_ADMIN_ONLY** | Same | Low | No | Keep | — |
| D-015 | Console | `src/app/App.tsx`, `Login.tsx`, `secureStorage.ts` | Verbose `console.log` in auth/storage paths ships in prod bundles | **DEV_ONLY** | **REMOVE** | High | Yes | Strip or gate all auth console.log | Session flow leak via Safari Web Inspector |
| D-016 | Console | `src/features/admin/UserManagement.tsx` | Debug `console.log` on admin actions | **DEV_ONLY** | **REMOVE** | Low | Recommended | Remove | Noise |
| D-017 | Backend | `server/Commtrac.Api/Program.cs` | Swagger + `ApiTimingMiddleware` only in Development | **DEV_ONLY** ✓ | Disabled ✓ | Low | No | Keep | — |

---

### AUDIT 3 — Secret / token exposure

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|-----|------------|----------|----------------------|-----------------|------|
| S-001 | Repo hygiene | `server/Commtrac.Api/.tmp-build/` (tracked) | Build artifacts including copied appsettings in git | Remove from repo | Never commit | High | Yes | `.gitignore` + purge history | Dev credentials in VCS |
| S-002 | SSE | `server/Commtrac.Api/Controllers/SseController.cs` | Legacy `GET /api/sse/events?token=<jwt>` still accepted | Temporary OK | **REMOVE** | High | Yes | Reject `?token=` in Production after client verification | JWT in access logs |
| S-003 | SSE | `useSseEvents.ts` + ticket flow | Client uses opaque ticket (good) | OK | OK | Low | No | Keep ticket flow | — |
| S-004 | SSE | Ticket in query string | Short-lived ticket in URL | Acceptable DEV | May appear in proxy logs | Medium | Recommended | Monitor; consider header/cookie transport later | Log exposure |
| S-005 | Seed | `server/Commtrac.Api/Data/StrataNgoSeeder.cs` | `SeedAdmin:Password ?? "Admin123!"`, PM `?? "Pm123!"` if config empty | OK only if Secrets Manager always set | **Must throw** if missing | Critical | Yes | Reuse `ResolveSeedAdminPassword()` guard | Known admin on fresh RDS |
| S-006 | Seed | `DbInitializer.cs`, `MinimalSeeder.cs` | Hardcoded demo passwords on empty DB paths | Dev profiles only | Must not run on prod | High | Yes | `SeedProfile=None` on prod; no fallbacks | Backdoor accounts |
| S-007 | JWT storage | `src/services/secureStorage.ts` | Web: JWT in `localStorage`; native: Keychain + **localStorage mirror** | Acceptable DEV | Evaluate httpOnly cookie (web) / Keychain-only (native) | Medium | Recommended | Reduce XSS surface | Token theft via XSS |
| S-008 | Push token | `src/services/pushNotificationService.ts` | FCM/APNs token cached in `localStorage` | DEV OK | Secure storage | Medium | Recommended | Keychain/Keystore only | Device token leak |
| S-009 | Support bundle | `syncSupportBundleService.ts` | Strips `token`, `ticket`, `access_token`, `refresh_token` from URLs | OK | OK | Low | No | Keep; tests exist | — |
| S-010 | API debug | `api.ts` | Debug log excludes Authorization header | OK | Gate collection (D-002) | Low | Recommended | — | — |
| S-011 | Secrets | AWS DEV | `strata_ngo/staging/app` in Secrets Manager | DEV | Separate prod secret path | High | Yes | New prod secret; never share | Cross-env secret reuse |
| S-012 | Dev files | `appsettings.Development.json`, `StagingDocker.json` | Dev JWT keys and passwords in repo | Local/Docker only | Never deploy these profiles to AWS | Medium | Recommended | User-secrets / `.env` for local | Accidental profile mix |

**Blockers (secrets):** S-005, S-002, S-001.

---

### AUDIT 4 — Production web

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|-----|------------|----------|----------------------|-----------------|------|
| W-001 | Source maps | `vite.config.ts` | No `sourcemap` set → default **off** in prod | Optional dev maps | Explicit `sourcemap: false` | Low | Recommended | Document in prod checklist | Source leak if misconfigured |
| W-002 | SPA routing | `src/app/routes.tsx`, `infra/staging/nginx.conf` | Catch-all → `/`; assets 404 separately | Same | Mirror nginx/CloudFront rules on prod bucket | Medium | Yes | Prod CloudFront: `index.html` no-cache, `/assets/*` immutable | 404 on deep links |
| W-003 | Error UX | `FaultBoundary.tsx`, `api.ts` | Crash UI + fault report; 5xx logged not always surfaced | DEV stack traces in boundary | Generic user messages | Low | Recommended | User-visible 5xx toast | Poor UX |
| W-004 | Caching | Deploy docs | Staging: immutable assets, no-cache index | DEV | Same pattern on prod S3/CF | Medium | Yes | Separate prod bucket | Stale SPA shell |
| W-005 | Test accounts | `StrataNgoSeeder.cs`, e2e specs | `admin@StrataNgo.local`, docs reference `Admin123!` in dev/e2e | DEV seed OK | Strong unique secrets; no default passwords | High | Yes | Prod first-boot via Secrets Manager only | Known credentials |
| W-006 | Env banner | *(none)* | No visible “DEV” / “PRODUCTION” banner in UI | Show **DEV** badge | Show **PRODUCTION** or none | Medium | Recommended | Environment indicator component | User confusion during DNS migration |

---

### AUDIT 5 — Production mobile

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|-----|------------|----------|----------------------|-----------------|------|
| M-001 | Bundle ID | `capacitor.config.ts`, Android/iOS projects | `com.christianchavez.kinet` (personal) | OK for internal DEV | **New ID** e.g. `com.strata.ngo.field` | High | Yes | Corporate developer account; separate store listing | Wrong ownership; can't coexist Dev+Prod on device |
| M-002 | Display name | Capacitor / native | `Strata NGo` for both | **N-Go Dev** (recommended) | **N-Go** | Medium | Recommended | Xcode/Android product flavors | Install confusion |
| M-003 | API bake | `build-cloud-native.mjs` | `VITE_API_BASE` baked at build time | `api.staging.strata-ngo.com` | `api.strata-ngo.com` | Critical | Yes | Separate build lanes | Wrong backend |
| M-004 | Biometric | `VITE_SKIP_BIOMETRIC` | Can disable lock screen | DEV only | Never | High | Yes | Prod pipeline rejects flag | Security bypass |
| M-005 | Offline DB | `src/services/localDB.ts` | IndexedDB `commtrac_offline_v2` v4; additive upgrades | Persists across updates | Same bundle ID only | Low | No | Document: new bundle ID = fresh install | Queue loss on ID change |
| M-006 | Upgrade | `docs/MOBILE_BUILD.md` | Same bundle ID retains queue + IDB | DEV TestFlight/internal | Prod store updates need smoke test | Medium | Recommended | Post-release sync smoke | Regression |
| M-007 | Xcode | `docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md` | References `.xcworkspace`; project uses SPM → `.xcodeproj` | Doc fix | Doc fix | Low | No | Update prompt to `npx cap open ios` | Operator friction |

**Separate bundle IDs:** **Advisable.** Allows **N-Go Dev** (staging API, internal distribution, debug permitted) and **N-Go** (prod API, App Store, production-safe diagnostics) installed side-by-side. Changing prod bundle ID later forces reinstall and **IndexedDB/sync queue loss**.

---

### AUDIT 6 — Backend production hardening

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|-----|------------|----------|----------------------|-----------------|------|
| B-001 | Security headers | `Program.cs`, nginx | No HSTS, CSP, X-Frame-Options in repo | Optional DEV | Required at API + CDN | High | Yes | Middleware + CloudFront response headers | Clickjacking, MIME sniff |
| B-002 | CORS | `Program.cs` | Empty allowlist → localhost + all IP origins with credentials | DEV convenience | **Fail fast** if origins empty | Critical | Yes | Non-Development throws on missing origins | Open credentialed CORS |
| B-003 | CORS | `appsettings.Staging.json` | `AllowDeviceOrigins: true` | Required for Capacitor/LAN | **false** | High | Yes | Startup guard rejects true in Production | Any IP origin accepted |
| B-004 | Hosts | `appsettings.json` | `AllowedHosts: "*"` | DEV | Explicit prod hostnames | Medium | Recommended | Restrict in prod overlay | Host header attacks |
| B-005 | Exceptions | Multiple controllers | Some catch blocks return `ex.Message` to client | DEV detail OK | Generic messages | Medium | Recommended | Central exception handler | Info disclosure |
| B-006 | Rate limit | `AuthController.cs` | Login/2FA limited in-memory | OK single instance | Redis when scaled | Medium | Recommended | Document single-task limit until Redis | Brute force at scale |
| B-007 | Rate limit | `AuthController.cs` forgot-password | No throttle | DEV | Per-IP + per-email limits | Medium | Yes | Add before prod | Email abuse |
| B-008 | JWT | `appsettings.json` | 1440 min (24h) access token | DEV OK | Shorter + rotation | Medium | Recommended | 15–60 min access + refresh | Stolen token window |
| B-009 | SSE status | `SseController.cs` | `GET /api/sse/status` anonymous | DEV | Admin-only or remove | Low | Recommended | Auth gate | Reconnaissance |
| B-010 | Media | `WorkflowConfigsController.cs` | Some media file GET anonymous | May be intentional | Auth or signed URLs | Medium | Recommended | Review instructional media exposure | IDOR |
| B-011 | LAN helper | `SettingsController.cs` | `runtime-frontend-base` anonymous LAN IP | DEV | Disable in Production | Low | Recommended | Development-only endpoint | Info disclosure |
| B-012 | Forwarded headers | `Program.cs` | Trusts X-Forwarded-* without KnownProxies | Behind ALB OK if locked | Configure ALB CIDR | Medium | Recommended | KnownNetworks for VPC | IP spoofing in logs |
| B-013 | Swagger | `Program.cs` | Disabled outside Development | ✓ | ✓ | Low | No | Keep | — |
| B-014 | Auth default | `Program.cs` | FallbackPolicy requires auth | ✓ | ✓ | Low | No | Keep | — |
| B-015 | JWT key | `JwtKeyResolver`, `HostingSecretGuard` | Fail-fast weak/missing key non-Dev | ✓ | ✓ | Low | No | Keep | — |

---

### AUDIT 7 — Database / migrations

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|-----|------------|----------|----------------------|-----------------|------|
| DB-001 | Dual schema | `DbInitializer.cs`, `PostgresSchemaEnsurer.cs` | EF migrations **plus** parallel `Ensure*` patches every boot | Tolerated on DEV | Consolidate to migrations-only | High | Yes | Retirement plan for Ensure* | Schema drift |
| DB-002 | Migration history | `DbInitializer.FixEnsuredMigrations` | Inserts into `__EFMigrationsHistory` for legacy Ensure | Legacy repair | Remove from startup path | High | Recommended | One-time repair scripts | False “applied” migrations |
| DB-003 | Startup migrate | `appsettings.json` | `RunMigrationsOnStartup: true` default | Dev convenience | **false**; CI/job only | High | Yes | Prod template already false; enforce in task def | Multi-instance race |
| DB-004 | Strata seed | `appsettings.Staging.json` | `SeedProfile: StrataNgo` on empty DB | DEV first boot | Omit or gate prod seed | High | Yes | Prod: no SeedProfile or explicit opt-in flag | Demo data in prod |
| DB-005 | Seed passwords | `StrataNgoSeeder.cs` | See S-005 | DEV | Throw if missing | Critical | Yes | Shared secret resolver | Known admin |
| DB-006 | Migrations job | `scripts/cloud-migrate.sh` | CI/manual migrate before deploy | DEV | Required prod gate before ECS | Medium | Yes | Backup + migrate + smoke | DDL during traffic |
| DB-007 | Rollback | EF migrations | Forward-only; no automated down | DEV | Expand/contract discipline | Medium | Recommended | Document rollback = restore RDS snapshot | Data loss on bad migration |

**Production initialization (recommended, not implemented):**

1. Restore empty RDS or create fresh prod instance.  
2. Run `cloud-migrate.sh` (or equivalent) **once** with backup.  
3. Bootstrap admin **only** via Secrets Manager password — no StrataNgoSeeder on prod unless explicitly approved.  
4. ECS tasks: `RunMigrationsOnStartup=false`, `ASPNETCORE_ENVIRONMENT=Production`.

---

### AUDIT 8 — Offline / backward compatibility

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|-----|------------|----------|----------------------|-----------------|------|
| O-001 | API versioning | *(none)* | No `/v1/` or min-client-version header | N/A | Document deploy order | Medium | Recommended | API → web → mobile | Skew breakage |
| O-002 | Deploy order | `useSyncEngine.ts` | New mobile + old API: some 404s **drop** queued ops | Test on DEV | **Never** mobile before API | High | Yes | Release checklist | Silent data loss |
| O-003 | RUN_BUNDLE | `useSyncEngine.ts`, sync endpoints | Bundle flush; 404 on `/sync-bundle` drops ops | DEV | 404 → fallback to per-op flush | High | Yes | Add fallback before prod mobile rollout | Lost completions/signatures |
| O-004 | IndexedDB | `localDB.ts` schema v4 | Additive upgrades only | ✓ | ✓ | Low | No | Keep additive-only policy | — |
| O-005 | N-1 mobile | Sync queue op types | 20+ op types; idempotency keys for TIME_ENTRY/SIGNATURE | Test N-1 on DEV before prod release | Required | Medium | Yes | Compatibility matrix in release notes | Forced upgrade |
| O-006 | Delta sync | `GET /api/sync/changes?since=` | Graceful fallback to full bootstrap | ✓ | ✓ | Low | No | Keep | — |
| O-007 | Baseline | Device acceptance @ `6e4018c3` | Offline → online PASS, pending → 0 | DEV validated | Re-validate on prod stack before go-live | Low | Yes | Prod smoke checklist | — |

**Architecture supports prod backend N with mobile N-1** only if API changes are backward compatible and deploy order is API-first. **Does not** safely support new mobile hitting old API when new endpoints are required (bundle sync).

---

### AUDIT 9 — Release identity

| ID | Area | File/path | Current behaviour | DEV | PRODUCTION | Severity | Required before prod? | Recommended fix | Risk |
|----|------|-----------|-------------------|-----|------------|----------|----------------------|-----------------|------|
| R-001 | Frontend version | `package.json` | `0.1.0` | Display in support bundle | Single source of truth | High | Yes | Unify all clients | Support triage confusion |
| R-002 | Frontend version | `src/onboarding/config/featureFlags.ts` | `APP_VERSION = "1.2.0"` | What's New modal | Must match package.json | High | Yes | Import from package/build define | Version mismatch |
| R-003 | Native | Android/iOS projects | `versionName/MARKETING_VERSION = 1.0`, code `1` | DEV | Sync via `scripts/sync-version.mjs` in release CI | Medium | Yes | Run before every store upload | Store rejection |
| R-004 | Backend | *(none)* | No `/api/version` | DEV | `{ version, gitSha, buildTime, environment }` | Medium | Yes | Inject at Docker build | Can't verify deployed API |
| R-005 | Web bundle | S3/CloudFront | Hash in filename (`index-*.js`) | Record on deploy | Immutable artifact digest in promotion log | Medium | Recommended | Promotion table per release | Wrong bundle promoted |
| R-006 | Fault reports | `faultReportService.ts` | Sends `appVersion` from package.json | OK | Add native + API version | Low | Recommended | Enrich diagnostics | — |
| R-007 | Environment label | *(none)* | Not shown in app | **DEV** badge in About/settings | Optional prod build label | Medium | Recommended | `VITE_APP_ENV=dev|prod` at build time | Wrong-env incidents |

---

### AUDIT 10 — Feature flags

| Flag | Type | Location | DEV | PRODUCTION | Recommendation |
|------|------|----------|-----|------------|----------------|
| `VITE_API_BASE` | Build-time | `.env*`, `apiBase.ts` | Staging API URL | Prod API URL | **Required** build-time |
| `VITE_ENABLE_BOM_MODULE` | Build-time | `bom-project/featureFlag.ts` | Often true | Business decision | Build-time + document |
| `ENABLE_BOM_PROJECT_MODULE` | Server env | `BomImportRunsController.cs` | Must match frontend | Must match frontend | Server env + deploy check |
| `VITE_SKIP_BIOMETRIC` | Build-time | `biometricAuth.ts` | Allowed internal | **Forbidden** | Build-time gate in CI |
| `import.meta.env.DEV` | Build-time | Various | Debug gating | false in prod | Primary debug gate |
| `SeedProfile` | Server env | `appsettings.*`, seeders | `StrataNgo` on DEV empty DB | None / gated | Server env only |
| `Database:RunMigrationsOnStartup` | Server env | appsettings | false on AWS DEV | false | Server env only |
| `Cors:AllowDeviceOrigins` | Server env | appsettings | true DEV | false | Server env only |
| `onboarding_flags_override` | Client localStorage | `featureFlags.ts` | OK | **Disable** | Remove prod override path |
| `dev_role_override` | Client localStorage | `Topbar.tsx`, `useAuth.ts` | Admin testing | Admin + audit or DEV only | Role-controlled + server audit if kept |
| Debug panel / API logs | *(ungated)* | Should become | `VITE_ENABLE_DEBUG_UI=true` DEV builds | false / admin | **Build-time** + optional **role-controlled** |
| BrandSettings | Server DB | Settings API | Per-env DB | Per-env DB | Not a feature flag — separate DB |

**Recommended flag strategy:**

- **Build-time:** API URL, environment name, debug UI, biometric skip, BOM module.  
- **Server-controlled:** BOM backend, seed profile, CORS, migrations-on-startup.  
- **Role-controlled:** Test-as-user, fault report admin, optional technical Sync Center details.  
- **Never localStorage override in production** for security/debug flags.

---

## Priority classification

### P0 — Production blockers (must fix before real users)

| ID | Summary |
|----|---------|
| E-001 | No production infrastructure exists |
| E-002 | DNS/domain mapping (`www` today = DEV; prod needs isolated stack) |
| E-003 | Tracked `.env.production` with LAN API URL |
| D-001 | Ungated `DebugPanel` on all authed screens |
| D-002 | `__apiDebugLogs` always collecting |
| S-005 | `StrataNgoSeeder` password fallbacks |
| B-002 | CORS fail-open when origins unset |
| S-002 | Legacy SSE JWT in query string |
| M-001 | Personal bundle ID unsuitable for production store |
| M-003 | Must bake prod API URL in prod native builds (after prod API exists) |
| O-002 / O-003 | Mobile-before-API deploy + bundle 404 drop risk |

### P1 — Must address before users (shortly after P0 or in parallel with separation)

| ID | Summary |
|----|---------|
| E-008, E-009 | Strata-specific production appsettings |
| D-015 | Auth/storage console.log in production bundles |
| S-001 | Tracked `.tmp-build` artifacts |
| S-007 | JWT in localStorage (web) |
| B-001 | Security headers |
| B-003 | `AllowDeviceOrigins` must be false on prod |
| B-007 | Forgot-password rate limiting |
| DB-001, DB-003, DB-004 | Schema dual-path, migration startup, seed profile on prod |
| R-001, R-002, R-004 | Unified version + backend `/api/version` |
| W-005 | Test/default credentials policy |
| M-004 | Biometric skip forbidden on prod |
| E-013–E-015 | Disable cleartext/ATS on prod mobile |

### P2 — Recommended hardening

| ID | Summary |
|----|---------|
| D-005, D-010, D-012 | Sync Center technical details; test-as-user; onboarding override |
| B-005, B-006, B-008, B-010 | Exception leaks, distributed rate limits, JWT lifetime, anonymous media |
| O-001, O-005 | API versioning policy, N-1 test matrix |
| R-003, R-005, R-007 | Native version sync, bundle digest promotion, env badge |
| W-006 | Environment indicator in UI |
| E-011 | Explicit `build:dev-web` / `build:prod-web` scripts |

### P3 — Future maintenance

| ID | Summary |
|----|---------|
| E-018 | Refresh handoff doc ECS revision |
| M-007 | iOS prompt `.xcworkspace` → `.xcodeproj` |
| D-009 | Rename “Diagnostic” clocks |
| B-009, B-011 | SSE status, LAN helper endpoint |
| Open items deferred from sync engagement | SSE duplicate tickets, UIKit warnings, health ping duplication |

---

## Positive controls (already in place)

1. **`build-cloud-web.mjs`** — HTTPS + no-localhost enforcement for non-staging builds.  
2. **`JwtKeyResolver` + `HostingSecretGuard`** — reject weak JWT keys outside Development.  
3. **Swagger** — Development only.  
4. **Support bundle sanitization** — token/ticket stripping with tests.  
5. **SSE ticket flow** — client migrated; server rate limits ticket minting.  
6. **Default auth policy** — authenticated unless `[AllowAnonymous]`.  
7. **DEV baseline validated** — offline sync, S3 upload, queue drain @ `6e4018c3`.  
8. **Staging secrets** — AWS Secrets Manager for JWT/admin on DEV (when configured).  
9. **Public frontend URL logic** — blocks deprecated hosts for QR/email links.  
10. **IndexedDB upgrades** — additive-only schema changes.

---

## Open items from prior engagement (explicitly deferred)

These are **not closed**; they were out of scope for #324 and remain separate work:

| Item | Status |
|------|--------|
| Stale asset 404 recurrence | Open |
| SSE duplicate tickets (`useSseEvents.ts`) | Open |
| UIKit warnings (iOS) | Open |
| Health-request duplication / ping storm | Open |
| CI frontend lint (`NotificationInboxContext.tsx`) | Open |
| PR #322 workflow completion email toggle | Draft, not merged |

---

## Final answers

### Is Strata N-Go ready to begin Dev/Production separation?

**YES.**

DEV is stable at baseline `6e4018c3`. This audit identifies what must differ between environments. Separation can proceed using the implementation plan, treating existing `staging-*` AWS resources as **DEV** and creating new isolated **PRODUCTION** resources. Do **not** rename staging resources to dev.

### Is Strata N-Go currently ready for real Production users?

**NO.**

P0 blockers include: no prod infrastructure, debug UI exposed to all users, seed password fallbacks, CORS fail-open paths, legacy SSE JWT URLs, personal mobile bundle ID, and domain confusion (`www` serving DEV today). Offline/sync behaviour on DEV is strong, but production security, configuration, and release identity are not yet sufficient.

---

## Recommended next steps (after review — not part of this audit)

1. Christian/Mac review and sign-off on this document.  
2. Prioritize P0 items in the implementation plan **before** DNS pointing `www.strata-ngo.com` at production.  
3. Implement environment separation (Phase 2+) without changing the validated DEV baseline until prod is proven.  
4. Re-run device acceptance on **N-Go Dev** and **N-Go** lanes after separation.  
5. Address deferred open items (SSE, health ping, etc.) on a separate track.

---

*Audit performed read-only against repository `main` @ `6e4018c3e8ec6cdb87ef26c07693cf5cfa259d7f`. No passwords, JWTs, or secret values are recorded in this document.*
