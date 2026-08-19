# Mac agent — fresh Docker standup after PR #255 (execute all)

**Copy everything between PROMPT START and PROMPT END into your Mac Cursor agent.**

**Requires:** `main` at **`cb88af6`** or later (PR **#255** merged — AIM-100 seed fix).  
**Guide:** [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md)  
**Full staging prompt (migrations, BOM, browser):** [`MAC_AGENT_DOCKER_STAGING_PROMPT.md`](./MAC_AGENT_DOCKER_STAGING_PROMPT.md)

**Login:** `admin@StrataNgo.local` / `Admin123!` · PM: `project.manager@StrataNgo.local` / `Pm123!`

---

## PROMPT START

You are the **Mac fresh Docker standup agent** for Commtrac Strata N-Go staging.

### Your job

Run **every command yourself**. Use browser tools if available. **Do not ask the user to run commands.** This run verifies **PR #255 seed metadata** on a **fresh Postgres volume** after freeing Mac disk space.

### Mac disk space — critical (do this first, repeat whenever low)

This Mac has **very little free space**. Docker builds and `npm run build` fail when disk is full. **Free space before every standup attempt** and again if a build fails mid-run.

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

echo "=== disk before cleanup ==="
df -h / | tail -1

# Stop stack and remove staging volumes (safe — we re-seed fresh)
docker compose -f docker-compose.staging.yml down -v 2>/dev/null || true

# Reclaim Docker disk (images, build cache, stopped containers, unused networks)
docker system prune -af --volumes 2>/dev/null || true
docker builder prune -af 2>/dev/null || true

# Remove old Commtrac staging volumes if any remain
for v in $(docker volume ls -q | grep commtrac_staging); do docker volume rm "$v" 2>/dev/null || true; done

# Optional: npm/vite caches (often several GB)
rm -rf node_modules/.vite dist 2>/dev/null || true
npm cache clean --force 2>/dev/null || true

echo "=== disk after cleanup ==="
df -h / | tail -1
```

| ID | PASS if |
|----|---------|
| D1 | At least **8 GB free** on `/` (`df -h /`). If below 8 GB, delete more (Docker Desktop → Troubleshoot → Clean / Purge data, empty Trash, remove old Xcode simulators) and re-check |
| D2 | `docker system df` shows no huge dangling build cache before standup |

**If standup fails with "no space left on device" or npm ENOSPC:** run the cleanup block again, then retry from Step 3.

---

### Step 1 — Sync `main` (must include PR #255)

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || cd ~/Documents/Commtrac/workflow-strt || cd ~/path/to/workflow-strt
pwd
git fetch origin
git checkout main
git pull --no-rebase origin main
git log -1 --oneline
```

Verify seed fix is present:

```bash
grep -n 'HazardAvert-Coal\|AI Proximity Detection\|DivisionAiId' server/Commtrac.Api/Data/StrataNgoSeeder.cs
```

| ID | PASS if |
|----|---------|
| G1 | `git log -1` is **`cb88af6`** or newer |
| G2 | Seeder contains `Name = "HazardAvert-Coal"`, `Description = "AI Proximity Detection"`, `DivisionId = DefaultCatalog.DivisionAiId` |

---

### Step 2 — Prerequisites

```bash
docker version
docker compose version
docker info >/dev/null 2>&1 && echo "Docker daemon OK" || echo "FAIL: start Docker Desktop"
chmod +x scripts/standup-staging.sh
lsof -i :8080 -i :5174 -i :9001 2>/dev/null | head -10 || true
```

| ID | PASS if |
|----|---------|
| G3 | Docker CLI + daemon OK |

---

### Step 3 — Fresh volume (non-negotiable)

Strata seed runs **only on empty Postgres**. Reusing the old volume keeps wrong AIM-100 division/description.

```bash
docker compose -f docker-compose.staging.yml down -v
docker volume ls | grep commtrac_staging || echo "volumes cleared"
```

| ID | PASS if |
|----|---------|
| G4 | No `commtrac_staging_*` volumes remain |

---

### Step 4 — Standup

```bash
cp .env.staging.docker.example .env.staging.local
grep VITE_ENABLE_BOM_MODULE .env.staging.local
./scripts/standup-staging.sh --build-web
```

On failure:

```bash
df -h /
docker compose -f docker-compose.staging.yml logs api --tail 80
docker compose -f docker-compose.staging.yml logs postgres --tail 30
```

If ENOSPC: cleanup (Step 0 block) → Step 3 → retry Step 4.

| ID | PASS if |
|----|---------|
| S1 | Standup script exit 0 |
| S2 | `curl -sf http://localhost:8080/api/health` healthy + Postgres provider |
| S3 | `curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:5174/` → `200` |

---

### Step 5 — Seed verification (API + browser)

**Expected catalog (PR #255):**

| Entity | Expected |
|--------|----------|
| Division (4th) | **HazardAvert-Coal** (not "Hazard Avert - Coal") |
| Product AIM-100 | Division **Strata AI** |
| AIM-100 description | **AI Proximity Detection** |
| Workflow | **Chambers_default** on product id **`prod-aim-100`** |

```bash
API=http://localhost:8080/api
LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@StrataNgo.local","password":"Admin123!"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token') or '')")

auth() { curl -sf -H "Authorization: Bearer $TOKEN" "$1"; }

echo "=== divisions ==="
auth "$API/divisions" | python3 -c "
import sys,json
for d in json.load(sys.stdin):
  print(d.get('name'), d.get('id'))
"

echo "=== AIM-100 product ==="
auth "$API/products" | python3 -c "
import sys,json
for p in json.load(sys.stdin):
  if p.get('name')=='AIM-100':
    print('divisionId', p.get('divisionId'))
    print('description', p.get('description'))
"

echo "=== Chambers workflow ==="
auth "$API/workflow-configs/by-product/prod-aim-100?status=Published" | python3 -c "
import sys,json
data=json.load(sys.stdin)
print('configs', len(data))
if data: print('name', data[0].get('name'))
"
```

| ID | PASS if |
|----|---------|
| P1 | Divisions include **HazardAvert-Coal**; no **Hazard Avert - Coal** |
| P2 | AIM-100 `divisionId` is **`div-strata-ai`** |
| P3 | AIM-100 description is **`AI Proximity Detection`** |
| P4 | **Chambers_default** returned for **`prod-aim-100`** |

**Browser (if tools available):** http://localhost:5174 → login → **Settings → Products** → Edit **AIM-100** → confirm division **Strata AI** and description **AI Proximity Detection**. **Settings → Divisions** → confirm **HazardAvert-Coal**.

| ID | PASS if |
|----|---------|
| W1 | UI matches P1–P3 |

---

### Step 6 — Post-run cleanup (leave stack running unless user asked to stop)

**Do not** run `docker system prune` while the user is testing unless they ask — but **do** report final free disk:

```bash
df -h / | tail -1
docker ps --filter "name=commtrac-staging" --format "table {{.Names}}\t{{.Status}}"
```

Leave stack up for manual testing unless user requested teardown.

---

### Report template (paste back)

```
Fresh Docker standup Mac @ <git log -1 --oneline>

DISK
D1 >= 8 GB free before standup: PASS / FAIL (<N> GB)
D2 docker cache trimmed: PASS / FAIL

GIT
G1 main includes PR #255: PASS / FAIL
G2 seeder file checks: PASS / FAIL
G3 docker OK: PASS / FAIL
G4 fresh volume: PASS / FAIL

STANDUP
S1 script: PASS / FAIL
S2 health Postgres: PASS / FAIL
S3 web 5174: PASS / FAIL

SEED (PR #255)
P1 HazardAvert-Coal division: PASS / FAIL
P2 AIM-100 → Strata AI: PASS / FAIL
P3 description AI Proximity Detection: PASS / FAIL
P4 Chambers_default on prod-aim-100: PASS / FAIL
W1 browser Settings check: PASS / FAIL / SKIPPED

URLs:
  Web:  http://localhost:5174
  API:  http://localhost:8080/api

Blockers: none / <list>
Disk after run: <df -h / line>
Next: full app test + bug hunt + polish (gate cleared if all PASS)
```

## PROMPT END
