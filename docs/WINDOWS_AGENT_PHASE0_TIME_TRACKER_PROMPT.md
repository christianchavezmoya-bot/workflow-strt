# Windows agent — Phase 0 time-tracker smoke (ladder + timeline + Fix 1/2)

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `cursor/time-tracker-handover-plan-cd21` @ **`f994388`** (or newer on that branch)  
**PR:** [#45](https://github.com/christianchavezmoya-bot/workflow-strt/pull/45) — docs + Phase 0 unit tests (draft)  
**Product code under test:** already on **`main`** (`d7ad54e` — Fix 1/2 + Phase 1/2 foundation). This branch = `main` + smoke report + unit tests.  
**Do not merge** unless the cloud agent asks. Do not commit LAN IP / JWT overrides.

**API host (this PC — adjust if needed):** `http://10.7.62.140:4000/api`  
**Web:** `http://localhost:5173` (or `http://10.7.62.140:5173`)  
**Login:** `admin@commtrac.local` / `Admin123!`  
**Mac agent prompt:** [`IOS_MAC_AGENT_PHASE0_TIME_TRACKER_PROMPT.md`](./IOS_MAC_AGENT_PHASE0_TIME_TRACKER_PROMPT.md) — run **after** you confirm API ready + post the commit hash

---

## PROMPT START

You are the **Windows web/API agent** for Strata / Commtrac Phase 0 time-tracker verification.

### What this round is

| Already on `main` (behavior to smoke) | On this PR branch only |
|---------------------------------------|-------------------------|
| Fix 1/2 offline start-time sync | `docs/PHASE0_TIME_TRACKER_SMOKE_REPORT.md` |
| `canEditRun` ladder + time editor gates | Unit tests for ladder + Model B timeline |
| `RunTimeline` on runner summary | Handover plan doc |

**Pull / merge guidance:**
- Checkout **`cursor/time-tracker-handover-plan-cd21`** (includes current `main` + Phase 0 artifacts).
- You do **not** need to merge #45 to test product behavior — behavior is already on `main`.
- Do **not** merge #45 yourself. Report results; cloud agent decides merge.
- Offline phone path (**T1**) is Mac/iPhone — you only confirm API ready and run **web** tests + unit tests.

---

## Part 0 — Pull + servers

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt   # adjust path if Codex\915
git fetch origin
git checkout cursor/time-tracker-handover-plan-cd21
git pull origin cursor/time-tracker-handover-plan-cd21
git log -1 --oneline
# expect: f994388 Phase 0: verify time-tracker ladder...  (or newer)
npm ci
```

Confirm local overrides (do **not** commit):

| Setting | Expected |
|---------|----------|
| `.env` → `VITE_API_BASE` | `http://<YOUR-LAN-IP>:4000/api` |
| JWT for long sessions (optional) | `Jwt:ExpiresMinutes` = **1440** in Development if you need it |

**Terminal 1 — API** (LAN-bound so phone/Mac can hit it later):

```powershell
cd server\Commtrac.Api
dotnet run
```

```powershell
curl http://10.7.62.140:4000/api/health
# adjust IP — expect OK / healthy JSON
```

**Terminal 2 — Web:**

```powershell
npm run dev
```

Open **http://localhost:5173** (desktop, wide window).

Post to team when ready:

```
Windows ready @ <commit hash>
Branch: cursor/time-tracker-handover-plan-cd21
API: http://<LAN-IP>:4000/api/health OK
Web: http://localhost:5173
Mac: use same commit for T1 offline phone if needed
```

---

## Part 1 — Automated (must run)

```powershell
npx vitest run src/utils/runEditPermissions.test.ts src/utils/timelineModel.test.ts
```

| ID | Check | PASS if |
|----|-------|---------|
| A1 | Ladder + timeline unit tests | **12 passed**, 0 failed |

Also optional full frontend typecheck:

```powershell
npx tsc -b
```

---

## Part 2 — Web UI smoke (T2–T5)

Use Topbar **role override**. **Engineer** = installer stand-in (Installer is not in the menu).

Pick a project with a published workflow + an asset you can start/run (or an existing in-progress / signed run).

### W1 — Before sign (None / PendingInstaller)

1. Role → **Engineer**. Open a run that is not yet customer-pending (in progress or pending installer).
2. Open **Edit Times** (runner header or Run History clock).
3. Switch role → **Admin** (or Project Manager). Open the same editor again.

| ID | PASS if |
|----|---------|
| W1a | Engineer can edit time entries (not stuck read-only) |
| W1b | Admin/PM can edit time entries |

### W2 — PendingCustomer (installer signed, customer not)

1. Use a run with installer signed / awaiting customer (`PendingCustomer`), or complete installer sign-off on a test run **without** customer sign.
2. As **Engineer**: open time editor → expect **read-only** (cannot save edits).
3. As **Admin/PM**: open time editor → expect **editable**.

| ID | PASS if |
|----|---------|
| W2a | Engineer locked out of time edits |
| W2b | Admin/PM can still correct time |

### W3 — Signed

1. Open a **customer-signed** (`Signed`) run (or finish customer sign on a disposable test run).
2. As Engineer **and** Admin: time editor is **read-only**.

| ID | PASS if |
|----|---------|
| W3 | Everyone read-only on time |

### W4 — Summary timeline (Model B)

1. Start or continue a run; accumulate some productive time; create a **long gap** (pause overnight via edited entries, or downtime then long wait / edit entries so there is a multi-hour gap).
2. Reach the runner **summary** screen.
3. Confirm timeline bar: productive (green) / downtime (amber); long pause is a **thin** break divider (tooltip), **not** a huge grey block.

| ID | PASS if |
|----|---------|
| W4 | Timeline visible; pause = thin break, not proportional swamp |
| W4 note | Times may show **UTC** until Phase A wires project `timeZoneId` — that is expected |

### W5 — Quick regression

| ID | Check | PASS if |
|----|-------|---------|
| W5 | Login → Dashboard → Assets → open runner | No console errors blocking the flow |

### Offline Fix 1/2 (T1) — Windows cannot fully prove

| ID | Action |
|----|--------|
| T1 | Confirm API is up for Mac/phone. Offline start → sync → non-zero productive time is **phone**. Mark T1 as **deferred to Mac** unless you have a native Android build on this PC. |

---

## Part 3 — Report format (paste back)

```
Phase 0 Windows smoke @ <hash>
Branch: cursor/time-tracker-handover-plan-cd21

A1 unit tests: PASS / FAIL (n passed)
W1a Engineer before sign: PASS / FAIL
W1b Admin before sign: PASS / FAIL
W2a Engineer PendingCustomer: PASS / FAIL / SKIP (no run)
W2b Admin PendingCustomer: PASS / FAIL / SKIP
W3 Signed lock: PASS / FAIL / SKIP
W4 Timeline Model B: PASS / FAIL
W5 Smoke: PASS / FAIL
T1 Offline Fix1/2: DEFERRED TO MAC / PASS (if you ran native)

Console errors: none / <list>
Blockers: none / <list>
Merge #45?: NO (cloud agent decision)
```

**Rules:** Do not merge. Do not commit `.env` IP changes. Fix only S0/S1 crashers in `src/` if needed — report first. When done, tell Mac agent API is ready at this commit if they will run T1.

## PROMPT END
