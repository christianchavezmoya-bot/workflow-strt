# Phone offline implementation — closure guide

Use this checklist to **finish and sign off** the native offline-first rollout after PR #22 merges to `main`.

**API (field testing):** `http://172.20.8.16:4000/api`  
**Build:** `echo "VITE_API_BASE=http://172.20.8.16:4000/api" > .env.production.local` → `npm run build` → `npx cap sync ios`

---

## What is already done (your latest field test)

| Area | Status |
|------|--------|
| Sync busy overlay + 3D Strata logo | Pass (cosmetic tweaks only) |
| Capture table sticky headers (all columns) | Pass |
| Documents + Tips offline list/preview | Pass (PDF, video, images) |
| DOCX fit-to-page preview | Fixed in latest build — quick retest recommended |
| Reconnect doc sync (incremental, not full re-download) | Fixed — quick retest recommended |
| Startup “Server not responding” when online | Fixed — quick retest recommended |
| Matrix rows 6–8 (kill/reopen, bulk queue, conflicts) | Passed in prior rounds |
| Dashboard offline fixes, assign queue, attention widgets | Passed in prior rounds |

---

## Remaining work to close the task

### A. One short “sanity pass” (30 min, online + offline)

Do this on the **merged `main` build** before signing the matrix:

1. **Install fresh build** (steps above).
2. **Sync Center → Download now** → chip **Ready**.
3. **Airplane ON** → open **Documents** + **Tips** → open one PDF and one DOCX → full page visible, zoom works.
4. **Airplane OFF** → reconnect → open Documents again → should **not** hang for minutes re-downloading.
5. **Startup** → force-quit → reopen online → connectivity bar should **not** stay “Server not responding” while login/sync works.

Mark these pass/fail in the matrix notes column.

---

### B. Acceptance matrix — fill every row

Copy [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md) into the release PR or a sign-off comment. Complete the header (tester, date, device, build, API commit).

| # | Scenario | If not done yet | Target |
|---|----------|-----------------|--------|
| **1** | Airplane, small workflow, **Resume** | Dashboard → Resume on assigned asset, airplane ON | Interactive ≤ **1000 ms** (ConnectivityDebugBar **Open:** ms) |
| **2** | Airplane, large workflow (60+ steps) | Same on a heavy workflow | Same p95 target |
| **3** | Captive Wi‑Fi | Router with no internet; open cached run | Cached run opens; honest offline UX |
| **4** | Backend down, radio on | Stop API or wrong IP briefly; open cached run | Cached data; no crash |
| **5** | Offline **start new run** | Airplane → start run on assigned asset | Run starts from cached config |
| **6** | Kill app mid-run | ✓ Already passed — reconfirm if desired | Step intact after reopen |
| **7** | ~20 queued ops, reconnect | ✓ Already passed — reconfirm if desired | Queue clears, no duplicates |
| **8** | Conflict resolve | ✓ Already passed — reconfirm if desired | Sync Center Keep / Accept server |
| **9** | **Expired token, reconnect login** | **Still required** — see section C below | Queue preserved after re-login |

**Pass** = no S0/S1 (data loss, stuck sync, assign missing on server). See [`BUG_TRIAGE.md`](./BUG_TRIAGE.md).

---

### C. Matrix row 9 — token expiry (plan ahead)

JWT lifetime is **720 minutes (~12 h)** in config. This test needs real idle time.

**Setup (evening or day before):**

1. Online → login → **Download now** (bootstrap complete).
2. Airplane ON → save **at least one workflow step** (or any queued write) so Sync Center shows pending > 0.
3. Leave app **logged in**; avoid force-quit if possible.
4. Wait **12+ hours** without opening the app (or until session expires).

**Test (next session):**

| Step | Action | Pass if |
|------|--------|---------|
| 1 | Open app **airplane ON first** | Cached session still usable OR clear login prompt (both OK) |
| 2 | Turn radio **ON** | If expired → login prompt |
| 3 | Log in again | **Pending queue still listed** in Sync Center |
| 4 | Wait for sync | Queue clears; sync overlay may appear briefly; badge **Synced** |

Record: device, iOS version, idle duration, pass/fail.

---

### D. Layer C — release checklist (phone section)

From [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md), tick offline-first bullets:

- [ ] Online bootstrap completes
- [ ] Airplane: cached workflow open ≤1s (rows 1–2)
- [ ] Save step offline → pending indicator
- [ ] Kill app offline → reopen → data intact (row 6)
- [ ] Restore network → queue syncs without duplicates (row 7)
- [ ] Installer + customer signatures queued offline (spot check one signature step)
- [ ] Sync Center: pending → synced; conflict resolvable (row 8)
- [ ] Documents/Tips offline preview (your latest pass)
- [ ] No open S0/S1 sync defects

Add tester name + date on the sign-off table in `RELEASE_CHECKLIST.md` (or attach a completed copy to the release PR).

---

### E. Automated gates (before tagging a release)

On the release commit:

```bash
npm run release-gates
npm run test:e2e:full
```

All green before production/staged phone rollout.

---

### F. Task closure — definition of done

You can **close the offline implementation task** when all are true:

1. [ ] PR stack merged to `main`
2. [ ] Matrix rows **1–9** pass (or waivers documented with product sign-off)
3. [ ] Layer C offline section signed
4. [ ] `npm run release-gates` green on release commit
5. [ ] Support knows about **Sync Center → Copy support bundle** ([`BUG_TRIAGE.md`](./BUG_TRIAGE.md))

Optional follow-ups (not blockers for closure):

- Phase 11 quarterly ops schedule ([`OFFLINE_OPS_PLAYBOOK.md`](./OFFLINE_OPS_PLAYBOOK.md))
- Cosmetic sync-logo tweaks in a later polish PR

---

## Quick reference docs

| Doc | Purpose |
|-----|---------|
| [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md) | Sign-off table (rows 1–9) |
| [`OFFLINE_FIRST_UX.md`](./OFFLINE_FIRST_UX.md) | What works offline vs limits |
| [`OFFLINE_INSTALLER_QUICK_REF.md`](./OFFLINE_INSTALLER_QUICK_REF.md) | Field handout |
| [`IOS_MAC_AGENT_RETEST_ROUND2_PROMPT.md`](./IOS_MAC_AGENT_RETEST_ROUND2_PROMPT.md) | Latest device retest script |
| [`BUG_TRIAGE.md`](./BUG_TRIAGE.md) | Support bundle + severity |
