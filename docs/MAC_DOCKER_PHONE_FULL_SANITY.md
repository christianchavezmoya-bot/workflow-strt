# Mac — Docker staging + iPhone + Android full sanity check

**Use this on your Mac.** Copy everything below **PROMPT START** into a Mac Cursor agent. The agent runs Docker, builds native apps, and walks the full checklist.

**Prerequisites on the Mac:**

- Docker Desktop running
- Xcode + Apple signing team (iPhone on USB)
- Android Studio + USB debugging (Android phone)
- Both phones on the **same Wi‑Fi** as the Mac

**Logins:** `admin@StrataNgo.local` / `Admin123!` · `project.manager@StrataNgo.local` / `Pm123!`

**Related:** [`MAC_AGENT_DOCKER_STAGING_PROMPT.md`](./MAC_AGENT_DOCKER_STAGING_PROMPT.md) (API-only detail) · [`MAC_AGENT_DEVICE_TEST_PROMPT.md`](./MAC_AGENT_DEVICE_TEST_PROMPT.md) (device walkthrough detail) · [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md) (W1–W11, P1–P8)

---

## PROMPT START

You are the **Mac full sanity agent** for Commtrac / Strata N-Go.

Execute every step in the terminal yourself. Use browser tools for web checks. Install on **physical** iPhone and Android (not simulators — you need the real LAN network path). Do not ask the user to run commands. Fill in the report at the end.

### Rules

- Never commit `.env.*.local`, LAN IPs, or `dist/`
- Do not patch source to work around failures — report with exact errors + `docker compose … logs api --tail 50`
- Phones **cannot use `localhost`** — bake the Mac **LAN IP** into every native build

---

### Phase A — Sync and start Docker staging

```bash
cd "$(git rev-parse --show-toplevel)"
git checkout main && git pull --no-rebase origin main
git log -1 --oneline
npm ci
chmod +x scripts/standup-staging.sh scripts/mac-staging-preflight.sh
```

If disk is low, run cleanup from [`MAC_AGENT_FRESH_DOCKER_STANDUP_PROMPT.md`](./MAC_AGENT_FRESH_DOCKER_STANDUP_PROMPT.md) Step 0 first.

```bash
./scripts/standup-staging.sh --build-web
./scripts/mac-staging-preflight.sh
```

| ID | PASS if |
|----|---------|
| A1 | Standup exits 0; API healthy on `http://localhost:8080/api/health` |
| A2 | Preflight script exits 0 (all PASS lines) |
| A3 | Web `http://localhost:5174` returns 200 |

---

### Phase B — LAN IP + rebuild for phones

```bash
export LANIP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
echo "LANIP=$LANIP"
curl -sf "http://$LANIP:8080/api/health" && echo "LAN OK"
```

If LAN health fails: macOS Firewall → allow Docker, or disable firewall for this session.

```bash
VITE_API_BASE="http://$LANIP:8080/api" npm run build:cloud-web:staging
grep -o "http://[0-9.]*:8080/api" dist/assets/*.js | head -3
LANIP="$LANIP" ./scripts/mac-staging-preflight.sh
```

| ID | PASS if |
|----|---------|
| B1 | `$LANIP` is a real LAN address (not empty, not 127.0.0.1) |
| B2 | Build bakes `http://$LANIP:8080/api` into `dist/` |
| B3 | `http://$LANIP:5174/` returns 200 |
| B4 | Preflight with `LANIP` set passes LAN checks |

---

### Phase C — Web sanity (desktop + phone browser)

Open **`http://$LANIP:5174`** on Mac Chrome. DevTools → Network: calls go to **`$LANIP:8080`**, not `:4000`.

| ID | Check | PASS if |
|----|-------|---------|
| W1 | Login as admin → Dashboard | No redirect loop |
| W2 | Sidebar | BOM to Project visible; **Admin** visible for admin |
| W3 | Log in as PM (`project.manager@StrataNgo.local`) | **Admin NOT in sidebar** (PR #275) |
| W4 | Admin → Workflows | Chambers_default visible |
| W5 | Documents | Upload + preview small file (MinIO) |
| W6 | iPhone Safari + Android Chrome | Same URL loads and login works |

---

### Phase D — Users and invites (web as admin)

Admin → Users: create `installer1@StrataNgo.local` (Installer) and `inspector1@StrataNgo.local` (QA Inspector).

**Never invite the account you are logged in as.**

Invite one user. No email in staging — recover token:

```bash
docker compose -f docker-compose.staging.yml exec -T postgres \
  psql -U commtrac -d commtrac -t -A -F'|' \
  -c "SELECT \"Email\", \"IsActive\", \"ResetToken\" FROM \"Users\" WHERE \"ResetToken\" IS NOT NULL;"
```

Open: `http://$LANIP:5174/reset-password?token=<token>&invite=true` — set password `Tester123!`

| ID | PASS if |
|----|---------|
| U1 | Users created |
| U2 | Invite succeeds; token in DB |
| U3 | Invite link activates account |
| U4 | Installer sees narrower menu than admin |

---

### Phase E — iPhone native

```bash
VITE_API_BASE="http://$LANIP:8080/api" npm run build:cloud-native:staging
open ios/App/App.xcodeproj
```

Xcode → physical iPhone → set Team → Run. Trust developer cert on device if prompted.

| ID | Check | PASS if |
|----|-------|---------|
| P1 | App installs and launches | No crash |
| P2 | Login as installer | Reaches API (not network error) |
| P3 | Sync Center → Sync Now | No false offline / 401 loop |
| P4 | Airplane mode 30s | Cached data still visible |
| P5 | Workflow run with photo + signature | Completes or saves pending offline |
| P6 | Reconnect Wi‑Fi | Pending sync drains |
| P7 | Document/PDF preview | Renders on device |
| P8 | Kill app; cold start offline | Bootstrap sane |

---

### Phase F — Android native

```bash
source scripts/android-env.sh
cd android && ./gradlew installDebug
cd ..
```

Enable USB debugging; accept prompt. Fallback: `npx cap open android` → Run.

| ID | PASS if |
|----|---------|
| A1 | installDebug succeeds |
| A2 | App launches on physical device |
| A3 | Login as inspector succeeds |
| A4 | P3–P6 pass on Android (sync + offline smoke) |

---

### Phase G — End-to-end field walkthrough

**Web (admin/PM):** create customer → site → project with job number → asset → assign Chambers_default workflow.

**Phone (installer):** start run → photo step → blocking issue → 422 on complete → resolve → complete → signature → verify on web.

| ID | PASS if |
|----|---------|
| F1 | Full walkthrough completes web + phone |
| F2 | Offline capture syncs to web with photo intact |
| F3 | No duplicate runs/entities after sync |

---

### Report template

```
Full sanity @ <git hash>
LANIP: <ip>

Phase A Docker: PASS / FAIL
Phase B LAN build: PASS / FAIL
Phase C Web W1-W6: PASS / FAIL
Phase D Users U1-U4: PASS / FAIL
Phase E iPhone P1-P8: PASS / FAIL
Phase F Android A1-A4: PASS / FAIL
Phase G Walkthrough F1-F3: PASS / FAIL

Blockers: none / <list>
Device models: iPhone <model/iOS> · Android <model/OS>
```

Leave Docker stack running unless asked to tear down.

## PROMPT END
