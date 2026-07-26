# Windows agent — randomId rollout + phone web shell verification

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `main` @ **`d542f2d`** or newer

**Repo:** `https://github.com/christianchavezmoya-bot/workflow-strt` (local folder may be `Codex/915`)

**API:** `http://172.20.8.16:4000/api` (adjust if your LAN IP changed)

**Web:** `http://172.20.8.16:5173`

**Goal:** Verify PR stack on `main` after merge:
- Full **`randomId()`** rollout (HTTP LAN safe — no `crypto.randomUUID` crashes)
- **Phone web shell** fix (Option B — mobile browser only)
- **Strata N-go** branding + **Resend** email still working (smoke only)

**Reference commits:**
- `321daae` — Resend + Strata N-go rebrand
- `c48b8df` — invite `randomId` fix (UserManagement)
- `d542f2d` — full `randomId()` rollout + phone web shell

---

## PROMPT START

You are the **Windows web/API agent** for **Strata N-go**.

**Rules:**
- Do **not** commit machine-specific IP overrides (appsettings, `.env.production`)
- Resend API key stays in **user secrets only** — never paste full key
- You **may** fix S0/S1 bugs in `src/` or `server/` — report first for S2
- Do **not** merge PRs unless explicitly asked

---

## Part 0 — Checkout + config

```powershell
cd C:\Users\cchavez\Documents\Commtrac\Codex\915   # adjust path
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline    # expect d542f2d or newer
npm ci
```

Confirm local IP overrides (do not commit):

| Setting | Expected (example) |
|---------|-------------------|
| `appsettings*.json` → `Email:FrontendBaseUrl` | `http://172.20.8.16:5173` |
| `.env.production` → `VITE_API_BASE` | `http://172.20.8.16:4000/api` |
| User secrets `Email:ResendApiKey` | Set (redact as `re_…xxxx`) |

Start servers if not running:

```powershell
# Terminal 1
dotnet run --project server/Commtrac.Api

# Terminal 2
npm run dev
```

Hard-refresh browser after pull (`Ctrl+Shift+R`).

---

## Part 1 — PC web (wide screen) — must be **unchanged**

Open `http://172.20.8.16:5173` on a **desktop browser** (wide window).

| Check | PASS if |
|-------|---------|
| Left **sidebar** visible (Full view) | Yes |
| Topbar **Full View / Minimal View** chip | Visible and toggles |
| Browser tab title | **Strata N-go** |
| Toggle Minimal view | Sidebar hides; layout OK |
| No console errors on Dashboard load | Clean |

---

## Part 2 — Phone web shell (Option B) — **mobile browser only**

Use **Chrome DevTools device mode** (iPhone profile, width ≤768px) **or** a real phone on the same LAN opening `http://172.20.8.16:5173`.

| Check | PASS if |
|-------|---------|
| **Bottom tab bar** visible | Dashboard, Projects, Assets, etc. |
| **Left sidebar** | **Not visible** (not mounted) |
| **Full View / Minimal View** chip | **Hidden** |
| App title **Strata N-go** still shown in topbar | Yes |
| No mixed desktop sidebar + bottom tabs | Clean single shell |
| Navigate Projects → Assets | Works; no layout overlap |

**Native N-go app is NOT tested here** — that is the Mac agent’s job.

---

## Part 3 — `randomId()` / HTTP LAN (no secure-context crashes)

All tests on **`http://172.20.8.16:5173`** (plain HTTP — **not** localhost). Watch browser console for `crypto.randomUUID is not a function`.

### 3a — Admin invite (regression)

1. **Admin → Users → Invite new user**
2. Fill name, email (test address you control), role **Installer**
3. Tap **Send invite**

| PASS if |
|---------|
| No console error |
| User appears in list |
| API log: `Email sent via Resend` (or simulated if no key) |
| Invite email received (may land in junk — deliverability is separate) |

### 3b — Additional HIGH-risk flows (pick at least 2)

| Flow | Steps | PASS if |
|------|-------|---------|
| **Settings** | Admin → Settings → add a custom field row / tab action that generates an id | No `randomUUID` error |
| **Dashboard photo** | Open photo upload dialog on an asset (if available) | Dialog opens; no crash |
| **Workflow runner** | Open a workflow run; add BOM line item or issue | Saves without console error |
| **Time entries** | Edit time entries on a run | Dialog saves |

If any flow throws `crypto.randomUUID is not a function`, note file + line — that site was missed in rollout.

---

## Part 4 — Resend smoke (optional, 2 min)

Only if user secrets key is configured:

```powershell
$login = Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"admin@commtrac.local","password":"Admin123!"}'

Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/settings/notifications/test-email" `
  -Headers @{ Authorization = "Bearer $($login.token)" } `
  -ContentType "application/json" `
  -Body '{"toEmail":"YOUR_EMAIL@example.com"}'
```

| PASS if |
|---------|
| `mode` = `resend`, `sent` = `true` |

---

## Part 5 — Deliverables

Post this table filled in:

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| `main` @ d542f2d+ | | commit hash |
| PC web sidebar + Full/Minimal toggle | | unchanged? |
| Phone web: bottom tabs only | | |
| Phone web: no Full View chip | | |
| Invite user (no randomUUID error) | | |
| Additional HIGH flow 1 | | |
| Additional HIGH flow 2 | | |
| Resend smoke (optional) | | |
| Console clean on phone web | | |

Include: browser(s) used, viewport width for phone web test, `git log -1 --oneline`.

**Severity guide:** `crypto.randomUUID` crash on HTTP LAN = **S1**. Mixed shell on phone web = **S2**. PC web regression = **S1**.

---

## PROMPT END

**Note:** Changing LAN IP later only requires updating `FrontendBaseUrl` + `VITE_API_BASE` — **no** `randomId()` rework.
