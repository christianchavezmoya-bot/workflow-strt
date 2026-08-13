# Mac agent — Docker cloud-shaped staging (verify)

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `main` @ **`6b4078f`** (or newer — must include PRs #173–#179)  
**Guide:** [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md)  
**Pre-deploy (after this passes):** [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md)  
**Windows equivalent:** [`WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md`](./WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md)  
**Phone checks (later):** [`IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`](./IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md)  

**Login (Strata NGO seed):** `admin@StrataNgo.local` / `Admin123!`  
**PM login:** `project.manager@StrataNgo.local` / `Pm123!`

**Goal:** Confirm the **Docker “cloud-shaped” stack** runs correctly on this Mac — Postgres + MinIO (S3) + API on **8080** + web on **5174**, with the **Strata NGO demo seed** and **BOM module** enabled. This is **not** the old Sqlite + `dotnet run` on port 4000.

---

## PROMPT START

You are the **Mac Docker staging agent** for Commtrac cloud hosting.

### Two modes — do not mix them

| | **Old local dev** | **Docker cloud-shaped staging** (this prompt) |
|---|---|---|
| Start | `dotnet run` + `npm run dev` | `./scripts/standup-staging.sh --build-web` |
| API port | **4000** | **8080** |
| Web URL | http://localhost:**5173** | http://localhost:**5174** |
| Database | Sqlite | Postgres (container) |
| Files | `Storage/` folder | MinIO / S3 (container) |

**If the browser is on 5173 and API calls go to `:4000`, you are NOT testing Docker staging.**

---

## Part 0 — Pull + prerequisites (~2 min)

```bash
cd ~/path/to/workflow-strt   # adjust path
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
# expect: 6b4078f Merge pull request #179 ...  (or newer)
```

**If `git pull` fails** (local changes would be overwritten):

```bash
git stash push -m "local wip before staging verify"
git pull origin main
# stash pop later if needed: git stash pop
```

| Prerequisite | Check |
|--------------|-------|
| Docker Desktop | Running (whale icon in menu bar) |
| Ports free | Nothing else using **8080**, **5174**, **9001** |
| Old dev stopped | Stop any `dotnet run` on 4000 if you want a clean test (optional but clearer) |

Verify Docker works:

```bash
docker version
docker compose version
chmod +x scripts/standup-staging.sh
```

| ID | PASS if |
|----|---------|
| R0 | `git log -1` shows #179 merge or newer (includes #175–#178 parity fixes + Strata seed) |
| R1 | `docker version` succeeds |
| R2 | Docker Desktop is running |

---

## Part 1 — Fresh Strata NGO seed (required first run)

The Strata demo seed runs **only on a fresh Postgres volume**. If you previously stood up staging with the old Commtrac seed, wipe data first:

```bash
docker compose -f docker-compose.staging.yml down -v
```

Then confirm volumes are gone:

```bash
docker volume ls | grep commtrac_staging || echo "no staging volumes — good for fresh seed"
```

| ID | PASS if |
|----|---------|
| R3 | `down -v` completed; no stale `commtrac_staging_pgdata` if you intended a fresh run |

**Skip `down -v`** only if you already verified Strata seed on this volume and want to keep existing data.

---

## Part 2 — Is staging already running? (~1 min)

Run **before** starting anything new (after Part 1 if you wiped volumes):

```bash
docker ps --filter "name=commtrac-staging" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

```bash
curl -s http://localhost:8080/api/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8080/api/health
```

| Container name | Expected |
|----------------|----------|
| `commtrac-staging-api` | Up |
| `commtrac-staging-postgres` | Up (healthy) |
| `commtrac-staging-minio` | Up; ports 9000–9001 |
| `commtrac-staging-web` | Up if `--build-web` was used; port **5174→80** |

| ID | PASS if |
|----|---------|
| S0 | `commtrac-staging-api` container is **Up** |
| S1 | Health at http://localhost:8080/api/health → `"status":"healthy"` |
| S2 | Health JSON includes `"databaseProvider":"Postgres"` (or equivalent Postgres indicator) |

**If S0–S2 fail:** staging is **not** running → go to Part 3.

**If S0–S2 pass:** skip Part 3 start; go to Part 4 verification.

---

## Part 3 — Start Docker staging (~5–15 min first time)

From repo root:

```bash
./scripts/standup-staging.sh --build-web
```

What this does:
1. `docker compose -f docker-compose.staging.yml up -d --build` — Postgres, MinIO, API (`ENABLE_BOM_PROJECT_MODULE=true`)
2. Waits for API health on **8080**
3. Creates `.env.staging.local` from docker example if missing (`VITE_ENABLE_BOM_MODULE=true`)
4. Builds web with `VITE_API_BASE=http://localhost:8080/api`
5. Starts nginx web on **5174**

**Watch for errors.** If the script fails:

```bash
docker compose -f docker-compose.staging.yml logs api --tail 80
docker compose -f docker-compose.staging.yml logs postgres --tail 40
```

| ID | PASS if |
|----|---------|
| S3 | Script completes without error |
| S4 | `curl -s http://localhost:8080/api/health` → healthy + Postgres |
| S5 | Browser opens http://localhost:5174 → login page loads (not blank / not 502) |

**Do not use `npm run dev` on 5173 for this test** — unless you copy `.env.staging.docker.example` → `.env.staging.local` first; default browser dev targets port 4000, not 8080.

---

## Part 4 — Web verification on staging (5174)

Open **Chrome or Safari**, wide window. URL: **http://localhost:5174**

Login: `admin@StrataNgo.local` / `Admin123!`

Open DevTools → Network. Confirm API calls go to **`localhost:8080`**, not `:4000`.

### Core staging checks

| ID | Area | Steps | PASS if |
|----|------|-------|---------|
| W0 | Mode check | Debug panel or Network tab | `api.baseUrl` / requests use **8080** |
| W1 | Auth | Login / logout | Dashboard loads; no redirect loop |
| W2 | Dashboard | Load dashboard | No flood of Network Error in console |
| W3 | Strata seed | Settings → brand / Admin tables | App name **Strata N-Go**; 2 offices (Newcastle, Perth); customer **BHP/Mining** |
| W4 | Workflows | Admin → Workflows | **Chambers_default** workflow exists (Published, 10 steps) on Chambers product |
| W5 | Documents | Upload small PDF or image | Upload succeeds; preview/download works (**S3/MinIO**) |
| W6 | Admin | Admin → Users tab | Page loads; admin + PM users present |
| W7 | Health (browser) | Visit http://localhost:8080/api/health | JSON healthy, Postgres |
| W8 | MinIO console | http://localhost:9001 login `commtrac` / `commtrac_dev` | Console loads; bucket `commtrac-staging` exists |
| W9 | Backups API | `curl http://localhost:8080/api/backups` (with auth if needed) | **501** on Postgres is **expected** (SQLite backups disabled) |

### Mac parity fixes (PRs #175–#177)

| ID | Area | Steps | PASS if |
|----|------|-------|---------|
| P1 | Issue dedupe | Dashboard open-issues count vs Issues Board | Same issue not counted twice (run + asset source) |
| P2 | Project columns | Projects list column picker | No duplicate **Customer**, **Job Number**, **Status**, **Global Offices** vs dynamic fields |
| P3 | Workflow labels | Workflows screen + builder | User-facing text says **Workflow** (not “Work Instruction”); builder toggle says **List** |

### BOM module (PR #179)

| ID | Area | Steps | PASS if |
|----|------|-------|---------|
| B1 | BOM sidebar | Admin logged in | **Admin → BOM Project** appears in sidebar |
| B2 | BOM page | Open BOM Project | Page loads; no 503 from API |
| B3 | PM access | Login as `project.manager@StrataNgo.local` / `Pm123!` | PM also sees BOM (role default) |

**Known noise (ignore):**
- `favicon.ico 404` on 5174 — harmless
- No tips/documents seeded — empty Tips/Documents is expected
- BHP / business logos not seeded — Settings may show no logo image

**Blockers:** `ERR_CONNECTION_REFUSED` on **8080**, CORS errors, upload fails, login loop, BOM 503, Strata seed missing after fresh `-v` run.

---

## Part 5 — Optional: confirm old dev still works (~3 min)

After Docker staging verification, optionally confirm default dev was not broken:

```bash
# Stop Docker staging first (avoids port confusion)
docker compose -f docker-compose.staging.yml down

cd server/Commtrac.Api
dotnet run
```

New terminal: `npm run dev` → http://localhost:5173 → login (`admin@commtrac.local` / `Admin123!` on Sqlite seed).

| ID | PASS if |
|----|---------|
| D0 | http://localhost:4000/api/health → healthy (Sqlite) |
| D1 | Login on 5173 works |

Then you can bring Docker staging back:

```bash
./scripts/standup-staging.sh --build-web
```

---

## Part 6 — Optional: phone against Docker API on LAN

For native iPhone testing against this Mac’s Docker API (not localhost on device):

1. Find Mac LAN IP: `ipconfig getifaddr en0` (Wi‑Fi) or `en1`
2. Ensure Docker publishes `8080:8080` (default in compose)
3. macOS firewall: allow incoming on 8080 if prompted
4. Build native with **untracked** `.env.production.local`:

```bash
echo "VITE_API_BASE=http://$(ipconfig getifaddr en0):8080/api" > .env.production.local
npm run build
npx cap sync ios
```

5. Run on physical iPhone from Xcode; use same Strata NGO logins

See [`IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`](./IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md) for full phone matrix (P1–P8).

---

## Part 7 — Automated gates (optional)

```bash
cd server/Commtrac.Api && dotnet build
cd ../.. && npx tsc -b
cp .env.staging.docker.example .env.staging.local
npm run build:cloud-web:staging
```

**Note:** `dotnet test` may fail on some setups. Report result but do not block staging sign-off if Docker + web checks pass.

---

## Part 8 — Teardown (when done)

```bash
docker compose -f docker-compose.staging.yml down
# Wipe DB + MinIO for completely fresh Strata seed next time:
# docker compose -f docker-compose.staging.yml down -v
```

---

## Report format (paste back to cloud agent / PR)

```
Docker staging Mac @ <git hash>

PREREQS
R0 pull (#179+): PASS / FAIL
R1 docker: PASS / FAIL
R2 docker desktop: PASS / FAIL
R3 fresh volume (-v): PASS / FAIL / SKIPPED

ALREADY RUNNING (Part 2)
S0 containers: PASS / FAIL — <list container names or "none">
S1 health 8080: PASS / FAIL
S2 Postgres provider: PASS / FAIL

STANDUP (Part 3)
S3 script: PASS / FAIL / SKIPPED (already up)
S4 health after start: PASS / FAIL
S5 web 5174 loads: PASS / FAIL

WEB STAGING (Part 4)
W0 api host 8080: PASS / FAIL
W1 auth: PASS / FAIL
W2 dashboard: PASS / FAIL
W3 strata seed: PASS / FAIL
W4 chambers workflow: PASS / FAIL
W5 upload S3: PASS / FAIL
W6 admin users: PASS / FAIL
W7 health browser: PASS / FAIL
W8 minio console: PASS / FAIL
W9 backups 501: PASS / FAIL / SKIPPED

PARITY FIXES
P1 issue dedupe: PASS / FAIL
P2 project columns: PASS / FAIL
P3 workflow labels: PASS / FAIL

BOM
B1 sidebar: PASS / FAIL
B2 page load: PASS / FAIL
B3 PM access: PASS / FAIL / SKIPPED

DEFAULT DEV (Part 5 — optional)
D0 Sqlite health: PASS / FAIL / SKIPPED
D1 login 5173: PASS / FAIL / SKIPPED

AUTOMATED
dotnet build: PASS / FAIL
tsc -b: PASS / FAIL
build:cloud-web:staging: PASS / FAIL / SKIPPED

URLs used:
  Web:  http://localhost:5174
  API:  http://localhost:8080/api
  MinIO: http://localhost:9001

Blockers: none / <list>
Next: AWS staging runbook OR iPhone P1–P8 against http://<LAN-IP>:8080/api
```

**Rules:** Do not commit LAN IPs, `.env.production.local`, `.env.staging.local`, or secrets. Screenshot MinIO bucket + health JSON + Strata seed screens if anything fails.

## PROMPT END
