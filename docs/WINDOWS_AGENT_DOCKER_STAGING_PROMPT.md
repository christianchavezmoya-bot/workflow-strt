# Windows agent — Docker cloud-shaped staging (verify)

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `main` @ **`a18f91d`** (or newer — must include PR #173 staging standup)  
**Guide:** [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md)  
**Pre-deploy (after this passes):** [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md)  
**Mac prompt (phone checks later):** [`IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`](./IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md)  
**Login:** `admin.dev@stratango.local` / `Admin123!`

**Goal:** Confirm the **Docker “cloud-shaped” stack** runs correctly on this PC — Postgres + MinIO (S3) + API on **8080** + web on **5174**. This is **not** the old Sqlite + `dotnet run` on port 4000.

---

## PROMPT START

You are the **Windows Docker staging agent** for Commtrac cloud hosting.

### Two modes — do not mix them

| | **Old local dev** | **Docker cloud-shaped staging** (this prompt) |
|---|---|---|
| Start | `dotnet run` + `npm run dev` | `.\scripts\standup-staging.ps1 -BuildWeb` |
| API port | **4000** | **8080** |
| Web URL | http://localhost:**5173** | http://localhost:**5174** |
| Database | Sqlite | Postgres (container) |
| Files | `Storage/` folder | MinIO / S3 (container) |

**If the browser is on 5173 and API calls go to `:4000`, you are NOT testing Docker staging.**

---

## Part 0 — Pull + prerequisites (~2 min)

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt   # adjust path
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
# expect: a18f91d Merge pull request #173 ...  (or newer)
```

**If `git pull` fails** (local changes would be overwritten):

```powershell
git stash push -m "local wip before staging verify"
git pull origin main
# stash pop later if needed: git stash pop
```

| Prerequisite | Check |
|--------------|-------|
| Docker Desktop | Running (whale icon in system tray) |
| Ports free | Nothing else using **8080**, **5174**, **9001** |
| Old dev stopped | Stop any `dotnet run` on 4000 if you want a clean test (optional but clearer) |

Verify Docker works:

```powershell
docker version
docker compose version
```

| ID | PASS if |
|----|---------|
| R0 | `git log -1` shows #173 merge or newer |
| R1 | `docker version` succeeds |
| R2 | Docker Desktop is running |

---

## Part 1 — Is staging already running? (~1 min)

Run **before** starting anything new:

```powershell
docker ps --filter "name=commtrac-staging" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

```powershell
try {
  Invoke-RestMethod http://localhost:8080/api/health | ConvertTo-Json
} catch {
  Write-Host "API on 8080 not reachable: $_"
}
```

| Container name | Expected |
|----------------|----------|
| `commtrac-staging-api` | Up |
| `commtrac-staging-postgres` | Up (healthy) |
| `commtrac-staging-minio` | Up; ports 9000–9001 |
| `commtrac-staging-web` | Up if `-BuildWeb` was used; port **5174→80** |

| ID | PASS if |
|----|---------|
| S0 | `commtrac-staging-api` container is **Up** |
| S1 | Health at http://localhost:8080/api/health → `"status":"healthy"` |
| S2 | Health JSON includes `"databaseProvider":"Postgres"` (or equivalent Postgres indicator) |

**If S0–S2 fail:** staging is **not** running → go to Part 2.

**If S0–S2 pass:** skip Part 2 start; go to Part 3 verification.

---

## Part 2 — Start Docker staging (~5–15 min first time)

From repo root:

```powershell
.\scripts\standup-staging.ps1 -BuildWeb
```

What this does:
1. `docker compose -f docker-compose.staging.yml up -d --build` — Postgres, MinIO, API
2. Waits for API health on **8080**
3. Builds web with `VITE_API_BASE=http://localhost:8080/api`
4. Starts nginx web on **5174**

**Watch for errors.** If the script fails:

```powershell
docker compose -f docker-compose.staging.yml logs api --tail 80
docker compose -f docker-compose.staging.yml logs postgres --tail 40
```

| ID | PASS if |
|----|---------|
| S3 | Script completes without error |
| S4 | `Invoke-RestMethod http://localhost:8080/api/health` → healthy + Postgres |
| S5 | Browser opens http://localhost:5174 → login page loads (not blank / not 502) |

**Do not use `npm run dev` on 5173 for this test** — localhost browser dev always targets port 4000, not 8080.

---

## Part 3 — Web verification on staging (5174)

Open **Chrome**, wide window. URL: **http://localhost:5174**

Login: `admin.dev@stratango.local` / `Admin123!`

Open DevTools → Network. Confirm API calls go to **`localhost:8080`**, not `:4000`.

| ID | Area | Steps | PASS if |
|----|------|-------|---------|
| W0 | Mode check | Debug panel or Network tab | `api.baseUrl` / requests use **8080** |
| W1 | Auth | Login / logout | Dashboard loads; no redirect loop |
| W2 | Dashboard | Load dashboard | No flood of Network Error in console |
| W3 | Projects | Open a project | Data loads (may be empty on fresh Postgres) |
| W4 | Documents | Upload small PDF or image | Upload succeeds; preview/download works (**S3/MinIO**) |
| W5 | Admin | Admin → Users tab | Page loads; no endless Network Error |
| W6 | Health (browser) | Visit http://localhost:8080/api/health | JSON healthy, Postgres |
| W7 | MinIO console | http://localhost:9001 login `commtrac` / `commtrac_dev` | Console loads; bucket `commtrac-staging` exists |
| W8 | Backups API | Admin/settings area or `curl http://localhost:8080/api/backups` (with auth if needed) | **501** on Postgres is **expected** (SQLite backups disabled) |

**Known noise (ignore):**
- `favicon.ico 404` on 5174 — harmless
- Fresh Postgres DB may have no projects/assets — W3 can PASS with empty state if API returns 200

**Blockers:** `ERR_CONNECTION_REFUSED` on **8080**, CORS errors, upload fails, login loop.

---

## Part 4 — Optional: confirm old dev still works (~3 min)

After Docker staging verification, optionally confirm default dev was not broken:

```powershell
# Stop Docker staging first (avoids port confusion)
docker compose -f docker-compose.staging.yml down

cd server\Commtrac.Api
dotnet run
```

New terminal: `npm run dev` → http://localhost:5173 → login.

| ID | PASS if |
|----|---------|
| D0 | http://localhost:4000/api/health → healthy (Sqlite) |
| D1 | Login on 5173 works |

Then you can bring Docker staging back: `.\scripts\standup-staging.ps1 -BuildWeb`

---

## Part 5 — Automated gates (optional)

```powershell
cd server\Commtrac.Api
dotnet build
```

```powershell
npx tsc -b
```

**Note:** `dotnet test` may fail on some Windows setups (Event Log permissions). Report result but do not block staging sign-off if Docker + web checks pass.

---

## Part 6 — Teardown (when done)

```powershell
docker compose -f docker-compose.staging.yml down
# Wipe DB + MinIO data for a completely fresh run:
# docker compose -f docker-compose.staging.yml down -v
```

---

## Report format (paste back to cloud agent / PR)

```
Docker staging Windows @ <git hash>

PREREQS
R0 pull (#173+): PASS / FAIL
R1 docker: PASS / FAIL

ALREADY RUNNING (Part 1)
S0 containers: PASS / FAIL — <list container names or "none">
S1 health 8080: PASS / FAIL
S2 Postgres provider: PASS / FAIL

STANDUP (Part 2)
S3 script: PASS / FAIL / SKIPPED (already up)
S4 health after start: PASS / FAIL
S5 web 5174 loads: PASS / FAIL

WEB STAGING (Part 3)
W0 api host 8080: PASS / FAIL
W1 auth: PASS / FAIL
W2 dashboard: PASS / FAIL
W3 projects: PASS / FAIL
W4 upload S3: PASS / FAIL
W5 admin users: PASS / FAIL
W6 health browser: PASS / FAIL
W7 minio console: PASS / FAIL
W8 backups 501: PASS / FAIL / SKIPPED

DEFAULT DEV (Part 4 — optional)
D0 Sqlite health: PASS / FAIL / SKIPPED
D1 login 5173: PASS / FAIL / SKIPPED

AUTOMATED
dotnet build: PASS / FAIL
dotnet test: PASS / FAIL (<n> passed) / SKIPPED
tsc -b: PASS / FAIL

URLs used:
  Web:  http://localhost:5174
  API:  http://localhost:8080/api
  MinIO: http://localhost:9001

Blockers: none / <list>
Next: Mac agent phone checks (P1–P8) against http://<LAN-IP>:8080/api OR AWS staging runbook
```

**Rules:** Do not commit LAN IPs, `.env.production.local`, or secrets. Screenshot MinIO bucket + health JSON if anything fails.

## PROMPT END
