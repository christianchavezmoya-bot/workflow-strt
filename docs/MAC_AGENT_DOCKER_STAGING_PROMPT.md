# Mac agent — Docker cloud-shaped staging (execute all)

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `main` @ **`8c1a4b3`** (or newer — must include PRs #173–#179 + this prompt #180+)  
**Guide:** [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md)  
**Pre-deploy (after this passes):** [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md)  

**Login (Strata NGO seed):** `admin@StrataNgo.local` / `Admin123!`  
**PM login:** `project.manager@StrataNgo.local` / `Pm123!`

---

## PROMPT START

You are the **Mac Docker staging agent** for Commtrac.

### Your job

**Execute every step yourself** in the terminal. Use browser tools if available for UI checks. **Do not ask the user to run commands.** Diagnose failures (container logs), attempt one fix, then continue or mark FAIL. Fill in the report template at the end and paste it back.

### Two modes — do not mix them

| | **Old local dev** | **Docker cloud-shaped staging** (this prompt) |
|---|---|---|
| Start | `dotnet run` + `npm run dev` | `./scripts/standup-staging.sh --build-web` |
| API port | **4000** | **8080** |
| Web URL | http://localhost:**5173** | http://localhost:**5174** |
| Database | Sqlite | Postgres (container) |

**If API calls go to `:4000` or browser is on `:5173` without staging env, you are NOT testing Docker staging.**

### Rules

- Do **not** commit `.env.staging.local`, `.env.production.local`, or LAN IPs
- Do **not** modify source code unless fixing a blocker you found
- Prefer `git pull --no-rebase` over `reset --hard` unless local commits are clearly disposable WIP

---

## Step 1 — Find repo and sync `main`

Run these commands **in order**. Stop and fix before continuing if a step fails.

```bash
# 1a — locate repo (adjust if needed)
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  cd "$(git rev-parse --show-toplevel)"
else
  cd ~/Documents/Commtrac/workflow-strt 2>/dev/null || cd ~/path/to/workflow-strt
fi
pwd
git remote -v
```

```bash
# 1b — fetch + checkout main
git fetch origin
git checkout main
```

```bash
# 1c — pull (handles "no default pull strategy" on this repo)
git pull --no-rebase origin main
```

**If step 1c fails**, run diagnostics then retry:

```bash
git status
git log --oneline -5 HEAD
git log --oneline -5 origin/main
```

| Situation | Action |
|-----------|--------|
| **"Need to specify how to reconcile divergent branches"** | `git pull --no-rebase origin main` (creates merge commit — safe) |
| **Uncommitted local changes block pull** | `git stash push -u -m "mac staging agent wip"` then `git pull --no-rebase origin main` |
| **Merge conflicts after pull** | `git merge --abort`; if local commits are disposable agent WIP: `git reset --hard origin/main` |
| **Local commits you must keep** | Resolve conflicts manually, then continue |

```bash
# 1d — confirm expected commits present
git log -1 --oneline
# PASS: hash is 8c1a4b3 or newer (includes #179 BOM + #178 Strata seed + #175–#177 parity)
git merge-base --is-ancestor 6b4078f HEAD && echo "PR #179 ancestor OK" || echo "WARN: may be too old"
```

| ID | PASS if |
|----|---------|
| G1 | On `main`, pull succeeded |
| G2 | `git log -1` is #180+ or includes merges for #175–#179 |

---

## Step 2 — Prerequisites

```bash
docker version
docker compose version
docker info >/dev/null 2>&1 && echo "Docker daemon OK" || echo "FAIL: start Docker Desktop"
chmod +x scripts/standup-staging.sh
```

```bash
# Ports should be free before standup (ignore errors if nothing listening)
lsof -i :8080 -i :5174 -i :9001 2>/dev/null | head -20 || true
```

| ID | PASS if |
|----|---------|
| G3 | `docker version` succeeds |
| G4 | Docker daemon running |

---

## Step 3 — Fresh Strata NGO seed (required)

Strata seed runs **only on empty Postgres**. Wipe old staging data:

```bash
docker compose -f docker-compose.staging.yml down -v
docker volume ls | grep commtrac_staging || echo "volumes cleared"
```

| ID | PASS if |
|----|---------|
| G5 | `down -v` completed without error |

---

## Step 4 — Start Docker staging stack

```bash
# Ensure staging web env includes BOM flag (script copies example if missing)
cp .env.staging.docker.example .env.staging.local
grep VITE_ENABLE_BOM_MODULE .env.staging.local

./scripts/standup-staging.sh --build-web
```

First run may take 5–15 min (Docker build + `npm run build:cloud-web:staging`).

**If standup fails:**

```bash
docker compose -f docker-compose.staging.yml logs api --tail 80
docker compose -f docker-compose.staging.yml logs postgres --tail 40
docker ps -a --filter "name=commtrac-staging"
```

| ID | PASS if |
|----|---------|
| S1 | Script exits 0 |
| S2 | `curl -sf http://localhost:8080/api/health` returns JSON with healthy status |
| S3 | Health JSON includes Postgres as database provider |
| S4 | `curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:5174/` → `200` |

```bash
docker ps --filter "name=commtrac-staging" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

---

## Step 5 — Automated API verification (run this block)

Copy and run as one script. It sets `PASS`/`FAIL` lines you paste into the report.

```bash
API=http://localhost:8080/api
WEB=http://localhost:5174
ADMIN_EMAIL="admin@StrataNgo.local"
ADMIN_PASS="Admin123!"
PM_EMAIL="project.manager@StrataNgo.local"
PM_PASS="Pm123!"
CHAMBERS_PRODUCT_ID="prod-chambers"

fail=0
pass() { echo "PASS: $1"; }
fail_msg() { echo "FAIL: $1"; fail=1; }

# --- Health ---
HEALTH=$(curl -sf "$API/health" 2>/dev/null) || { fail_msg "health endpoint"; HEALTH=""; }
echo "$HEALTH" | grep -qi postgres && pass "health Postgres provider" || fail_msg "health Postgres provider"
echo "$HEALTH" | grep -qi healthy && pass "health status" || fail_msg "health status"

# --- Admin login ---
LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null) || LOGIN=""
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token') or '')" 2>/dev/null)
[[ -n "$TOKEN" ]] && pass "admin login token" || fail_msg "admin login token"

auth() { curl -sf -H "Authorization: Bearer $TOKEN" "$1" 2>/dev/null; }

# --- Strata brand ---
BRAND=$(auth "$API/brand-settings")
echo "$BRAND" | grep -qi "Strata N-Go" && pass "brand app-name Strata N-Go" || fail_msg "brand app-name Strata N-Go"

# --- Offices (expect 2: Newcastle + Perth) ---
OFFICES=$(auth "$API/offices")
OCOUNT=$(echo "$OFFICES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
echo "$OFFICES" | grep -qi Newcastle && pass "office Newcastle" || fail_msg "office Newcastle"
echo "$OFFICES" | grep -qi Perth && pass "office Perth" || fail_msg "office Perth"
[[ "${OCOUNT:-0}" -ge 2 ]] && pass "offices count >= 2 ($OCOUNT)" || fail_msg "offices count >= 2 ($OCOUNT)"

# --- Customers ---
CUSTOMERS=$(auth "$API/customers")
echo "$CUSTOMERS" | grep -qi "BHP/Mining" && pass "customer BHP/Mining" || fail_msg "customer BHP/Mining"

# --- Users ---
USERS=$(auth "$API/users")
echo "$USERS" | grep -qi "admin@StrataNgo.local" && pass "user admin seeded" || fail_msg "user admin seeded"
echo "$USERS" | grep -qi "project.manager@StrataNgo.local" && pass "user PM seeded" || fail_msg "user PM seeded"

# --- Chambers workflow ---
WFS=$(auth "$API/workflow-configs/by-product/$CHAMBERS_PRODUCT_ID?status=Published")
echo "$WFS" | grep -qi "Chambers_default" && pass "Chambers_default workflow" || fail_msg "Chambers_default workflow"
STEP_COUNT=$(echo "$WFS" | python3 -c "
import sys,json
data=json.load(sys.stdin)
if not data: print(0); sys.exit()
cfg=data[0]
steps=json.loads(cfg.get('stepsJson') or '{}')
print(len(steps.get('steps',[])))
" 2>/dev/null)
[[ "${STEP_COUNT:-0}" -eq 10 ]] && pass "Chambers workflow 10 steps" || fail_msg "Chambers workflow 10 steps (got ${STEP_COUNT:-0})"

# --- BOM API (must NOT 503) ---
BOM_CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/bom-import-runs")
[[ "$BOM_CODE" == "200" ]] && pass "BOM API enabled (HTTP 200)" || fail_msg "BOM API enabled (HTTP $BOM_CODE, want 200)"

# --- Open issues dedupe (PR #175) ---
OPEN=$(auth "$API/asset-workflow-runs/open-issues")
DEDUPE=$(echo "$OPEN" | python3 -c "
import sys,json
data=json.load(sys.stdin)
if not isinstance(data,list):
  print('ok'); sys.exit()
ids=[x.get('issueId') for x in data if x.get('issueId')]
print('ok' if len(ids)==len(set(ids)) else 'dup')
" 2>/dev/null)
[[ "$DEDUPE" == "ok" ]] && pass "open-issues no duplicate issueIds" || fail_msg "open-issues duplicate issueIds"

# --- PM login + BOM ---
PM_LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PM_EMAIL\",\"password\":\"$PM_PASS\"}" 2>/dev/null) || PM_LOGIN=""
PM_TOKEN=$(echo "$PM_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token') or '')" 2>/dev/null)
[[ -n "$PM_TOKEN" ]] && pass "PM login token" || fail_msg "PM login token"
PM_BOM=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $PM_TOKEN" "$API/bom-import-runs")
[[ "$PM_BOM" == "200" ]] && pass "PM BOM API access" || fail_msg "PM BOM API access (HTTP $PM_BOM)"

# --- Web bundle BOM flag baked in ---
grep -rq "bom-project\|BomDashboard" dist/assets/*.js 2>/dev/null && pass "web bundle includes BOM module" || fail_msg "web bundle includes BOM module"

# --- Workflow label strings in built bundle (PR #177) ---
grep -rq "Search workflows" dist/assets/WorkInstructions*.js 2>/dev/null && pass "bundle Search workflows label" || fail_msg "bundle Search workflows label"
! grep -rq "Search work instructions" dist/assets/WorkInstructions*.js 2>/dev/null && pass "bundle no old Search work instructions" || fail_msg "bundle still has Search work instructions"

# --- Web nginx ---
WEB_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "$WEB/")
[[ "$WEB_CODE" == "200" ]] && pass "web 5174 serves login shell" || fail_msg "web 5174 (HTTP $WEB_CODE)"

echo "--- API verification done; failures=$fail ---"
exit $fail
```

| ID | Maps from script output |
|----|-------------------------|
| A1 | health Postgres + status |
| A2 | admin login |
| A3 | Strata brand + offices + BHP customer |
| A4 | Chambers_default 10-step workflow |
| A5 | BOM API 200 (not 503) |
| A6 | open-issues dedupe |
| A7 | PM login + BOM |
| A8 | web bundle BOM + workflow labels |
| A9 | web 5174 HTTP 200 |

---

## Step 6 — Browser verification (if browser tools available)

Open **http://localhost:5174**. Login `admin@StrataNgo.local` / `Admin123!`.

DevTools → Network: confirm requests go to **`localhost:8080`**, not `:4000`.

| ID | Check | PASS if |
|----|-------|---------|
| W1 | Login → Dashboard | Loads, no redirect loop |
| W2 | Admin sidebar | **BOM Project** menu item visible |
| W3 | Admin → Workflows | **Chambers_default** visible for Chambers product |
| W4 | Projects list | Column picker has no duplicate Customer / Job Number / Status / Global Offices |
| W5 | Documents upload | Small file uploads; preview works (MinIO) |

If no browser tools: mark W1–W5 **SKIPPED (API-only)** — Step 5 API results are sufficient for seed/BOM/auth.

Optional — open MinIO console http://localhost:9001 (`commtrac` / `commtrac_dev`), confirm bucket `commtrac-staging`.

---

## Step 7 — Optional automated build gates

```bash
cd server/Commtrac.Api && dotnet build
cd ../.. && npx tsc -b
```

| ID | PASS if |
|----|---------|
| T1 | `dotnet build` exit 0 |
| T2 | `npx tsc -b` exit 0 |

---

## Step 8 — Teardown (only if user asked to stop stack)

```bash
docker compose -f docker-compose.staging.yml down
# Fresh seed next time: add -v
```

**Leave stack running** unless user wants teardown — they may test manually after your report.

---

## Report template (fill and paste back)

```
Docker staging Mac @ <git hash from git log -1>

GIT
G1 pull main: PASS / FAIL
G2 commits #175-#179+: PASS / FAIL
G3 docker CLI: PASS / FAIL
G4 docker daemon: PASS / FAIL
G5 fresh volume (-v): PASS / FAIL

STANDUP
S1 standup script: PASS / FAIL
S2 health 8080: PASS / FAIL
S3 Postgres provider: PASS / FAIL
S4 web 5174 HTTP: PASS / FAIL

API (Step 5 script)
A1 health: PASS / FAIL
A2 admin login: PASS / FAIL
A3 strata seed data: PASS / FAIL
A4 Chambers_default workflow: PASS / FAIL
A5 BOM API: PASS / FAIL
A6 issue dedupe: PASS / FAIL
A7 PM + BOM: PASS / FAIL
A8 bundle BOM + labels: PASS / FAIL
A9 web shell: PASS / FAIL

BROWSER (Step 6 — or SKIPPED)
W1 login dashboard: PASS / FAIL / SKIPPED
W2 BOM sidebar: PASS / FAIL / SKIPPED
W3 workflows UI: PASS / FAIL / SKIPPED
W4 project columns: PASS / FAIL / SKIPPED
W5 document upload: PASS / FAIL / SKIPPED

AUTOMATED
T1 dotnet build: PASS / FAIL / SKIPPED
T2 tsc -b: PASS / FAIL / SKIPPED

URLs:
  Web:  http://localhost:5174
  API:  http://localhost:8080/api
  MinIO: http://localhost:9001

Blockers: none / <list with log excerpts>
Next: user manual UX pass OR iPhone against http://<LAN-IP>:8080/api
```

**On failure:** attach `docker compose -f docker-compose.staging.yml logs api --tail 50` and the failing curl output.

## PROMPT END
