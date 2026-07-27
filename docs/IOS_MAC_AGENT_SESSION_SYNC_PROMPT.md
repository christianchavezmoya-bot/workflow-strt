# Mac iOS agent — Session timeout + offline sync retest (N-go)

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `main` @ **`62da009`** or newer (includes PRs #25–#31)

**API (Windows PC):** `http://172.20.8.16:4000/api` — must have **`Jwt:ExpiresMinutes: 1`** in Development until T1–T7 pass (Windows agent confirms)

**Test user (installer):** `c_chavez_m@hotmail.com` — 1 assigned asset

**Native app:** **N-go** | In-app branding: **Strata N-go**

**References:**
- `docs/NATIVE_SESSION_SYNC_RESOLUTION_PLAN.md` (findings + full plan)
- `docs/IOS_MAC_AGENT_NGO_LATEST_PROMPT.md` (branding sanity, row 9 @ 720 min later)

---

## PROMPT START

You are the **Mac iOS field agent** for **N-go** session timeout and offline→online sync verification.

### Your job (Mac + Xcode only)

1. Pull **`main` @ 62da009+**, build, **install on physical iPhone** (replace existing N-go)
2. Confirm build hash with phone user before they test
3. Coordinate with **Windows agent**: API health + `ExpiresMinutes: 1` active
4. **Phone user runs T1–T7** (below) — you facilitate rebuild; they execute on device
5. Post filled results table; fix S0/S1 in `src/`/`ios/` only if blocking — report first

**Do NOT modify `server/`.** Do NOT change Windows IP in committed files.

**Not your scope:** phone web browser (Option B), admin web JWT test, Windows API config.

---

## Part 0 — Checkout + build (Mac)

```bash
cd ~/path/to/workflow-strt   # adjust path
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline    # MUST show 62da009 or newer
npm ci
```

Verify API from Mac (same Wi‑Fi as iPhone):

```bash
curl -s http://172.20.8.16:4000/api/health
# expect: {"status":"running"} or similar 200
```

Build for device:

```bash
echo "VITE_API_BASE=http://172.20.8.16:4000/api" > .env.production.local
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Xcode: select **physical iPhone** → signing team → **Product → Run** (⌘R).

Reply to phone user: **"N-go installed @ `<commit hash>` — start T1"**

---

## Part 1 — What was fixed (context for retest)

| PR | Fix |
|----|-----|
| #25 | Online + expired JWT → Login (not Face ID only) |
| #27 | Sync queue preserved on 401; overlay unsticks |
| #28 | Keychain session kept for offline Face ID |
| #29 | No reload loop (flash Loading / app won't open) |
| #30 | 1-min test JWT no longer auto-refreshed on every ping |
| #31 | token-expired deadlock; no dummy U before auth load; 60s expiry check |

**If phone still shows old behaviour, the build is stale — rebuild from 62da009+.**

---

## Part 2 — Session policy (expected behaviour)

| Scenario | Expected |
|----------|----------|
| First install or **logout** → open | **Login** screen |
| **Online**, JWT expired (2+ min with ExpiresMinutes=1) | **Login** |
| **Online**, app open 2+ min idle, then tap anything | **Login** within ~60s |
| **Offline** reopen (within 30-day grace) | **Face ID** (not Login) |
| **Offline → online**, JWT expired | **Login**, then sync |
| **Offline → online**, JWT valid | Pending queue **uploads without logout** |

Avatar **"U"** was a loading placeholder — should **not** appear after #31 once user is loaded.

---

## Part 3 — Test matrix T1–T7 (phone user executes)

Tell the phone user to run these **in order** after your install. They report pass/fail; you record.

### T1 — Clean login entry

1. In N-go: **Logout** (or delete app + reinstall)
2. Open app  

| PASS | FAIL |
|------|------|
| **Login** screen (Welcome to Strata N-go) | Dashboard with dummy **U** avatar |

---

### T2 — Online cold start after JWT expiry

1. Login online as `c_chavez_m@hotmail.com`
2. **Force-quit** N-go (swipe away)
3. Wait **2+ minutes** (Wi‑Fi ON)
4. Open N-go again  

| PASS | FAIL |
|------|------|
| **Login** screen, stable (no flash loop) | Face ID only, or Loading flash loop |

---

### T3 — Offline cold start (Face ID)

1. Login online
2. **Airplane mode ON**
3. Force-quit → wait **2+ minutes** → reopen (**still offline**)  

| PASS | FAIL |
|------|------|
| **Face ID** unlock | Login screen (can't sign in offline) |

---

### T4 — Offline → online after expiry

1. After T3 Face ID unlock (still offline OK)
2. Turn **Wi‑Fi ON** (airplane off) while in app  

| PASS | FAIL |
|------|------|
| **Login** prompt OR sync after login | Stuck sync overlay 0% forever |

---

### T5 — Offline field write queued

1. Login online (fresh if needed)
2. Airplane **ON**
3. Open assigned asset → complete **1 workflow step** → **pause** run
4. Open **Sync Center** → note pending count: `____`  

| PASS | FAIL |
|------|------|
| **Pending ≥ 1** | Pending 0 (work lost) |

---

### T6 — Offline → online sync (critical)

1. After T5 (still has pending), turn **Wi‑Fi ON**
2. **Do NOT logout**
3. Wait for sync badge / overlay to finish
4. On **Windows web** (same installer): check project asset / dashboard  

| PASS | FAIL |
|------|------|
| Pending drains; **web matches phone** | Web unchanged; only logout→login fixes it |

---

### T7 — Failure diagnostics (if T6 fails)

Record Sync Center message: `____`  
Record topbar: Offline / Online / pending count / sync error  

| PASS | FAIL |
|------|------|
| Clear message ("Sign in again", pending N, etc.) | Silent green sync, web empty |

---

## Part 4 — Mac agent sanity (quick, after install)

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| `git log -1` ≥ 62da009 | | hash |
| Home screen label **N-go** | | |
| Login shows **Strata N-go** | | |
| No desktop sidebar on native | | |
| `npm run build` clean | | |

---

## Part 5 — Deliverables (post to team)

Fill this table:

| Test | Pass/Fail | Notes |
|------|-----------|-------|
| Mac install @ 62da009+ | | commit |
| T1 Login on logout/fresh | | |
| T2 Online expiry → Login | | |
| T3 Offline → Face ID | | |
| T4 Offline→online | | |
| T5 Offline queue pending | | pending count |
| T6 Web updated without logout | | |
| T7 Diagnostics (if run) | | |

**If T1–T6 pass:** tell Windows agent: **"Retest passed — revert ExpiresMinutes to 720"**

**If any FAIL:** attach screenshots + Sync Center state; do **not** sign off row 9 yet.

---

## Part 6 — After 1-min test passes (later)

For production **12-hour** JWT (matrix row 9):

1. Windows reverts `ExpiresMinutes` → **720**, restarts API
2. Mac rebuilds same way (no code change)
3. Phone user runs **12 h idle** test per `docs/IOS_MAC_AGENT_NGO_LATEST_PROMPT.md` Part 4

---

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Flash Loading / won't open | Pre-#29 build | Rebuild @ 62da009+ |
| Never asks Login after 2 min | Pre-#30 build or API still 720 min | Rebuild + confirm Windows ExpiresMinutes=1 |
| Sync stuck 0% | Pre-#31 build | Rebuild |
| T6 fails only | token-expired or queue dropped | Capture Sync Center; file issue |
| App opens offline always | API unreachable | `curl` health from phone Safari |

---

## PROMPT END
