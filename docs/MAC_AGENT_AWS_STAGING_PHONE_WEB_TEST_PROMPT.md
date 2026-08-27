# Mac agent — AWS staging phone + web testing (post–Docker recovery)

**Copy everything between PROMPT START and PROMPT END into Claude Code on the Mac.**

**When to use:** Mac disk was freed; local Docker stack was **lost** after an agent restarted Docker Desktop; Christian wants to **continue testing** against **AWS staging** (not local Docker): optional web verify/rebuild, **reinstall iPhone + Android** apps.

**Do NOT use this prompt to stand up `docker-compose.staging.yml` unless Christian explicitly asks for local Docker again.**

---

## Context (read first — do not panic)

| Environment | Status after Docker restart |
|-------------|----------------------------|
| **AWS staging** (ECS, RDS Postgres, S3 web, CloudFront) | **UNAFFECTED** — still live |
| **Local Docker** (`commtrac-staging-*` Postgres, MinIO, local API/web) | **GONE** — images/volumes wiped when Docker was restarted |
| **What we test now** | `https://www.strata-ngo.com` + `https://api.staging.strata-ngo.com/api` |

PR **#311** is merged on `main` (`676bebfa`). ECS task def **rev 13** already deployed invite-link fix + `Email__FrontendBaseUrl=https://www.strata-ngo.com`. Prior session also deployed web to S3/CloudFront — **verify before rebuilding web**.

---

## PROMPT START

You are the **Mac AWS staging phone + web test agent** for Commtrac / **Strata NGo**.

### Your job

1. Sync `main` and confirm AWS staging is healthy  
2. **Safely** verify or rebuild web (npm only — **no `docker build` unless Christian explicitly requests API redeploy**)  
3. Build and install **iOS + Android** native apps against the AWS API  
4. Report results for Christian to test invite links, QR upload, signatures, BOM  

**Execute commands yourself.** Fill in the report at the end.

---

## CRITICAL — Docker safety rules (Christian’s Mac)

The previous agent **must not repeat this mistake**:

| Rule | Detail |
|------|--------|
| **Never restart Docker Desktop** (quit, kill, relaunch) unless Christian **explicitly** asks | A ~372GB Docker VM can take **many minutes** to respond to `docker info` while starting — that is not necessarily “stuck” |
| If `docker info` / `docker system df` is slow or hangs **> 2 min** | **STOP.** Report: *“Docker daemon not responding yet — waiting for Christian.”* Do **not** kill PIDs or restart Docker on your own |
| **This session does not need Docker** for AWS phone/web testing | Native build = `npm run build:cloud-native:staging` only (no local Postgres/MinIO) |
| **Do not run** `docker system prune`, `docker compose down -v`, or restart Docker | Unless Christian explicitly requests local Docker standup in a **separate** session |
| Disk cleanup for this session | **`df -h /` only** + optional `rm -rf dist node_modules/.vite` — **no Docker prune** |

---

## Step 0 — Disk check (no Docker required)

```bash
cd "$(git rev-parse --show-toplevel)"

echo "=== disk ==="
df -h / | tail -1

echo "=== docker (read-only — do NOT restart if slow) ==="
timeout 120 docker info >/dev/null 2>&1 && echo "Docker: responding" || echo "Docker: not responding within 120s — REPORT ONLY, do not restart"
```

| ID | PASS if |
|----|---------|
| D1 | ≥ **8 GB free** on `/` |
| D2 | You did **not** restart or prune Docker in this session |

---

## Step 1 — Sync `main`

```bash
git fetch origin
git checkout main
git pull --no-rebase origin main
git log -1 --oneline
```

| ID | PASS if |
|----|---------|
| G1 | `git log -1` shows **Merge pull request #311** (or newer) |
| G2 | Working tree clean (or only untracked `.env*.local`) |

---

## Step 2 — AWS staging preflight

```bash
export STAGING_API="https://api.staging.strata-ngo.com/api"
export WEB_URL="https://www.strata-ngo.com"

curl -sf "${STAGING_API%/}/health"
echo
curl -sf "${STAGING_API%/}/settings/public"
echo
curl -sfI "${WEB_URL}/" | head -5
```

| ID | PASS if |
|----|---------|
| P0 | Health → `"status":"healthy"`, `"database":"connected"` |
| P1 | Public settings → `"frontendBaseUrl":"https://www.strata-ngo.com"` |
| P2 | Web URL → HTTP 200 |

**If P0–P2 fail:** stop and report — fix AWS before phone builds.

---

## Step 3 — Web: verify live bundle (rebuild only if needed)

**Default: do NOT rebuild** if P2 passed and `last-modified` on `index.html` is recent.

```bash
# Check whether a rebuild is needed (Christian may ask for fresh build anyway)
curl -sf "${WEB_URL}/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
curl -sf "${WEB_URL}/" -o /tmp/www-index.html
grep -o 'api.staging.strata-ngo.com' /tmp/www-index.html || \
  grep -ro 'api\.staging[^"]*' dist/assets/*.js 2>/dev/null | head -1
```

**If Christian wants a fresh web deploy** (or bundle looks stale / wrong API host):

```bash
rm -rf dist node_modules/.vite 2>/dev/null || true
VITE_API_BASE="${STAGING_API}" npm run build:cloud-web
```

Upload `dist/` to S3 bucket **`strata-ngo-web-staging`** (cache: immutable `/assets/*`, no-cache `index.html`). Invalidate CloudFront **`E1YN5XTWDWRHYP`**.

| AWS profile | Use |
|-------------|-----|
| `strata-agent` | ECS/ECR/ALB if needed |
| Admin profile | S3 web upload + CloudFront invalidation **only if** `strata-agent` lacks permission (prior session note) |

| ID | PASS if |
|----|---------|
| W1 | `npm run build:cloud-web` exits 0 (if rebuild run) |
| W2 | `${WEB_URL}` loads login; Network tab calls `${STAGING_API}` |
| W3 | Skipped rebuild OK if live site already serves correct API host |

---

## Step 4 — Native build (iOS + Android, one npm build)

**No Docker required.**

```bash
VITE_API_BASE="${STAGING_API}" npm run build:cloud-native:staging

# Confirm API URL baked in
grep -o 'https://[^"]*staging[^"]*/api' dist/assets/*.js | head -3
```

| ID | PASS if |
|----|---------|
| N1 | Build exits 0 |
| N2 | grep shows `api.staging.strata-ngo.com` (not localhost/LAN) |

---

## Step 5 — Install iOS (physical iPhone)

```bash
npx cap sync ios
open ios/App/App.xcworkspace
```

In Xcode: select **physical iPhone** → valid signing team → **Product → Run** (⌘R).  
Trust developer on device if prompted.

| ID | PASS if |
|----|---------|
| I1 | App installs and launches |
| I2 | Login screen appears (not blank/crash) |

**Logins:** `admin@StrataNgo.local` / password from Christian (Secrets Manager). Optional PM: `project.manager@StrataNgo.local` / `Pm123!`

---

## Step 6 — Install Android (physical device)

Phone: **Developer options → USB debugging** ON; accept RSA prompt.

```bash
npx cap sync android
adb devices   # must list device

source scripts/android-env.sh
cd android && ./gradlew installDebug && cd ..
```

If Gradle fails: `npx cap open android` → Run in Android Studio.

| ID | PASS if |
|----|---------|
| A1 | `installDebug` exits 0 (or Android Studio install) |
| A2 | App launches on device |
| A3 | Login screen appears |

---

## Step 7 — Smoke checks (agent + Christian)

Agent can verify API reachability after login if credentials provided; otherwise mark **Christian to verify**.

| ID | Check | PASS if |
|----|-------|---------|
| T1 | iPhone login as admin | Dashboard loads, not stuck offline |
| T2 | Android login as admin | Same |
| T3 | Web: re-send user invite | Email link uses **`www.strata-ngo.com/reset-password`** |
| T4 | Web: phone upload QR | URL uses **`www.strata-ngo.com/mobile-upload`** |
| T5 | Web: logged-in `GET /api/bom-import-runs` | **200** (not 503) — BOM enabled on ECS rev 12+ |
| T6 | Web or phone: one workflow open | No hard crash |

---

## Step 8 — What NOT to do

- Do **not** run `./scripts/standup-staging.sh` or `docker compose -f docker-compose.staging.yml up` unless Christian explicitly requests **local Docker** recovery (that recreates empty Postgres — separate prompt).  
- Do **not** `docker build` / ECR push unless Christian requests **API code change** deploy.  
- Do **not** restart Docker Desktop to “fix” slow commands.

---

## Report template

```
Mac AWS staging phone + web test — report
Date:
Git:
Disk free:
Docker restarted this session: YES / NO (must be NO)

D1-D2 disk/docker safety:  PASS / FAIL
G1-G2 main sync:           PASS / FAIL
P0-P2 AWS preflight:       PASS / FAIL
W1-W3 web:                 PASS / FAIL / SKIPPED (rebuild not needed)
N1-N2 native build:        PASS / FAIL
I1-I2 iOS install:         PASS / FAIL
A1-A3 Android install:     PASS / FAIL
T1-T6 tests:               (list PASS/FAIL/SKIPPED — note which need Christian)

Blockers:
Notes:
```

## PROMPT END

---

## Christian — after Claude reports PASS

1. **iPhone + Android:** log in, browse dashboard, try one workflow  
2. **Web:** re-send invite → confirm link on phone  
3. **Web:** open phone-upload QR → scan with other phone  
4. **Web:** check BOM (no 503 in console) while logged in  
5. Report any bugs as plain-English notes back to Cursor agent  

**Local Docker data is lost** — if you need local LAN testing again later, that is a **fresh** `docker-compose.staging.yml` standup (empty DB, re-seed). AWS staging data is unchanged.
