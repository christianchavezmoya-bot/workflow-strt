# Mac iOS agent — sanity check install (`main`) before final offline sign-off

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `main` @ **`fcdaba6`** or newer (merged PR #22 — all field fixes are on `main`)

**API:** `http://172.20.8.16:4000/api`

**Goal:** Install a fresh phone build, run a **short sanity pass** (~30 min). If pass, the human tester proceeds with **acceptance matrix rows 1–9** and **Layer C** (see `docs/OFFLINE_CLOSURE_GUIDE.md`).

---

## PROMPT START

You are the **Mac iOS field agent** for **Commtrac Codex 915**.

1. Pull **`main`**, build, install on **physical iPhone**
2. Run **sanity check** below (all must pass)
3. Post results on the release sign-off thread (or PR comment) so the team can run remaining matrix + Layer C tests

Do **not** modify `server/`. You may fix `src/`/`ios/` only for S0/S1 bugs found during sanity — report first.

---

## Part 0 — Checkout `main`

```bash
git clone https://github.com/christianchavezmoya-bot/workflow-strt.git
cd workflow-strt
git checkout main
git pull origin main
git log -1 --oneline    # expect fcdaba6 or newer
npm ci
```

---

## Part 1 — API + install

```bash
curl -s http://172.20.8.16:4000/api/health
```

Must return HTTP 200 / health JSON before device testing.

```bash
echo "VITE_API_BASE=http://172.20.8.16:4000/api" > .env.production.local
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Xcode: **physical iPhone** → signing `com.christianchavez.kinet` → **Product → Run** (⌘R).

Login with field installer account (assigned assets, **Assets → Field User Workflow**).

---

## Part 2 — Bootstrap (required once per install)

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Online → open **Sync Center** (top status badge) | Panel loads |
| 2 | Tap **Download now** | Completes; chip **Ready** (or **Data may be stale**, not “Not downloaded”) |
| 3 | Sync badge | **Synced** when idle online |

---

## Part 3 — Sanity check (~30 min)

### 3a — Startup connectivity

| Step | PASS if |
|------|---------|
| Force-quit app → reopen **while online** | Login/session works |
| Within **60 s** | Connectivity bar does **not** stay **“Server not responding”** while API works |

### 3b — Sync overlay + 3D logo

| Step | PASS if |
|------|---------|
| Airplane ON → save **3–5 workflow steps** | Pending > 0 in Sync Center |
| Reconnect | Overlay appears briefly |
| Logo | **Continuous** 3D coin spin (Strata wordmark); does not vanish mid-rotation |
| After flush | Overlay gone; badge **Synced** |

### 3c — Capture table headers

| Step | PASS if |
|------|---------|
| Assets → **Capture table** (10+ rows, feature + sign-off columns) | |
| Scroll up/down | **All** header rows pinned — Asset Tag, feature columns, General Sign-Off; body does not overlap headers |

### 3d — Documents + Tips offline

| Step | PASS if |
|------|---------|
| After Part 2 bootstrap, airplane ON | |
| **Documents** list | Cached items visible |
| Open **PDF** + **DOCX** offline | Full-screen preview; **DOCX shows full page** (not cropped zoom); pinch/zoom OK |
| **Tips & Tricks** | Cached tips visible; one preview opens offline |
| Reconnect online → open Documents | **No multi-minute** re-download of every file |

---

## Part 4 — Deliverables

Post this table filled in:

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Install from `main` @ 172.20.8.16 | | |
| Bootstrap Ready | | |
| Startup server banner | | |
| Sync overlay + 3D logo | | |
| Capture table headers | | |
| Documents/Tips offline + DOCX | | |
| Reconnect doc sync speed | | |

Include: device model, iOS version, `git log -1 --oneline`, 2–3 screenshots.

**If all pass:** reply **“Sanity OK — proceed with matrix + Layer C”** so the human tester can continue.

**If any fail:** severity (S0/S1/S2), steps, support bundle from Sync Center.

---

## What happens next (human tester — not this agent’s job)

After sanity pass, complete:

1. **`docs/OFFLINE_ACCEPTANCE_MATRIX.md`** — rows **1–9** (row 9 needs ~12 h idle)
2. **`docs/RELEASE_CHECKLIST.md` Layer C** — manual regression sign-off
3. **`docs/OFFLINE_CLOSURE_GUIDE.md`** — full closure checklist

## PROMPT END
