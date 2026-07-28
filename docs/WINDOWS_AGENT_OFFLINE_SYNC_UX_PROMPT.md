# Windows agent — offline labels + sync conflict UX (PR #37)

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `cursor/offline-labels-sync-ux-cd21` @ **`705209e`** or newer

**PR:** [#37](https://github.com/christianchavezmoya-bot/workflow-strt/pull/37)

**Repo:** `https://github.com/christianchavezmoya-bot/workflow-strt` (local folder may be `Codex/915`)

**API:** `http://172.20.8.16:4000/api` (adjust LAN IP if changed)

**Web:** `http://172.20.8.16:5173`

**Test user (installer):** `c_chavez_m@hotmail.com`

**Mac agent prompt:** [`IOS_MAC_AGENT_OFFLINE_SYNC_UX_PROMPT.md`](./IOS_MAC_AGENT_OFFLINE_SYNC_UX_PROMPT.md) — run **after** you confirm API ready

---

## PROMPT START

You are the **Windows web/API agent** for PR #37 offline sync UX verification.

**Rules:**
- Do **not** commit machine-specific IP overrides
- You **may** fix S0/S1 in `src/` or `server/` — report first
- Do **not** merge PRs unless explicitly asked
- Tell Mac agent when API is ready + commit hash

---

## Part 0 — Checkout + start servers

```powershell
cd C:\Users\cchavez\Documents\Commtrac\Codex\915   # adjust path
git fetch origin
git checkout cursor/offline-labels-sync-ux-cd21
git pull origin cursor/offline-labels-sync-ux-cd21
git log -1 --oneline    # expect 705209e or newer
npm ci
```

Confirm local overrides (do **not** commit):

| Setting | Expected |
|---------|----------|
| `.env` / `.env.production` → `VITE_API_BASE` | `http://172.20.8.16:4000/api` |
| `appsettings.Development.json` → `Jwt:ExpiresMinutes` | **720** for this round (16 h field test) unless team asked for 2-min JWT test |

Start servers:

```powershell
# Terminal 1 — API
dotnet run --project server/Commtrac.Api

# Terminal 2 — Web (for W1–W3)
npm run dev
```

Health check:

```powershell
curl http://172.20.8.16:4000/api/health
```

Post to team:

```
Windows ready @ <commit hash>
API: http://172.20.8.16:4000/api/health OK
Jwt:ExpiresMinutes = <value>
Mac: install cursor/offline-labels-sync-ux-cd21 @ <hash>
```

---

## Part 1 — What to verify on Windows (web)

PR #37 is **native-first**, but web is the source of truth for **CAD0017 completed-on-web** scenario.

| ID | Check | Steps | PASS if |
|----|-------|-------|---------|
| W1 | API serves PR branch | `git log -1` on running API folder matches 705209e+ | Yes |
| W2 | CAD0017 web state | Login web → find asset **CAD0017** → workflow run | **Complete** with installer + customer signatures (or complete during test) |
| W3 | Web completion sticks | After Mac **Update this phone**, refresh web CAD0017 | Still Complete; signatures intact |
| W4 | Job number on web | Project assets / dashboard for installer project | Job number **JO000999** (or expected) visible — not UUID |
| W5 | Assign workflow (smoke) | Assign one workflow to a test asset on web | Single assignment row; no duplicate on refresh |

---

## Part 2 — Stage CAD0017 conflict (optional, helps Mac S3)

If phone user no longer has a natural conflict:

1. On **web**: ensure CAD0017 run is **Complete** + signed
2. On **phone** (old build or offline): had run **In Progress** with queued time entry
3. After Mac installs **705209e+**, reconnect phone → Sync Center should show simple conflict

**Do not delete server data.** Server Complete state is authoritative.

---

## Part 3 — JWT settings for this round

| Test goal | `ExpiresMinutes` | Notes |
|-----------|------------------|-------|
| **Default for PR #37** | **720** (12 h) | Matches 16 h field test; offline grace handles reopen |
| Short JWT session test | **2** | Online idle → Login; **offline reopen still Face ID** (expected T3) |
| 16 h offline field test | **960** | User re-login after reconnect if JWT expired |

**This PR round:** use **720** unless Mac agent is explicitly running S8 with short JWT.

After test pass, keep **720** (production-like dev default).

---

## Part 4 — Firewall / LAN (if phone can't reach API)

If Mac `curl` or iPhone fails:

```powershell
# Run as admin if needed — repo script
.\allow-network-access.ps1
```

Confirm ports **4000** (API) and **5173** (Vite) open on `172.20.8.16`.

---

## Part 5 — Deliverables (post on PR #37)

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Checkout @ 705209e+ | | commit |
| API health | | |
| W2 CAD0017 Complete on web | | |
| W3 Web unchanged after phone sync | | |
| W4 Job numbers on web | | |
| W5 Assign workflow smoke | | |
| Mac agent notified | | |

When Mac posts retest results, reply with:

```
Windows W1–W5: <pass/fail>
Ready for merge: <yes/no>
```

---

## Part 6 — Merge rubric (with Mac results)

| Severity | Merge PR #37? |
|----------|----------------|
| S0 — server data overwritten by stale phone | **NO** |
| S0 — phone work lost after Update this phone | **NO** |
| S1 — Sync Center still locked / raw JSON for completed run | **NO** |
| S1 — duplicate workflows on asset | **NO** |
| S2 — minor copy / cosmetic | Fix or waiver |
| Mac S1–S6 + Windows W1–W5 pass | **GO** |

---

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Mac can't reach API | Check IP, firewall, `allow-network-access.ps1` |
| CAD0017 not Complete on web | Complete on web first; then test phone sync |
| 2-min JWT "doesn't work" offline | Expected: offline grace ≠ JWT expiry; document for team |
| `offline-skip` on banner | Mac S7; ensure 705209e+ build |

---

## PROMPT END
