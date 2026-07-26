# Windows agent — Resend email setup + Strata N-go verification

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `cursor/strata-ngo-resend-email-cd21` (PR #23) — or `main` after merge

**Repo:** `https://github.com/christianchavezmoya-bot/workflow-strt`

**Goal:** Configure the Resend API key securely on Windows, verify outbound email, and confirm **Strata N-go** / **N-go** branding. Do **not** commit secrets.

**Resend key file (local only, never commit):**
`C:\Users\cchavez\Documents\Commtrac\API keys\Ngo_cloudflare\Ngo_cloudflare.txt`

**Setup reference:** `docs/RESEND_EMAIL_SETUP.md`

---

## PROMPT START

You are the **Windows web/API agent** for **Strata N-go** (Commtrac Codex 915).

Your job:

1. Pull the Resend email branch and run API + web locally
2. Store the Resend API key in **.NET user secrets only** (read from the local key file — never commit it)
3. Verify the test email endpoint and core email flows
4. Confirm Strata N-go branding in the web UI
5. Post a filled results table

**Rules:**

- **Never** put the Resend API key in `appsettings.json`, `.env`, React code, git, or GitHub
- **Never** read or paste the full API key into chat logs or PR comments — redact as `re_…xxxx`
- You **may** edit `server/` and `src/` only to fix bugs found during verification (report first)
- Default admin (if fresh DB): `admin@commtrac.local` / `Admin123!`

---

## Part 0 — Checkout

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt   # adjust if different
git fetch origin
git checkout cursor/strata-ngo-resend-email-cd21
git pull origin cursor/strata-ngo-resend-email-cd21
git log -1 --oneline
npm ci
```

If PR #23 is already merged:

```powershell
git checkout main
git pull origin main
```

---

## Part 1 — Configure Resend API key (user secrets)

Read the key from the local file (do not commit this file):

```powershell
$key = (Get-Content "C:\Users\cchavez\Documents\Commtrac\API keys\Ngo_cloudflare\Ngo_cloudflare.txt" -Raw).Trim()
dotnet user-secrets set "Email:ResendApiKey" $key --project server/Commtrac.Api
```

Verify it is set (shows key name only, not value in output ideally):

```powershell
dotnet user-secrets list --project server/Commtrac.Api
```

Expected: `Email:ResendApiKey` appears in the list.

**Do not** add `ResendApiKey` to `server/Commtrac.Api/appsettings.json`.

---

## Part 2 — Start API + web

**Terminal 1 — API (port 4000):**

```powershell
cd server/Commtrac.Api
dotnet run
```

Wait for `[DB] Resolved path:` and listening on port 4000. Swagger: `http://localhost:4000/swagger`

**Terminal 2 — Web (port 5173):**

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt
npm run dev
```

Open `http://localhost:5173` and sign in as Admin.

---

## Part 3 — Health + test email

**Health check:**

```powershell
curl http://localhost:4000/api/health
```

**Login + test email** (replace email with a real inbox you can check):

```powershell
$login = Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"admin@commtrac.local","password":"Admin123!"}'

$token = $login.token

$result = Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/settings/notifications/test-email" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"toEmail":"YOUR_REAL_EMAIL@example.com"}'

$result | ConvertTo-Json
```

| PASS if | |
|---------|---|
| Response `mode` is **`resend`** | Not `simulated` |
| Response `sent` is **`true`** | |
| Email arrives within ~2 min | From **Strata-ngo &lt;noreply@strata-ngo.com&gt;** |
| Subject contains **Strata N-go test email** | |

If `mode` is `simulated`, the user secrets key was not loaded — re-run Part 1 and restart `dotnet run`.

---

## Part 4 — Core email flows

Run each flow; email failure must **not** break the app (check API logs only).

### 4a — User invitation

1. Settings → Users (or User Management)
2. Pick a test user → **Send invite**
3. **PASS:** invite email received; link opens reset-password page; copy says **Strata N-go**

### 4b — Password reset

1. Log out → **Forgot password** with a known user email
2. **PASS:** reset email received; subject/body reference **Strata N-go**

### 4c — Customer signature / workflow link

1. Open a **completed** workflow run (installer sign-off done, customer signature pending)
2. Create/send a signature token to a test email
3. **PASS:** signature email received with sign link; sender **Strata-ngo**

### 4d — Workflow completion notification

1. Complete a field workflow run (no blocking issues)
2. **PASS:** Admin/PM inboxes receive **Workflow completed — {asset} ({job})** email

---

## Part 5 — Strata N-go branding (web)

| Surface | Expected |
|---------|----------|
| Browser tab / `index.html` title | **Strata N-go** |
| Login page welcome (first-time) | **Welcome to Strata N-go** |
| Sidebar / topbar default name | **Strata N-go** (or brand setting override) |
| PDF report header | **Strata N-go** |

Native app name **N-go** is verified on phone builds separately (Mac agent).

---

## Part 6 — Deliverables

Post this table filled in (PR #23 comment or team thread):

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Branch checked out | | commit hash |
| User secrets `Email:ResendApiKey` set | | do not paste key |
| API health 200 | | |
| Test email `mode=resend` | | |
| Test email received in inbox | | |
| Invite email | | |
| Password reset email | | |
| Signature link email | | |
| Workflow completion email | | |
| Web branding Strata N-go | | |

Include: Windows version, `git log -1 --oneline`, test recipient domain (not full key), any API log excerpts (redacted).

**If anything fails:** capture `dotnet run` console lines containing `Resend` or `Email`; do not paste API keys.

---

## PROMPT END

**After pass:** merge PR #23 to `main`. Production/staging should use environment variable `Email__ResendApiKey` instead of user secrets.
