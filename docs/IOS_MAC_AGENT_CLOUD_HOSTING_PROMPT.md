# Mac iOS agent — Cloud hosting AWS plan (native smoke + continue)

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `main` @ **`c54c0a7`** (or newer — match Windows hash)  
**Plan:** [`CLOUD_HOSTING_AWS_PLAN.md`](./CLOUD_HOSTING_AWS_PLAN.md)  
**Windows prompt:** [`WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md`](./WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md)  
**Native app:** **N-go** (Capacitor) · physical **iPhone**  
**Login:** `admin.dev@stratango.local` / `Admin123!`

**Goal:** Confirm cloud prep did **not** break native dev. Optionally verify prod API URL build. Mac does **not** own AWS deploy or `server/` Postgres/S3 profiles (Windows + Docker).

---

## PROMPT START

You are the **Mac iOS agent** for Commtrac **cloud hosting** verification.

### What's already implemented (context only)

| Area | Status | Notes for native |
|------|--------|------------------|
| Secrets / JWT | ✅ | Dev login unchanged |
| DB / Storage defaults | ✅ | **Sqlite + local disk** on Windows API — your normal LAN workflow |
| Postgres / S3 profiles | ✅ | Server-side only; test via Windows + Docker |
| Prod API URL | 🟠 | Use `.env.production.example` pattern for release builds |
| AWS deploy | ❌ | Phase 5 — not yet |

**Do not modify `server/`** unless the cloud agent explicitly assigns backend work. Focus on native build + field smoke.

---

## Part 0 — Wait → pull → install

1. Wait for Windows: `Windows cloud-hosting ready @ <hash> … Default dev: PASS`
2. Pull **same** commit.

```bash
cd ~/path/to/workflow-strt   # adjust
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
npm ci
```

Windows LAN API (replace IP):

```bash
curl -s http://10.7.62.140:4000/api/health
```

Native dev build (**untracked** — do not commit):

```bash
echo 'VITE_API_BASE=http://10.7.62.140:4000/api' > .env.production.local
# Windows LAN IP
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Xcode → physical iPhone → **Product → Run** (⌘R).

Reply:

```
N-go cloud-hosting smoke @ <hash>
API: http://<LAN-IP>:4000/api
iPhone: <model> / iOS <version>
```

---

## Part 1 — Quick native matrix (~10 min)

| ID | Test | PASS if |
|----|------|---------|
| M1 | Login | App login → Dashboard loads |
| M2 | Sync | Sync Center opens; no immediate 401 loop |
| M3 | Media | Start/open a workflow run; capture or view a photo step |
| M4 | Document | Open a document preview or Tips upload (if available) |
| M5 | Offline | Airplane mode 30s → app stays usable on cached data; reconnect syncs |

These confirm **default dev path** still works — cloud prep must not regress native offline-first behavior.

---

## Part 2 — Prod API URL build (optional)

Only if testing **production URL wiring** (no AWS yet — still points at LAN or staging):

```bash
cp .env.production.example .env.production.local
# Edit: VITE_API_BASE=https://api.yourdomain.com/api  OR Windows LAN for staging
npm run build && npx cap sync ios
# Reinstall on device
```

| ID | PASS if |
|----|---------|
| P1 | App reaches API at configured `VITE_API_BASE` (same Wi‑Fi / VPN as API) |

---

## Part 3 — Mac-side cloud work (only if assigned)

Typical Mac-owned follow-ups (not required for this smoke):

- Capacitor release checklist with prod `VITE_API_BASE`
- iOS ATS / HTTPS notes for cloud API
- Field validation after Windows stands up staging URL

Do **not** run AWS CLI deploy from Mac unless explicitly tasked in Phase 5 runbook.

---

## Part 4 — Report format (paste back)

```
Cloud hosting Mac/iPhone @ <hash>
API: http://<LAN-IP>:4000/api
iPhone: <model> / iOS <version>

M1 login: PASS / FAIL
M2 sync: PASS / FAIL
M3 workflow media: PASS / FAIL
M4 document: PASS / FAIL / SKIP
M5 offline: PASS / FAIL
P1 prod URL build: PASS / FAIL / SKIP

Blockers: none / <list>
```

**Rules:** Do not commit `.env.production.local`. Do not merge. Report blockers before fixing S0 crashes in `src/` / `ios/`.

### Before AWS deploy (mandatory gate)

After Windows confirms staging API + web are up, run the **phone section (P1–P8)** in **[`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md)**. Both web and phone must PASS before production cutover.

## PROMPT END
