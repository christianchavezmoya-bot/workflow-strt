# Mac agent — iOS install against AWS staging API (execute all)

**Copy everything below the line into your Mac Cursor agent.**

**Prerequisite:** AWS staging API health check passes (Postgres connected). Christian confirms ECS URL or custom domain is live.

**Requires on the Mac:** Xcode, Apple Developer signing team, physical iPhone, USB or same Wi‑Fi for install.

**Do not commit:** `.env.staging.local`, `dist/`, signing artifacts.

---

## PROMPT START

You are the **Mac AWS staging iOS agent** for Commtrac (app name **Strata NGo**).

### Your job

Build the native iOS app pointed at the **HTTPS AWS staging API**, install it on a physical iPhone via Xcode, verify login and one workflow path, and fill in the report at the end.

### API URL (use the one Christian confirmed)

**Preferred (after Cloudflare DNS):**
```
https://api.staging.strata-ngo.com/api
```

**Fallback (ECS Express URL — works now if custom domain not ready):**
```
https://co-7c80ff093f614e849c3eb733fb76c42c.ecs.ap-southeast-2.on.aws/api
```

Set `STAGING_API` to whichever Christian says is live. Health check must return `"status":"healthy"` and `"database":"connected"`.

### Logins

- **Admin:** `admin@StrataNgo.local` / password from Christian (Secrets Manager `SeedAdmin__Password`)
- **PM (optional):** `project.manager@StrataNgo.local` / `Pm123!` (if seeded)

---

## Step 0 — Preflight (API reachable from Mac)

```bash
cd "$(git rev-parse --show-toplevel)"
git checkout main && git pull --no-rebase origin main
git log -1 --oneline
```

Replace `STAGING_API` below with the confirmed base (must end with `/api`, no trailing slash on host path beyond that).

```bash
export STAGING_API="https://co-7c80ff093f614e849c3eb733fb76c42c.ecs.ap-southeast-2.on.aws/api"
# Or: export STAGING_API="https://api.staging.strata-ngo.com/api"

curl -sf "${STAGING_API%/}/health" | head -c 500
echo
```

| ID | PASS if |
|----|---------|
| P0 | curl exits 0 and JSON contains `"status":"healthy"` and `"database":"connected"` |

**If P0 fails:** stop and report — phone build will not work until API is reachable over HTTPS from the Mac.

---

## Step 1 — Staging env + native build

```bash
cp .env.staging.strata-ngo.example .env.staging.local
```

Bake the API URL inline (wins over env file):

```bash
VITE_API_BASE="$STAGING_API" npm run build:cloud-native:staging
```

Verify the URL is in the bundle:

```bash
grep -o 'https://[^"]*/api' dist/assets/*.js | head -5
```

| ID | PASS if |
|----|---------|
| B1 | Build exits 0 |
| B2 | grep shows `$STAGING_API` host (not `localhost`, not LAN IP) |

---

## Step 2 — Xcode install on iPhone

```bash
npx cap sync ios
open ios/App/App.xcworkspace
```

In Xcode:

1. Select the **physical iPhone** (not simulator)
2. **Signing & Capabilities** → valid Team, bundle id unchanged unless Christian specified
3. **Product → Run** (⌘R)
4. If iOS asks to trust the developer: Settings → General → VPN & Device Management → Trust

| ID | PASS if |
|----|---------|
| X1 | App installs and launches on iPhone without immediate crash |
| X2 | Login screen appears (not blank white screen) |

---

## Step 3 — iPhone functional checks

Use **cellular or Wi‑Fi** (not LAN Docker). Private/home network must reach the public HTTPS API.

| ID | Check | PASS if |
|----|-------|---------|
| I1 | Login as admin | Succeeds — proves phone reached `$STAGING_API` |
| I2 | Dashboard loads | Projects or empty state, no endless spinner |
| I3 | Sync / connectivity | No permanent "offline" if on good network |
| I4 | Bell / notifications inbox | Opens; polling works when online (push may be absent — OK) |
| I5 | One workflow action | Open a project/installation or start a run without hard failure |

**If I1 fails with network error:** confirm `VITE_API_BASE` in bundle, try Safari on phone → `${STAGING_API%/}/health`. Report CORS or SSL errors verbatim.

---

## Step 4 — Optional web smoke on Mac (same API)

Quick desktop check using the same staging API (not deployed to CloudFront yet):

```bash
VITE_API_BASE="$STAGING_API" npm run build:cloud-web:staging
npm run preview -- --host 0.0.0.0 --port 5174
```

Open `http://localhost:5174` on Mac → login as admin → confirm Network tab calls `$STAGING_API`.

| ID | PASS if |
|----|---------|
| W1 | Web login works against cloud API |

Stop preview when done (Ctrl+C).

---

## Report template (fill in and return)

```
Mac AWS staging iOS — report
Date:
Git: 
STAGING_API used:

P0 API health:     PASS / FAIL
B1-B2 build:       PASS / FAIL
X1-X2 Xcode install: PASS / FAIL
I1 login:          PASS / FAIL
I2 dashboard:      PASS / FAIL
I3 sync:           PASS / FAIL
I4 bell:            PASS / FAIL
I5 workflow:       PASS / FAIL
W1 web preview:    PASS / FAIL / SKIPPED

Blockers:
Notes:
```

## PROMPT END
