# Cloud move — execution plan

**Goal:** Stop re-discovering “missing pieces” on every machine (Windows → Mac → Docker). Establish **one canonical staging environment** (Postgres + S3 + HTTPS), fix remaining gaps **only there**, then cut over to production and store releases.

**Principle:** Local dev stays fast; **staging is truth**. Nothing is “done” until it passes staging web + at least one phone build against staging.

**Related docs (already in repo):**

| Doc | Use |
|-----|-----|
| [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md) | Local Docker staging first |
| [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md) | Gate before AWS production |
| [`CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`](./CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md) | RDS, S3, App Runner, CloudFront |
| [`CLOUD_HOSTING_AWS_PLAN.md`](./CLOUD_HOSTING_AWS_PLAN.md) | Background / phase status |
| [`CLEAN_DATA_RESET.md`](./CLEAN_DATA_RESET.md) | Seed profiles today |

---

## Tracks (run in parallel after Phase 1)

| Track | Owner focus | Done when |
|-------|-------------|-----------|
| **A — Staging stack** | Infra + API + web on HTTPS | Pre-deploy checklist A + C + critical W items PASS |
| **B — Fresh seed** | Product/catalog you want on first boot | `SeedProfile` matches your list; wipe + standup reproduces it |
| **C — Mobile stores** | Capacitor + Apple/Google | TestFlight + Play internal testing against **staging API** |
| **D — Polish** | UI / S8 / small fixes | Only merged after validated on staging (no new local-only targets) |

Do **not** start large refactors (S8 structure, design-system sweeps) until Track A staging is stable — otherwise cloud bugs and refactor bugs cannot be separated.

---

## Phase 0 — Lock the rules (½ day)

**Outcome:** Everyone agrees how “done” is measured.

- [ ] **P0.1** Staging URL(s) chosen (even if temporary): `https://staging-api.<domain>/api`, `https://staging.<domain>`
- [ ] **P0.2** Production seed profile name locked: **`StrataNgo`** for staging/prod fresh DB (unless you rename in Phase 1)
- [ ] **P0.3** No more new deployment targets (no “try on Mac only” sign-off)
- [ ] **P0.4** Sign-off template copied from [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md) §5 into a shared doc/spreadsheet for waivers

---

## Phase 1 — Fresh seed (your changes first)

**Outcome:** Wiping Postgres/MinIO and standing up Docker staging yields **exactly** the catalog you want — no demo junk, no surprises.

**Current `SeedProfile=StrataNgo` ships** (see `StrataNgoSeeder.cs`):

- Users: Admin + PM (`admin@StrataNgo.local`, `project.manager@StrataNgo.local`)
- 2 offices, 2 customers, 3 Strata divisions, 6 products
- `Chambers_default` published workflow
- **No** sample project/assets (by design)
- **No** tips/documents

### 1A — Fill in seed wishlist (you)

Edit **[`CLOUD_MOVE_SEED_WISHLIST.md`](./CLOUD_MOVE_SEED_WISHLIST.md)** with desired changes. Examples:

- User roles/emails/passwords (via secrets in cloud, not git)
- Offices / customers / division names
- Product list and which get Chambers workflow
- Optional: one **small** starter project (job number, 3–5 assets) — yes/no
- Brand settings defaults
- Anything to **remove** from current StrataNgo seed

**Gate:** Wishlist reviewed; implementation PR(s) merged before Phase 2 cloud standup.

### 1B — Implement seed changes (agent/dev)

- [ ] **P1.1** Update `StrataNgoSeeder.cs` (+ seed JSON if needed) per wishlist
- [ ] **P1.2** Update `docs/CLEAN_DATA_RESET.md` and Docker standup login table if emails change
- [ ] **P1.3** Verify: `docker compose … down -v` → `./scripts/standup-staging.sh --build-web` → DB matches wishlist
- [ ] **P1.4** Document reset procedure for AWS (new RDS snapshot / empty DB + migrate + seed)

---

## Phase 2 — Local Docker staging (canonical parity)

**Outcome:** Postgres + MinIO + API + web on your machine matches cloud **config profile** (not necessarily AWS yet).

**Commands:**

```bash
git pull origin main
./scripts/standup-staging.sh --build-web   # Mac/Linux
# or .\scripts\standup-staging.ps1 -BuildWeb   # Windows
```

**Verify:**

| ID | Check | PASS |
|----|-------|------|
| P2.1 | `curl http://localhost:8080/api/health` | `databaseProvider: Postgres` |
| P2.2 | Web http://localhost:5174 — login | Admin + PM work |
| P2.3 | Upload document + preview | MinIO object exists |
| P2.4 | Start workflow run → photo → lock → sign | No 500; asset status updates |
| P2.5 | Paper completion (Close with document) | Asset closes; doc in library |
| P2.6 | `dotnet test server/Commtrac.Api.Tests` | All pass |
| P2.7 | `npm run build:cloud-web:staging` (if script exists) or build with `.env.staging.docker.example` | dist/ OK |

**Fix blockers on `main` only; re-run standup after each fix.**

Phone against Docker (optional here, required before AWS):

- Native build with `VITE_API_BASE=http://<LAN-IP>:8080/api`
- Checklist P1–P5 from pre-deploy doc

**Gate:** Phase 2 table all PASS (waivers documented).

---

## Phase 3 — AWS staging (single source of truth)

**Outcome:** HTTPS staging that the whole team (and TestFlight) uses.

Follow [`CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`](./CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md):

1. [ ] **P3.1** RDS Postgres (empty)
2. [ ] **P3.2** S3 media bucket + IAM
3. [ ] **P3.3** Secrets Manager: JWT, DB, `SeedAdmin`, `SeedProjectManager`, `SeedProfile=StrataNgo`
4. [ ] **P3.4** Run `scripts/cloud-migrate.sh` (or `.ps1`) — **not** `RunMigrationsOnStartup` on multi-instance
5. [ ] **P3.5** App Runner **single instance** (SSE is in-memory today)
6. [ ] **P3.6** CloudFront + S3 static web; `Cors:AllowedOrigins` includes staging web origin
7. [ ] **P3.7** Web build: `VITE_API_BASE=https://staging-api.<domain>/api`
8. [ ] **P3.8** Settings → Notifications → Frontend Base URL = staging web URL

**Run full checklist:** [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md) sections 1–4 on staging URLs.

**Known cloud blockers to fix in this phase if they fail:**

- Email / invite links (SMTP or Resend)
- CORS for browser + Capacitor WebView
- S3 upload/download paths
- Postgres-only code paths (search index, any skipped `Ensure*`)

**Gate:** Pre-deploy sign-off (checklist §5) with staging URLs + commit hash.

---

## Phase 4 — Mobile store prep (parallel after Phase 3 staging is up)

**Do not submit to review until staging P1–P6 pass.**

| Step | Action |
|------|--------|
| P4.1 | iOS + Android release builds with **staging** `VITE_API_BASE` (HTTPS) |
| P4.2 | TestFlight + Play **internal testing** — same API as web staging |
| P4.3 | Privacy policy URL, app icons, screenshots (store assets) |
| P4.4 | Offline/sync smoke on real devices (checklist P1–P8) |
| P4.5 | Switch production build to **production API** only after Phase 5 |

Apple/Google care about crashes, login, permissions, and privacy — not whether S8 refactors are done.

---

## Phase 5 — Production cutover

- [ ] **P5.1** Production secrets + `SeedProfile` decision (fresh prod vs migrated data)
- [ ] **P5.2** Repeat migrate job on prod RDS; deploy API + web
- [ ] **P5.3** Smoke subset on prod (login, health, one workflow, one upload)
- [ ] **P5.4** Store releases point at **production** API
- [ ] **P5.5** Monitor fault reports + logs (CloudWatch); 48h watch

---

## Phase 6 — Remaining polish (online)

After staging/prod are stable:

- Dashboard / installations polish
- S8 extractions (one PR at a time, each verified on staging)
- Excellence programme items that are **not** cloud blockers

**Rule:** Every polish PR includes “Verified on staging: yes/no + date”.

---

## What we stop doing

| Stop | Do instead |
|------|------------|
| “Works on my Windows laptop” as final sign-off | Run standup or hit AWS staging |
| Fixing the same bug separately on Mac, Docker, Windows | One fix on `main`, verify Docker standup |
| Big refactors during cloud bring-up | Phase 6 only |
| Adding demo seed to production | Wishlist-controlled `StrataNgo` only |

---

## Immediate next actions (this week)

| # | Action | Who |
|---|--------|-----|
| 1 | Fill [`CLOUD_MOVE_SEED_WISHLIST.md`](./CLOUD_MOVE_SEED_WISHLIST.md) | You |
| 2 | Implement seed wishlist → PR | Agent/dev |
| 3 | Run `./scripts/standup-staging.sh --build-web`; fix blockers | Whoever has Docker |
| 4 | Pick staging domain / AWS account; start runbook §1–3 | Infra |
| 5 | Freeze “polish” that doesn’t block checklist W1–W7 / P1–P5 | Team |

---

## Progress log

| Date | Phase | Notes |
|------|-------|-------|
| 2026-08-19 | Plan created | Execution plan added; seed wishlist waiting on product input |

_Update this table as phases complete._
