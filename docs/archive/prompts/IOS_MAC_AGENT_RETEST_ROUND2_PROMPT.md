# Mac iOS agent — retest round 2 (logo 3D, capture table, docs sync, startup)

**Copy everything below the line into your Mac Cursor agent.**

Branch: `cursor/phase11-post-release-monitoring-cd21` @ latest on PR [#22](https://github.com/christianchavezmoya-bot/workflow-strt/pull/22)

**API backend:** `http://172.20.8.16:4000/api`

---

## PROMPT START

You are the **Mac iOS field agent** for **Commtrac Codex 915**. Retest after fixes for:

1. **Sync logo** — 3D depth coin spin (no disappear / no pause)
2. **Capture table** — all column headers pinned (feature + sign-off), not just Asset Tag
3. **Documents / Tips offline** — docx shows full page fit; reconnect does **not** re-download everything
4. **Startup connectivity** — no stuck “Server not responding” when phone is online and login works

Do **not** modify `server/`. Post pass/fail + screenshots on PR #22.

---

## Part 0 — Checkout + install

```bash
git clone https://github.com/christianchavezmoya-bot/workflow-strt.git
cd workflow-strt
git fetch origin
git checkout cursor/phase11-post-release-monitoring-cd21
git pull origin cursor/phase11-post-release-monitoring-cd21
npm ci
git log -1 --oneline
```

```bash
curl -s http://172.20.8.16:4000/api/health
echo "VITE_API_BASE=http://172.20.8.16:4000/api" > .env.production.local
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Install on **physical iPhone** (⌘R). Complete login + biometric lock if shown.

---

## Part 1 — Startup / server banner (IMPORTANT)

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Fresh install → open app while **online** | Login works |
| 2 | Within first **60 seconds** after login | Connectivity bar does **not** stay on **“Server not responding”** while API works |
| 3 | First-time user, **airplane ON** before login | “No internet” / cannot login — still correct |
| 4 | Returning user online | No misleading “Server unavailable” on login screen |

**FAIL:** “Server not responding” stuck for minutes while sync/login/API calls succeed.

---

## Part 2 — Sync logo (3D depth)

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Queue offline workflow saves → reconnect | Overlay appears |
| 2 | Watch logo entire flush | **Continuous** spin — does **not** vanish mid-rotation |
| 3 | Visual | **3D depth** (tilted card/coin with shadow); full Strata wordmark; vertical-axis flip |
| 4 | Backdrop | Crisp dim — not blurry |

**Screenshot:** mid-sync overlay.

---

## Part 3 — Capture table headers (all columns)

Open **Assets → Capture table** with feature columns + General Sign-Off visible.

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Scroll down through many rows | Asset Tag header pinned ✓ |
| 2 | Scroll up aggressively | **Feature column** field headers stay pinned — body text does not overlap |
| 3 | Same for **General Sign-Off** columns | Headers stay visible; no overlap |
| 4 | Horizontal scroll (if wide) | Vertical pin still holds |

**Screenshot:** mid-scroll showing feature/sign-off headers pinned.

---

## Part 4 — Documents + Tips offline

### 4a — Field sync once

Online → Sync Center → **Download now** → **Ready**.

### 4b — Offline list + preview

Airplane ON → **Documents** and **Tips & Tricks**:

| Check | PASS if |
|-------|---------|
| Lists | Cached items visible |
| PDF / image / video | Full preview + zoom |
| **DOCX** | Opens **fit-to-page** (whole page visible first); zoom out/in works |
| DOCX fail | Cropped “zoomed in” slice only — **FAIL** |

### 4c — Reconnect speed (IMPORTANT)

| Step | Action | PASS if |
|------|--------|---------|
| 1 | After offline preview works, reconnect | App usable within normal sync time |
| 2 | Open Documents + Tips online | Pages load quickly — **no long re-download** of every file |
| 3 | Sync Center | Pending queue clears; no multi-minute document blob storm |

**FAIL:** Reconnect triggers full library re-download every time (minutes-long sync).

---

## Part 5 — Deliverables (PR #22)

| Area | Pass/Fail | Notes |
|------|-----------|-------|
| Startup server banner | | |
| Sync logo 3D continuous | | |
| Capture table all headers | | |
| Documents/Tips offline | | |
| DOCX fit-to-page | | |
| Reconnect doc sync speed | | |

Attach 4 screenshots + device/iOS version + **go / no-go**.

## PROMPT END
