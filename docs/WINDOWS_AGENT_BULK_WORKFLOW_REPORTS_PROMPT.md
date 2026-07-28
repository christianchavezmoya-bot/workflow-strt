# Windows agent — bulk View / Print Reports (web desktop)

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `cursor/bulk-workflow-reports-web-cd21` (PR #42) — or `main` after merge

**Repo:** `https://github.com/christianchavezmoya-bot/workflow-strt`

**Goal:** Verify **View / Print Reports** on the Assets page (web PC only): bulk PDF preview, explorer, downloads, print, sort, retry, and Admin/PM email/share. **Do not** change workflow runs, assignments, or mobile behavior.

**Optional (email/share only):** Resend key in .NET user secrets — see `docs/WINDOWS_AGENT_RESEND_EMAIL_PROMPT.md` and `docs/RESEND_EMAIL_SETUP.md`. Never commit secrets.

**Default admin:** `admin@commtrac.local` / `Admin123!`

---

## PROMPT START

You are the **Windows web/API agent** for **Strata N-go** (Commtrac Codex 915).

Your job:

1. Check out PR #42 branch and run API + web locally
2. Walk through the bulk report dialog on **Assets** (desktop browser, wide window)
3. Verify preview, sort, print, download current, bulk download, and (Admin/PM) email/share
4. Confirm feature is **hidden** on narrow/mobile layout
5. Post a filled results table

**Rules:**

- **Never** commit machine-specific IP overrides or API keys
- You **may** fix S0/S1 bugs in `src/` or `server/` for this feature — report first for S2
- Do **not** merge PRs unless explicitly asked
- This feature is **web report delivery only** — do not modify workflow runner, assignments, or signature flows except to smoke-test they still work

---

## Part 0 — Checkout

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt   # adjust if different
git fetch origin
git checkout cursor/bulk-workflow-reports-web-cd21
git pull origin cursor/bulk-workflow-reports-web-cd21
git log -1 --oneline
npm ci
```

If PR #42 is already merged:

```powershell
git checkout main
git pull origin main
```

---

## Part 1 — Start API + web

**Terminal 1 — API (port 4000):**

```powershell
cd server/Commtrac.Api
dotnet run
```

Wait for DB migrate + listening on port 4000. Swagger: `http://localhost:4000/swagger`

**Terminal 2 — Web (port 5173):**

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt
npm run dev
```

Open `http://localhost:5173` in a **desktop browser** (window wide enough to show the left sidebar — not phone emulation).

Sign in as **Admin** (or **Project Manager** for email/share tests).

---

## Part 2 — Navigate to Assets

1. Go to **Installations → Assets** (route: `/installations/assets`)
2. Select a **project** that has several assets (mix of statuses if possible: Not started, In progress, Complete)
3. Confirm the table shows checkboxes in the first column

---

## Part 3 — Toolbar gating

| Check | PASS if |
|-------|---------|
| **View / Print Reports** visible in table toolbar (desktop) | Yes, next to Print / PDF |
| Button **disabled** with zero selection | Yes |
| Narrow browser / mobile emulation | Button **not** shown (or desktop toolbar hidden) |
| Select 1+ assets → bulk bar appears | Shows **View / Print Reports** in selection bar too |

---

## Part 4 — Open bulk report dialog

1. Checkbox-select **≥2 assets** (pick different statuses if available)
2. Click **View / Print Reports**
3. Dialog opens: left **explorer** (asset tags) + right **PDF iframe**

| Check | PASS if |
|-------|---------|
| Progress bar while PDFs generate | Shows then completes |
| Explorer lists all selected assets | Tags + status/signature chips |
| Clicking explorer row updates preview | PDF changes |
| Search filters explorer | Tag/name/serial filter works |
| **Sort explorer** dropdown | Tag / status / signature / completed reorder list |
| **Prev / Next** + ↑↓ keys | Navigates list |

---

## Part 5 — Preview actions

With one asset selected in the explorer:

| Check | PASS if |
|-------|---------|
| **Print** | Opens PDF print dialog (allow popups if blocked) |
| **Download current** | Saves single PDF for active asset only |

---

## Part 6 — Bulk download

1. Set **Download filter** (e.g. **All reports**, then try a signature subset)
2. Note match count in footer

| Check | PASS if |
|-------|---------|
| **Download PDFs (N)** | N separate PDF files download |
| **Download ZIP (N)** | One ZIP with N PDFs inside |
| Filter reduces N | Count matches filter; explorer still shows all selected |

---

## Part 7 — Retry (if any failure)

If any asset shows **Retry needed** (red row) — or simulate by refreshing mid-load:

| Check | PASS if |
|-------|---------|
| Retry icon in explorer | Regenerates that asset’s PDF |
| Preview pane **Retry now** | Same behavior |

If all assets load cleanly, note **N/A — no failures**.

---

## Part 8 — Email / Share (Admin or PM only)

Requires Resend configured (`Email:ResendApiKey` in user secrets) for real delivery. Without it, API **simulates** email (check `dotnet run` logs).

1. In bulk dialog, click **Email / Share**
2. Test recipient tabs:

| Tab | Action | PASS if |
|-----|--------|---------|
| **Project contacts** | Select customer contact(s) from current project | Listed (primary signer pre-selected if configured) |
| **Users** | Select Commtrac user(s) | Active users with email listed |
| **Custom email** | Add your test inbox | Added to recipient list |

3. **Copy share link** → paste in browser → ZIP downloads
4. **Send email** with short message → check inbox

| Check | PASS if |
|-------|---------|
| Share link downloads ZIP | PDFs inside match filtered set |
| Email received | Link or single PDF attachment |
| **Viewer / Installer** login | **Email / Share** button **not** shown |

Use a **real inbox you control** for send tests. Redact addresses in the results table.

---

## Part 9 — Regression smoke (unchanged areas)

Quick sanity only — do **not** refactor workflow code.

| Check | PASS if |
|-------|---------|
| Single-asset **View/Export Report** (row menu) still works | Opens single PDF dialog |
| **Print / PDF** (asset list table) still works | Unchanged list PDF |
| Assign workflow / run workflow on asset | Still works as before |

---

## Part 10 — Deliverables

Post this table (PR #42 comment or team thread):

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Branch + commit | | |
| API + web running | | |
| Desktop toolbar button gating | | |
| Dialog explorer + preview | | |
| Sort + search + prev/next | | |
| Print current | | |
| Download current | | |
| Download PDFs + ZIP | | |
| Download filter count | | |
| Retry (or N/A) | | |
| Email / Share — copy link | | |
| Email / Share — send email | | |
| PM/Admin only for share | | |
| Mobile/narrow hidden | | |
| Workflow regression smoke | | |

Include: Windows version, `git log -1 --oneline`, browser used, project/job tested, asset count selected.

**If email fails:** capture API log lines with `Resend` or `asset-report-shares` (no API keys).

---

## PROMPT END

**Scope reminder:** This PR adds web-only bulk **installation record** PDF preview/download/share. It does **not** replace the existing **Print / PDF** asset **list** export or change workflow assignment logic.
