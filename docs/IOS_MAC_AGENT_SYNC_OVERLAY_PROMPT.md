# Mac iOS agent — sync overlay + row 9 + final sign-off

**Copy everything below the line into your Mac Cursor agent.**

Branch: `cursor/phase11-post-release-monitoring-cd21` @ **`12394fc`** or newer (PR [#22](https://github.com/christianchavezmoya-bot/workflow-strt/pull/22))

---

## PROMPT START

You are the **Mac iOS field agent** for **Commtrac Codex 915**. Your job this session:

1. Pull latest, **install on physical iPhone**
2. **Verify sync busy overlay** (new — rotating Strata mark)
3. Complete **acceptance matrix row 9** (token expiry after ~12h idle)
4. Finish **Layer C** spot checks + post **go / no-go** for merge to `main`

You may change `src/` or `ios/` only to fix bugs you find during testing — report first for S0/S1. Do **not** modify `server/`.

---

## Part 0 — Checkout

```bash
git clone https://github.com/christianchavezmoya-bot/workflow-strt.git
cd workflow-strt
git fetch origin
git checkout cursor/phase11-post-release-monitoring-cd21
git pull origin cursor/phase11-post-release-monitoring-cd21
npm ci
```

Confirm HEAD includes **`12394fc`** (`Add native sync busy overlay with rotating Strata mark`).

---

## Part 1 — Backend + iOS install

### API (LAN)

```bash
dotnet run --project server/Commtrac.Api/Commtrac.Api.csproj --launch-profile http
curl -s http://127.0.0.1:4000/api/health
ipconfig getifaddr en0   # Mac Wi‑Fi IP
```

### Build + sync + install

```bash
echo "VITE_API_BASE=http://<MAC-LAN-IP>:4000/api" > .env.production.local
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Xcode: **physical iPhone** → signing for `com.christianchavez.kinet` → **Product → Run** (⌘R).

**Accounts:** installer user assigned to field assets; role has **Assets → Field User Workflow**.

---

## Part 2 — Sync busy overlay (NEW — must test)

**What shipped:** Native-only full-screen overlay during queue flush — dimmed backdrop, **rotating blue Strata icon** (~96px), **“Syncing…”** caption. Asset: `src/assets/strata-sync-mark.svg` (CSS spin, transparent).

### Test steps

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Online bootstrap complete; note normal UI (no overlay) | No overlay when idle/synced |
| 2 | Airplane ON → save **3–5 workflow steps** on assigned asset | Pending count > 0 in Sync Center |
| 3 | Reconnect Wi‑Fi/cellular (stay on Dashboard or any screen) | **Overlay appears** within ~1s: spinning logo + “Syncing…” |
| 4 | Wait for flush to finish | Overlay **disappears**; sync badge **Synced**; pending **0** |
| 5 | Tap around during overlay | **Cannot** interact with app behind (backdrop blocks taps) |
| 6 | Reconnect with **empty queue** (nothing pending) | **No overlay** (only shows when flush has work) |

### FAIL criteria

- No overlay when pending items flush after reconnect
- Overlay stuck after queue is clean (support bundle shows 0/0/0)
- Logo has solid box/halo (transparency broken)
- Full wordmark spins (should be **icon mark only**)

**Screenshot:** overlay visible mid-sync + Sync Center showing pending clearing.

---

## Part 3 — Regression spot checks (quick)

After overlay test, confirm these still pass (from prior rounds):

| Check | PASS if |
|-------|---------|
| Stuck “Sync error · Retry” badge | Clears when queue empty (Finding 6 fix) |
| Needs Attention panel | No flicker loop after issue sync (Finding 5) |
| My Blocking Issues | Updates after offline issue resolve + reconnect (Finding 4) |
| Offline assign workflow | No error alert; queues and syncs (Finding 1) |
| Dashboard job list | Not zeroed after offline session (Bug-1) |

---

## Part 4 — Matrix row 9 (token expiry)

**Requires ~12 hours idle** since last login. Plan ahead:

### Setup (day before or morning)

1. Queue **at least one step save offline** (or have pending work) so row 9 has something to verify.
2. Leave app **logged in**; do not force-quit if possible.
3. Wait **12+ hours** without opening the app (or until JWT expires — 720 min lifetime in config).

### Test (after idle)

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Open app **Airplane ON** first | Cached session still usable (no surprise logout) |
| 2 | Turn radio **ON** | Login prompt if token expired |
| 3 | Log in again | **Pending queue preserved** — Sync Center shows prior pending items |
| 4 | Reconnect / wait for flush | Queue syncs; overlay may appear during flush (Part 2 behavior) |

Record: device, iOS version, idle duration, pass/fail.

---

## Part 5 — Layer C + final sign-off

Complete remaining **`docs/OFFLINE_ACCEPTANCE_MATRIX.md`** rows if not already signed (rows 1–8 should be done; row 9 above).

**Layer C spot checks:**
- Login / logout / biometric lock
- Start + resume workflow; text, **photo**, **signature** steps
- Sync Center **Copy support bundle** — confirm **no JWT** in JSON
- Support bundle matches UI (pending 0 = badge synced)

---

## Deliverables (post on PR #22)

1. **Sync overlay:** pass/fail + screenshot
2. **Row 9:** pass/fail + idle duration
3. **Regression spot checks:** table pass/fail
4. **Completed matrix** (or paste table)
5. **Go / no-go** for merge to `main`

### Merge rubric

| Severity | Merge? |
|----------|--------|
| S0 / S1 (data loss, stuck sync, assign not on server) | **NO** |
| Overlay broken / misleading | **NO** (S2 UX — fix or waiver) |
| Row 9 fail | **NO** |
| All pass | **GO** |

---

## Reference commits on this branch

| Commit | Fix |
|--------|-----|
| `12394fc` | Sync busy overlay (rotating Strata mark) |
| `4853d4c` | Stuck Sync error badge |
| `ea26f87` | Needs Attention flicker |
| `969dcf9` | Assign dialog UX (Finding 3) |
| `0830dbb` | Attention widgets after sync |
| `cc53279` | Offline assign queue + circuit breaker |
| `972ac07` | Dashboard job list wipe |

## PROMPT END
