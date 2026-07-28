# Mac iOS agent — offline labels + sync conflict UX (PR #37)

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `cursor/offline-labels-sync-ux-cd21` @ **`705209e`** or newer

**PR:** [#37](https://github.com/christianchavezmoya-bot/workflow-strt/pull/37)

**API (Windows PC):** `http://172.20.8.16:4000/api` — Windows agent confirms health + JWT before you install

**Test user (installer):** `c_chavez_m@hotmail.com` (Juan Perez, Installer)

**Native app:** **N-go** | In-app: **Strata N-go**

**Known test assets:** CAD0017 (completed-on-web conflict), CAD0014 (duplicate workflow), CAD0018, CAD0007

**References:**
- [`AGENT_RETEST_INDEX.md`](./AGENT_RETEST_INDEX.md)
- [`WINDOWS_AGENT_OFFLINE_SYNC_UX_PROMPT.md`](./WINDOWS_AGENT_OFFLINE_SYNC_UX_PROMPT.md) — Windows runs first
- PR #36 auth fixes on `cursor/fix-native-launch-login-cd21` if testing full stack

---

## PROMPT START

You are the **Mac iOS field agent** for **N-go** offline label and sync conflict UX verification (PR #37).

### Your job (Mac + Xcode only)

1. Wait for **Windows agent** to confirm API @ `172.20.8.16` is up and commit hash matches
2. Pull **`cursor/offline-labels-sync-ux-cd21` @ 705209e+**, build, **install on physical iPhone**
3. Phone user runs **S1–S8** below — you facilitate rebuild; they execute on device
4. Post filled results table + screenshots on PR #37
5. Fix S0/S1 in `src/`/`ios/` only if blocking — report first

**Do NOT modify `server/`.** Do NOT commit `.env.production.local`.

**Not your scope:** Windows API config, admin web-only flows, phone browser (Option B).

---

## Part 0 — Checkout + build (Mac)

```bash
cd ~/path/to/workflow-strt   # adjust path
git fetch origin
git checkout cursor/offline-labels-sync-ux-cd21
git pull origin cursor/offline-labels-sync-ux-cd21
git log -1 --oneline    # MUST show 705209e or newer
npm ci
```

Verify API from Mac (same Wi‑Fi as iPhone):

```bash
curl -s http://172.20.8.16:4000/api/health
```

Build for device:

```bash
echo "VITE_API_BASE=http://172.20.8.16:4000/api" > .env.production.local
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Xcode: **physical iPhone** → signing team → **Product → Run** (⌘R).

Reply to team: **"N-go installed @ `<commit hash>` — start S1"**

---

## Part 1 — What shipped (context)

| Change | User-visible effect |
|--------|---------------------|
| Sync conflict — job finished on web | Plain card: *Your phone: In Progress → Server: Complete*; button **Update this phone** |
| Sync Center “lock” | Pull-to-refresh no longer shows bottom toast over open dialogs |
| Duplicate workflow assignment | Same workflow config shows **once** per asset (CAD0014 case) |
| Offline dashboard labels | Job numbers / asset tags instead of raw UUIDs where cached |
| Dropped sync actions | **Re-queue** on home banner; `offline-skip` does not burn retry budget |
| Accept server for run | Clears **all** queued ops for that workflow run |

**If phone still shows raw JSON conflicts or duplicate workflows, build is stale — rebuild @ 705209e+.**

---

## Part 2 — Prerequisites (phone user)

1. **Fresh login** after install (logout once if upgrading over old build)
2. Online → open **Sync Center** → **Download now** until **Ready**
3. Confirm topbar: **Has signal** + **Server reachable** (green)
4. Windows agent has CAD0017 **Complete on web** with signatures (or complete it during S4)

---

## Part 3 — Test matrix S1–S8 (phone user executes)

Run **in order**. Record pass/fail; attach screenshots for any FAIL.

### S1 — Offline dashboard labels

1. Login online; note **My Jobs Today** list
2. Airplane **ON**
3. Open **Home** / dashboard

| PASS | FAIL |
|------|------|
| Asset tags (**CAD00xx**) and **job numbers** visible | Raw UUIDs or blank job numbers |

---

### S2 — Sync Center opens cleanly (no bottom lock)

1. Online with **pending or failed sync** (or use existing failed item)
2. Tap **SYNC** badge → open **Sync Center**
3. Scroll inside Sync Center; optionally pull down slightly at top

| PASS | FAIL |
|------|------|
| Action buttons (**Update this phone**, Retry, Dismiss) stay tappable; **no** orange bar *"Finish your current changes before syncing"* covering buttons | Bottom warning blocks Sync Center actions |

---

### S3 — CAD0017 conflict — simple card (if conflict exists)

**Setup:** CAD0017 completed on **web** while phone had stale In Progress copy (Windows agent may set this up).

1. Open **Sync Center**
2. Find conflict for **CAD0017** / job **CAD0017**

| PASS | FAIL |
|------|------|
| Plain explanation (job finished on server); **Status** comparison only; primary **Update this phone** | Raw `timeTrackingJson` / UUID dump as main UI |

3. Tap **Update this phone**
4. Wait for sync badge to settle

| PASS | FAIL |
|------|------|
| Conflict clears; CAD0017 shows **Complete** on phone; server data unchanged | Conflict stuck; phone still In Progress |

**Screenshot:** Sync Center simple conflict card + after **Update this phone**.

---

### S4 — Complete job on web → phone catches up (if S3 not pre-staged)

1. Windows/web: open CAD0017 (or another assigned asset) → **complete run** with signatures on web
2. Phone: still offline or with stale run open → reconnect
3. Sync Center → resolve with **Update this phone**

| PASS | FAIL |
|------|------|
| Phone matches web Complete state; no data loss on server | Server overwritten by stale phone data |

---

### S5 — Duplicate workflow assignment (CAD0014)

1. Online → **Assets** → open **CAD0014**
2. View **Assigned Workflows**

| PASS | FAIL |
|------|------|
| Each workflow config listed **once** (e.g. one "AIM-100 Install 1 camera sys") | Two identical rows for same workflow |
3. **Start Run** still works

| PASS | FAIL |
|------|------|
| Run starts normally | Start blocked or wrong workflow |

---

### S6 — Offline write → reconnect sync

1. Login online
2. Airplane **ON**
3. Open assigned asset → save **1 workflow step** or pause run
4. Sync Center → pending ≥ 1
5. Wi‑Fi **ON** — do **not** logout

| PASS | FAIL |
|------|------|
| Pending drains; web matches phone | Pending stuck; web unchanged |

---

### S7 — Dropped action Re-queue (if banner shown)

If home shows red **action required** with **Re-queue**:

1. Tap **Re-queue**
2. Wait for sync

| PASS | FAIL |
|------|------|
| Item retries or resolves with clear message | Silent fail; `offline-skip` loops forever |

---

### S8 — Quick auth regression (optional, if PR #36 merged)

| Scenario | PASS |
|----------|------|
| Offline reopen (2+ min, airplane) | **Face ID**, not Login |
| Online reopen after JWT expiry (if Windows set short JWT) | **Login** screen |

Skip if Windows kept `ExpiresMinutes: 720`.

---

## Part 4 — Mac agent sanity (after install)

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| `git log -1` ≥ 705209e | | hash |
| Home screen **N-go** | | |
| `npm run build` clean on Mac | | |
| No desktop sidebar on native | | |

---

## Part 5 — Deliverables (post on PR #37)

| Test | Pass/Fail | Notes |
|------|-----------|-------|
| Mac install @ 705209e+ | | commit |
| S1 Offline labels | | |
| S2 Sync Center not locked | | |
| S3 CAD0017 simple conflict + Update phone | | |
| S4 Web complete → phone sync | | |
| S5 No duplicate workflow CAD0014 | | |
| S6 Offline write sync | | |
| S7 Re-queue (if applicable) | | |
| S8 Auth regression (optional) | | |

Attach screenshots for S2, S3, S5 minimum.

**If S1–S6 pass:** comment **"Mac retest GO for PR #37"**

**If S0/S1 FAIL:** screenshots + Sync Center export; do **not** sign off.

---

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Raw JSON in Sync Center | Pre-705209e build | Rebuild branch |
| Bottom toast over Sync Center | Pre-705209e build | Rebuild branch |
| Duplicate workflows | Stale IndexedDB | Reinstall app or clear app data; retest |
| CAD0017 conflict won't clear | Server not Complete | Windows verify web state |
| API unreachable | Wrong IP / firewall | `curl` health; check `.env.production.local` |

---

## PROMPT END
