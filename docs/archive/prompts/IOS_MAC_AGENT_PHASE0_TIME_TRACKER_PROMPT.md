# Mac iOS agent — Phase 0 time-tracker smoke (phone / offline)

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `cursor/time-tracker-handover-plan-cd21` @ **`dfe06e6`** (or newer on that branch)  
**PR:** [#45](https://github.com/christianchavezmoya-bot/workflow-strt/pull/45) — docs + Phase 0 unit tests (draft)  
**Product code under test:** already on **`main`** (`d7ad54e` — Fix 1/2 + Phase 1/2 foundation). This branch = `main` + smoke docs/tests.  
**Do not merge** unless the cloud agent asks. Do not commit `.env.production.local` or LAN IPs.

**API (Windows PC — wait for Windows “ready”):** `http://10.7.62.140:4000/api` *(adjust to the IP Windows posts)*  
**Native app:** **N-go** (Capacitor) · physical **iPhone** required  
**Login:** `admin@commtrac.local` / `Admin123!` (or installer account Windows confirms)  
**Windows prompt:** [`WINDOWS_AGENT_PHASE0_TIME_TRACKER_PROMPT.md`](./WINDOWS_AGENT_PHASE0_TIME_TRACKER_PROMPT.md)  
**Reference:** [`PHASE0_TIME_TRACKER_SMOKE_REPORT.md`](./PHASE0_TIME_TRACKER_SMOKE_REPORT.md)

---

## PROMPT START

You are the **Mac iOS field agent** for Strata **N-go** Phase 0 time-tracker verification.

### What this round is

| Already on `main` (behavior to smoke on phone) | On this PR branch only |
|------------------------------------------------|-------------------------|
| Fix 1/2 offline run-start time (real productive/downtime after sync) | Smoke report + Windows/Mac prompts |
| `canEditRun` ladder (Engineer = installer stand-in) | Unit tests (Windows runs those) |
| `RunTimeline` on runner summary | Handover plan |

**Pull / merge guidance:**
- Checkout **`cursor/time-tracker-handover-plan-cd21`** @ `dfe06e6+` (includes `main` time-tracker work).
- You do **not** need to merge PR #45 to test — behavior is already on `main`.
- Do **not** merge #45 yourself. Report results; cloud agent decides.
- Do **not** modify `server/`. Fix only S0/S1 blockers in `src/` / `ios/` — report first.
- **Wait for Windows** to post API ready + commit hash, then install that **same** hash.

Your job is what Windows **cannot** do: **physical iPhone**, especially **T1 offline Fix 1/2**.

---

## Part 0 — Wait → pull → build → install

1. Confirm Windows message like:  
   `Windows ready @ <hash> … API: http://<LAN-IP>:4000/api/health OK`
2. Use **that** LAN IP and prefer the **same commit hash**.

```bash
cd ~/path/to/workflow-strt   # adjust
git fetch origin
git checkout cursor/time-tracker-handover-plan-cd21
git pull origin cursor/time-tracker-handover-plan-cd21
git log -1 --oneline
# expect: dfe06e6 Add Windows agent prompt...  (or newer on this branch)
npm ci
```

API reachable from Mac (same Wi‑Fi as iPhone):

```bash
curl -s http://10.7.62.140:4000/api/health
# use Windows LAN IP
```

Native build (untracked local file — **do not commit**):

```bash
echo 'VITE_API_BASE=http://10.7.62.140:4000/api' > .env.production.local
# replace IP with Windows LAN IP
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Xcode: **physical iPhone** → signing team → **Product → Run** (⌘R).

Reply:

```
N-go installed @ <commit hash>
API IP: <LAN-IP>
iPhone: <model> / iOS <version>
Start phone matrix S1
```

---

## Part 1 — Phone test matrix

**Role tip:** In-app Topbar role override → use **Engineer** as installer stand-in (Installer is not in the override list). Prefer a real Installer login for at least one pass if available.

Use a project with a published workflow and an asset you can start a **new** run on (avoid ancient corrupted runs that already show 0m — Fix 1/2 does not repair old rows).

### S1 — Fresh offline run time (Fix 1/2) — **CRITICAL**

1. On phone, open Sync Center / confirm you can go offline (airplane mode or disconnect Wi‑Fi so API is unreachable).
2. As **Engineer** (or Installer): start a **brand-new** workflow run on a test asset.
3. Work **≥2–3 minutes**; optionally toggle **downtime** once; progress/complete per your normal flow (enough that time should be non-zero).
4. Go **online**; wait for sync (Sync Center / pending queue clears — Sync Now if needed).
5. Open **Run History** (or run details) for that asset.

| ID | PASS if | FAIL if |
|----|---------|---------|
| S1 | Productive (and downtime if used) show **real minutes**, not `0m` / `0s` | Fresh run shows **0** productive after sync |

Screenshot Run History totals on FAIL.

### S2 — Ladder before sign (None / PendingInstaller)

1. Online (or with an in-progress run): as **Engineer**, open **Edit Times**.
2. Switch to **Admin** (or Project Manager override) → open Edit Times again.

| ID | PASS if |
|----|---------|
| S2a | Engineer can edit time (not read-only) |
| S2b | Admin/PM can edit time |

### S3 — Ladder PendingCustomer

1. Complete **installer sign-off** only (status awaiting customer / `PendingCustomer`). Do **not** customer-sign yet.
2. As **Engineer**: Edit Times → **read-only**.
3. As **Admin/PM**: Edit Times → **still editable**.

| ID | PASS if |
|----|---------|
| S3a | Engineer locked |
| S3b | Admin/PM can correct |

### S4 — Ladder Signed

1. Complete customer signature (or use an already Signed run).
2. Engineer **and** Admin: Edit Times **read-only**.

| ID | PASS if |
|----|---------|
| S4 | Everyone locked on time |

### S5 — Summary timeline (Model B)

1. During a run, get productive time + a **long pause/gap** (multi-hour or overnight via pause / edited entries if needed).
2. Open runner **summary**.
3. Confirm timeline: productive / downtime segments; long pause is a **thin** break (tooltip), **not** a huge grey block.

| ID | PASS if |
|----|---------|
| S5 | Thin break for pause; timeline visible |
| S5 note | UTC labels are OK until Phase A wires project timezone |

### S6 — Smoke

| ID | PASS if |
|----|---------|
| S6 | Login → Dashboard → Assets → open/start run → no crash; Sync Center opens |

---

## Part 2 — Report format (paste back)

```
Phase 0 Mac/iPhone smoke @ <hash>
Branch: cursor/time-tracker-handover-plan-cd21
iPhone: <model> / iOS <version>
API: http://<LAN-IP>:4000/api

S1 Offline Fix1/2 (fresh run ≠ 0m): PASS / FAIL
S2a Engineer before sign: PASS / FAIL
S2b Admin before sign: PASS / FAIL
S3a Engineer PendingCustomer: PASS / FAIL / SKIP
S3b Admin PendingCustomer: PASS / FAIL / SKIP
S4 Signed lock: PASS / FAIL / SKIP
S5 Timeline Model B: PASS / FAIL
S6 Smoke: PASS / FAIL

Screenshots: <links or attached>
Blockers: none / <list>
Merge #45?: NO (cloud agent decision)
```

**Rules:** Do not merge. Do not commit `.env.production.local`. Do not change `server/`. On S1 FAIL, capture Sync Center pending count + Run History times before resetting the phone.

## PROMPT END
