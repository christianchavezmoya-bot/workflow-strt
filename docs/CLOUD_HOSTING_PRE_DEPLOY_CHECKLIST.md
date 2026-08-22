# Cloud hosting — pre-deploy verification (web + phone)

**Do not deploy to AWS until this checklist is PASS** on a staging environment that matches production config (Postgres, S3, HTTPS, prod `VITE_API_BASE`).

Prep docs: [`CLOUD_HOSTING_AWS_PLAN.md`](./CLOUD_HOSTING_AWS_PLAN.md) · Standup: [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md) · Agent prompts: [`WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md`](./WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md) · [`IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`](./IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md)

---

## When to run this

| Stage | What to run |
|-------|-------------|
| **During prep** (now) | Default dev + optional Docker profiles (Postgres, MinIO) — see Windows agent prompt |
| **Before AWS deploy** | **This full checklist** against staging URL + staging native build |
| **After AWS deploy** | Smoke subset on production (login, health, one workflow path) |

---

## 0 — Prep must be complete

- [ ] Phases 0–2 code merged on `main` (secrets, Postgres provider, S3 provider, Dockerfile)
- [ ] Staging API uses **Postgres** + **S3** (or MinIO parity passed locally)
- [ ] `Database:RunMigrationsOnStartup=false` in Production; migrations run via CI/`scripts/cloud-migrate.*`
- [ ] Secrets in AWS Secrets Manager / env (JWT, DB, SeedAdmin) — not in git
- [ ] `Cors:AllowedOrigins` includes staging web origin
- [ ] Web built with staging `VITE_API_BASE` (see `.env.production.example`)
- [ ] Native built with same API URL in `.env.production.local` (untracked)
- [ ] **Single instance** for v1 (SSE hub is in-memory — multi-instance needs Phase 4 work)

---

## 1 — Automated gates (Windows / CI)

Run from repo root unless noted.

| ID | Command | PASS if |
|----|---------|---------|
| A1 | `dotnet build` (server) | 0 errors |
| A2 | `dotnet test server/Commtrac.Api.Tests` | All passed |
| A3 | `npx tsc -b` | 0 errors |
| A4 | `npm run build` with staging `VITE_API_BASE` set | `dist/` produced |
| A5 | `curl https://<staging-api>/api/health` | 200; `databaseProvider: Postgres` |
| A6 | Optional: `COMMTRAC_POSTGRES_TEST=1 dotnet test` (local Docker) | Migrations apply |

Optional Playwright (needs seeded field data):

```powershell
node scripts/seed-workflow-smoke-data.mjs
npm run test:e2e:workflow-consistency
```

---

## 2 — Web app full check (staging URL)

Use **desktop Chrome**, wide window. Login with real staging accounts (Admin + PM + Engineer).

| ID | Area | Steps | PASS if |
|----|------|-------|---------|
| W1 | Auth | Login / logout | No redirect loop; JWT refresh works |
| W2 | Dashboard | Load dashboard widgets | Data loads; no 500 on notifications |
| W3 | Projects | Open project; chevron panel | Project detail; report dialog opens |
| W4 | Assets / Capture | Asset list; edit column; save | Saves persist after refresh |
| W5 | Workflow | Start or resume run; complete a step with photo | Photo displays; run saves |
| W6 | Signatures | Installer sign flow (test run) | Status updates; no 401 mid-flow |
| W7 | Documents | Upload + preview PDF/image | Download/preview works (S3 backend) |
| W8 | Issues | Issues board; filter; export PDF/Excel | Export downloads |
| W9 | Search | Global search for known asset/doc term | Results return |
| W10 | Admin | Settings; users list | Loads; backup API returns 501 on Postgres (expected) |
| W11 | SSE | Leave dashboard open 2+ min | Live updates or graceful reconnect (note failures) |

**Blockers:** Any 500 on core paths, broken login, uploads failing on S3, CORS errors in console.

---

## 3 — Phone app full check (N-go / Capacitor)

Physical **iPhone** and **Android** if both ship. Install build with staging `VITE_API_BASE`.

| ID | Area | Steps | PASS if |
|----|------|-------|---------|
| P1 | Auth | Login; background app; return | Session retained; biometric/PIN if enabled |
| P2 | Sync | Sync Center; Sync Now | Queue drains; no false offline |
| P3 | Offline | Airplane mode; open project assets | Cached data usable |
| P4 | Offline write | Edit run / capture offline; go online | Sync succeeds; no ghost runs |
| P5 | Workflow | Full run with photo + signature steps | Photos in run; complete works |
| P6 | Documents | Preview PDF/image on device | Renders (native preview paths) |
| P7 | Push | Optional: trigger notification | Received if push configured |
| P8 | Cold start | Kill app; offline launch | Workspace/bootstrap sane |

**Blockers:** Crash on login, sync deadlock, photos missing after sync, 401 after unlock.

---

## 4 — Cloud-specific staging checks

| ID | Check | PASS if |
|----|-------|---------|
| C1 | HTTPS | Web → API calls use HTTPS; no mixed content | |
| C2 | CORS | Browser app on staging domain hits API | No CORS preflight failures |
| C3 | S3 | Upload doc; verify object in bucket | File retrievable via app |
| C4 | Postgres | Create entity; restart API pod | Data persists |
| C5 | Migrations | Deploy new instance with `RunMigrationsOnStartup=false` | Starts clean after CI migrate job |
| C6 | Docker | `docker build` + run image on 8080 | Health 200 |
| C7 | SSE soak | 30+ min session with dashboard | Acceptable behavior documented |

---

## 5 — Sign-off (required before AWS production cutover)

```
PRE-DEPLOY SIGN-OFF
Date:
Staging API: https://...
Staging web: https://...
Commit: <hash>

Automated A1–A5: PASS / FAIL
Web W1–W11: PASS / FAIL (waivers: ...)
Phone P1–P8: PASS / FAIL (waivers: ...)
Cloud C1–C7: PASS / FAIL (waivers: ...)

Signed off by: _______________
Deploy approved: YES / NO
```

**If NO:** fix blockers, re-run failed sections, do not promote to production.

---

## 6 — After production deploy (smoke only)

| ID | Check |
|----|-------|
| R1 | `/api/health` on prod |
| R2 | Admin login web + phone |
| R3 | One workflow path end-to-end |
| R4 | Rollback plan documented (RDS snapshot, previous image tag) |

---

## Quick local prep (before staging exists)

Still on Sqlite + local disk — confirms prep did not break dev:

```powershell
cd server\Commtrac.Api && dotnet run
npm run dev
# login admin@commtrac.local / Admin123!
```

Docker parity (optional): `docker compose up -d postgres minio` → `PostgresLocal` / `S3Local` profiles (see `server/README.md`).
