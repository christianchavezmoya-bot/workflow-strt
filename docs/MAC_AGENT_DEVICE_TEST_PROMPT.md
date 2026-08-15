# Mac agent — full app test on web + iPhone + Android (execute all)

**Copy everything below the line into your Mac Cursor agent.**

**Prerequisite:** Docker staging must already be signed off (see [`MAC_AGENT_DOCKER_STAGING_PROMPT.md`](./MAC_AGENT_DOCKER_STAGING_PROMPT.md)). This prompt assumes the stack starts cleanly.

**Requires on the Mac:** Xcode + a signing team (iPhone), Android Studio (Android), both phones on the **same Wi-Fi** as the Mac.

**Logins:** `admin@StrataNgo.local` / `Admin123!` · `project.manager@StrataNgo.local` / `Pm123!`

---

## PROMPT START

You are the **Mac device test agent** for Commtrac (app name **Strata NGo**).

### Your job

Get the app running on the **desktop browser, an iPhone, and an Android phone**, all talking to the local Docker staging API, then walk the real work the app is for: create users, invite them, create a customer, a project with a job number, a workflow, and run it on a phone. Execute every step yourself. Fill in the report at the end.

### What is already verified — don't re-litigate it

Migrations, the Strata NGO seed, API boot, all the API checks, MinIO upload/download, and a manual web pass are all signed off. If something here fails, it is new. Say so clearly rather than assuming it is a known issue.

### Rules

- **Never commit** `.env.*.local`, LAN IPs, signing certs, or `dist/`
- **Do not edit source** to work around a failure. Report it with the exact error
- Prefer passing env vars inline over editing env files
- If a phone can't reach the API, that is almost always Wi-Fi or firewall, not the app

### The one thing that trips everyone up

Phones **cannot reach `localhost`** — that means the phone itself, not the Mac. Every device build must point at the Mac's **LAN IP**. You will set this once in Step 1 and reuse it everywhere.

---

## Step 1 — LAN IP and stack health

```bash
cd "$(git rev-parse --show-toplevel)"
git checkout main && git pull --no-rebase origin main
git log -1 --oneline
```

```bash
# 1a — the Mac's LAN IP (Wi-Fi first, then Ethernet)
LANIP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
echo "LANIP=$LANIP"
```

Export it for the rest of the session — every later step uses `$LANIP`:

```bash
export LANIP
```

```bash
# 1b — is the staging stack up? Start it if not.
docker compose -f docker-compose.staging.yml ps
curl -sf http://localhost:8080/api/health || ./scripts/standup-staging.sh --build-web
```

```bash
# 1c — API reachable over the LAN (not just localhost)
curl -sf "http://$LANIP:8080/api/health" && echo "LAN API OK" || echo "FAIL: LAN API unreachable"
```

**If 1c fails:** macOS firewall is the usual cause. System Settings → Network → Firewall → either turn it off for this session or allow incoming connections for Docker. The containers already listen on all interfaces, so nothing in the app needs changing.

| ID | PASS if |
|----|---------|
| L1 | `$LANIP` is a real address (`192.168.x.x`, `10.x.x.x`) — not empty, not `127.0.0.1` |
| L2 | `http://localhost:8080/api/health` returns healthy JSON |
| L3 | `http://$LANIP:8080/api/health` returns healthy JSON |

---

## Step 2 — Build the web app once, for every client

Build with the **LAN IP** rather than `localhost`. That single bundle then works in the desktop browser, a phone browser, and both native apps, so there is only one build to reason about.

```bash
grep VITE_ENABLE_BOM_MODULE .env.staging.local || cp .env.staging.docker.example .env.staging.local

# Inline VITE_API_BASE wins over the env file — no file edits needed.
VITE_API_BASE="http://$LANIP:8080/api" npm run build:cloud-web:staging
```

The build prints the baked value — confirm it shows your LAN IP, not `localhost`.

```bash
grep -o "http://[0-9.]*:8080/api" dist/assets/*.js | head -3
```

The staging web container serves `dist/` from a volume, so it picks this up with no restart.

```bash
curl -sf -o /dev/null -w '%{http_code}\n' "http://$LANIP:5174/"
```

| ID | PASS if |
|----|---------|
| B1 | Build exits 0 and reports `VITE_API_BASE=http://<LANIP>:8080/api` |
| B2 | The LAN IP appears in the built bundle |
| B3 | `http://$LANIP:5174/` returns `200` |

> To go back to a localhost-only web build later: `npm run build:cloud-web:staging` with no inline override.

---

## Step 3 — Web app checks (desktop, then phone browser)

Open **http://$LANIP:5174** on the Mac and log in as admin.

DevTools → Network: requests must go to **`$LANIP:8080`**. No CORS errors in Console.

| ID | Check | PASS if |
|----|-------|---------|
| W1 | Login → Dashboard | Loads, no redirect loop, no console errors |
| W2 | Sidebar | **BOM Project** is present |
| W3 | Admin → Workflows | **Chambers_default** listed for the Chambers product |
| W4 | Projects → column picker | Customer / Job Number / Status / Global Offices each appear **once** |
| W5 | Documents | Upload a small file, preview it, download it |

Now open the **same URL on the iPhone's Safari and the Android's Chrome**. This is the fastest proof the network path works before you spend time on native builds.

| ID | PASS if |
|----|---------|
| W6 | Phone browser loads the app over `http://$LANIP:5174` and login succeeds |

**If W6 fails but L3 passed**, the phone is on a different network (guest Wi-Fi, or cellular still preferred). Fix that before continuing — native builds will fail the same way.

---

## Step 4 — Users and invites

Do this in the web UI as admin: **Admin → Users**.

1. Create a user (e.g. `installer1@StrataNgo.local`, role **Installer**, office **Newcastle**)
2. Create a second (e.g. `inspector1@StrataNgo.local`, role **Inspector**)
3. Use **Invite** on one of them

### Two things you must know about invites

**Inviting deactivates the account** until the invite link is completed. **Never invite `admin@StrataNgo.local` or the PM account you are logged in with** — you will lock yourself out.

**No email will arrive.** Staging has no Resend key or SMTP host, so the app logs the message and moves on. That is expected, not a bug. Recover the link from the database:

```bash
docker compose -f docker-compose.staging.yml exec -T postgres \
  psql -U commtrac -d commtrac -t -A -F'|' \
  -c "SELECT \"Email\", \"IsActive\", \"ResetToken\" FROM \"Users\" WHERE \"ResetToken\" IS NOT NULL;"
```

Build the link with your LAN IP and open it in a browser:

```
http://<LANIP>:5174/reset-password?token=<ResetToken>&invite=true
```

Set a password (needs upper, lower, digit, symbol — e.g. `Tester123!`), then log in as that user.

> Invite links are generated from the address you invited from, so inviting via `http://$LANIP:5174` already produces a phone-usable link. Inviting from `localhost` produces a localhost link that will not open on a phone.

| ID | PASS if |
|----|---------|
| U1 | Both users created and listed |
| U2 | Invite returns success; user shows inactive; a reset token exists in the DB |
| U3 | Invite link sets a password and the account becomes active |
| U4 | New user logs in and sees a **narrower** menu than admin (permissions applied) |

---

## Step 5 — iPhone build and install

```bash
VITE_API_BASE="http://$LANIP:8080/api" npm run build:cloud-native:staging
```

That builds the web bundle and runs `npx cap sync`. Then:

```bash
open ios/App/App.xcodeproj
```

In Xcode:

1. Connect the iPhone by USB and trust the Mac
2. Select the device in the run-destination dropdown (not a simulator — you want the real network path)
3. Target **App** → **Signing & Capabilities** → set your **Team**; let it manage signing automatically
4. Press **Run**

First launch on the device needs **Settings → General → VPN & Device Management → trust your developer certificate**.

Notes:
- The app is **Strata NGo**; bundle id `com.christianchavez.kinet`
- Plain `http` to the LAN IP is already permitted by the app's transport settings
- Launch goes through a **biometric/PIN lock screen** before the app's own login — that is by design on native

| ID | PASS if |
|----|---------|
| I1 | `build:cloud-native:staging` exits 0 and `cap sync` completes |
| I2 | App installs and launches on the physical iPhone |
| I3 | Login as the Installer user succeeds (proves it reached `$LANIP:8080`) |
| I4 | Dashboard and a project list render with real seeded data |

**If login fails on device but the phone browser worked:** capture the exact on-screen error and check `docker compose -f docker-compose.staging.yml logs api --tail 50` for a rejected request. Report it — do not patch source.

---

## Step 6 — Android build and install

```bash
source scripts/android-env.sh          # aligns JDK/SDK with Android Studio
cd android && ./gradlew installDebug   # builds and installs to the connected device
cd ..
```

The phone needs **Developer options → USB debugging** on, and you must accept the debugging prompt.

If Gradle can't see the device: `adb devices` should list it. If `./gradlew installDebug` fails, fall back to `npx cap open android` and press Run in Android Studio.

| ID | PASS if |
|----|---------|
| A1 | `installDebug` exits 0 (or Android Studio installs it) |
| A2 | App launches on the physical Android phone |
| A3 | Login as the Inspector user succeeds |
| A4 | Dashboard and a project list render with real seeded data |

---

## Step 7 — Full work walkthrough

Do this **on the web app as PM/admin** for setup, then **on a phone as the Installer** for the field work. This is the real end-to-end test.

### 7a — Set up the job (web)

| ID | Step | PASS if |
|----|------|---------|
| F1 | Create a **customer** | Saves and appears in the customers list |
| F2 | Add a **site** to that customer | Saves and links to the customer |
| F3 | Create a **project** with a **job number**, customer, office, dates | Saves; job number shows in the projects list |
| F4 | Add an **asset** to the project | Appears under the project |
| F5 | Assign a **workflow** to the asset (Chambers_default or your own) | Assignment saves |
| F6 | Create your **own workflow** with a few steps and at least one photo step and one required field | Saves; appears in the workflows list |

### 7b — Do the field work (phone)

| ID | Step | PASS if |
|----|------|---------|
| F7 | Open the assigned asset and **start the workflow** | Steps render in order |
| F8 | Complete steps: type values, **take a photo** with the camera | Values and photo persist when moving between steps |
| F9 | Raise a **blocking issue** | Issue saves against the asset |
| F10 | Try to **complete the run** with the blocking issue open | App **refuses** and explains why (server returns 422) |
| F11 | Resolve the issue, then complete the run | Run completes and locks |
| F12 | Capture a **signature** | Signature saves against the run |
| F13 | The completed run appears **on the web app** | Same data, no refresh tricks needed |

### 7c — Offline and sync (phone — the most important part)

| ID | Step | PASS if |
|----|------|---------|
| F14 | Turn on **airplane mode**, then open the app | App still opens and shows previously loaded work |
| F15 | Complete a workflow step and add a photo while offline | Saves locally; UI shows pending/offline state |
| F16 | Turn Wi-Fi back on | Pending work syncs automatically without you forcing it |
| F17 | Confirm the offline work on the **web app** | Data arrived intact, photo included |
| F18 | Create something offline, sync, then edit it | No duplicates and no lost edits (IDs remapped correctly) |

---

## Step 8 — Leave it running

Leave the stack and both apps installed unless asked otherwise — the user will want to keep exploring.

```bash
docker compose -f docker-compose.staging.yml ps
```

---

## Report template (fill and paste back)

```
Device test — Mac @ <git hash>
LANIP: <ip>

NETWORK
L1 LAN IP resolved: PASS / FAIL
L2 API on localhost: PASS / FAIL
L3 API on LAN IP: PASS / FAIL

BUILD
B1 cloud web build (LAN IP baked): PASS / FAIL
B2 LAN IP present in bundle: PASS / FAIL
B3 web 5174 over LAN: PASS / FAIL

WEB
W1 login dashboard: PASS / FAIL
W2 BOM sidebar: PASS / FAIL
W3 Chambers_default in workflows: PASS / FAIL
W4 no duplicate project columns: PASS / FAIL
W5 document upload/preview/download: PASS / FAIL
W6 phone browser over LAN: PASS / FAIL

USERS
U1 users created: PASS / FAIL
U2 invite + token issued: PASS / FAIL
U3 invite link activates account: PASS / FAIL
U4 permissions differ by role: PASS / FAIL

iOS
I1 native build + cap sync: PASS / FAIL
I2 installs on iPhone: PASS / FAIL
I3 login on device: PASS / FAIL
I4 real data renders: PASS / FAIL

ANDROID
A1 installDebug: PASS / FAIL
A2 installs on phone: PASS / FAIL
A3 login on device: PASS / FAIL
A4 real data renders: PASS / FAIL

WALKTHROUGH
F1 customer: PASS / FAIL
F2 site: PASS / FAIL
F3 project + job number: PASS / FAIL
F4 asset: PASS / FAIL
F5 workflow assigned: PASS / FAIL
F6 own workflow created: PASS / FAIL
F7 run starts on phone: PASS / FAIL
F8 step data + camera photo: PASS / FAIL
F9 blocking issue raised: PASS / FAIL
F10 completion blocked (422): PASS / FAIL
F11 resolve + complete: PASS / FAIL
F12 signature: PASS / FAIL
F13 visible on web: PASS / FAIL
F14 opens offline: PASS / FAIL
F15 offline capture: PASS / FAIL
F16 auto-sync on reconnect: PASS / FAIL
F17 offline work on web: PASS / FAIL
F18 no duplicates after sync: PASS / FAIL

Blockers: none / <list with exact errors and log excerpts>
Local patches applied: NONE (expected)
Things that should be pre-set on a fresh cloud install: <list — anything you had to
configure by hand that a new deployment should already have>
```

**On any failure:** include the exact on-screen error, plus `docker compose -f docker-compose.staging.yml logs api --tail 50`. For native failures include the Xcode or Gradle error verbatim.

## PROMPT END
