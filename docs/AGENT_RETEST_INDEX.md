# Agent retest prompts — index

Use this index whenever the cloud agent finishes a change set and field agents need to **install, verify, and sign off** before merge.

---

## Which agent does what

| Agent | Machine | Scope |
|-------|---------|--------|
| **Mac iOS agent** | Mac + Xcode + physical iPhone | Native **N-go** build, install, offline/sync UX on device |
| **Windows agent** | Windows PC | API + Vite dev server, web app verification, JWT/config, LAN health |

**Rule:** Mac agent does **not** change `server/`. Windows agent does **not** build iOS. Both may fix S0/S1 in their allowed paths — report before merging.

---

## Current active prompts (update after each change round)

| Round | Branch | PR | Mac prompt | Windows prompt |
|-------|--------|-----|------------|----------------|
| **Phase 0 time-tracker smoke** | **`cursor/time-tracker-handover-plan-cd21` @ `dfe06e6`** | [#45](https://github.com/christianchavezmoya-bot/workflow-strt/pull/45) | [`IOS_MAC_AGENT_PHASE0_TIME_TRACKER_PROMPT.md`](./IOS_MAC_AGENT_PHASE0_TIME_TRACKER_PROMPT.md) | [`WINDOWS_AGENT_PHASE0_TIME_TRACKER_PROMPT.md`](./WINDOWS_AGENT_PHASE0_TIME_TRACKER_PROMPT.md) |
| **Connectivity UI + bulk email share** | **`main` @ `c39f674+`** (merged #42 + #43) | #42, #43 ✅ | [`IOS_MAC_AGENT_MAIN_COMBINED_TEST_PROMPT.md`](./IOS_MAC_AGENT_MAIN_COMBINED_TEST_PROMPT.md) | [`WINDOWS_AGENT_MAIN_COMBINED_TEST_PROMPT.md`](./WINDOWS_AGENT_MAIN_COMBINED_TEST_PROMPT.md) |
| **Offline labels + sync conflict UX** | **`main` @ `bdf5135+`** (merged [#37](https://github.com/christianchavezmoya-bot/workflow-strt/pull/37)) | #37 ✅ | [`IOS_MAC_AGENT_OFFLINE_SYNC_UX_PROMPT.md`](./IOS_MAC_AGENT_OFFLINE_SYNC_UX_PROMPT.md) | [`WINDOWS_AGENT_OFFLINE_SYNC_UX_PROMPT.md`](./WINDOWS_AGENT_OFFLINE_SYNC_UX_PROMPT.md) |
| Session timeout + auth (prior) | `main` @ `62da009+` | #25–#36 | [`IOS_MAC_AGENT_SESSION_SYNC_PROMPT.md`](./IOS_MAC_AGENT_SESSION_SYNC_PROMPT.md) | (Windows: set `ExpiresMinutes` per that prompt) |

When a new round ships, add a row here and archive or supersede the old “current” prompts.

---

## How to run a retest (every time)

### 1 — Cloud / PR agent (after code changes)

1. Commit + push branch; open or update PR.
2. Copy **Mac prompt** + **Windows prompt** for this round into the PR description or a comment.
3. Fill in: branch name, commit hash, PR link, API IP, test user, what changed.
4. Tell field agents: **“Copy PROMPT START → PROMPT END into Cursor on Mac / Windows.”**

### 2 — Windows agent (first)

1. Pull branch (or `main` after merge).
2. Confirm API health + JWT setting for this test round.
3. Start API (+ Vite if web checks needed).
4. Post: commit hash, `ExpiresMinutes`, health curl result.
5. Tell Mac agent: **“API ready — install @ `<hash>`”**

### 3 — Mac agent (second)

1. Pull same branch @ commit Windows confirmed.
2. `npm run build` + `npx cap sync ios` + install on **physical iPhone**.
3. Phone user runs test matrix in the Mac prompt.
4. Post filled results table + screenshots on the PR.

### 4 — Sign-off

| Outcome | Action |
|---------|--------|
| All tests pass | Windows reverts test-only JWT if used; cloud agent merges PR |
| S0/S1 fail | Do **not** merge; cloud agent fixes and issues **new prompt round** |
| S2 UX only | Document waiver or fix in follow-up PR |

---

## Prompt file template (for cloud agent — next round)

Create `docs/IOS_MAC_AGENT_<TOPIC>_PROMPT.md` and `docs/WINDOWS_AGENT_<TOPIC>_PROMPT.md` with:

```markdown
# Mac/Windows agent — <short title>

**Copy everything below the line into your Mac/Windows Cursor agent.**

**Branch:** `cursor/<name>-cd21` @ **`<commit>`**
**PR:** #NN
**API:** `http://<LAN-IP>:4000/api`
**Test user:** ...

---

## PROMPT START
(role, rules, checkout, build, test matrix, deliverables table, troubleshooting)
## PROMPT END
```

Update [`AGENT_RETEST_INDEX.md`](./AGENT_RETEST_INDEX.md) current-round table.

---

## Shared constants (adjust per site)

| Item | Typical value |
|------|----------------|
| API base | `http://172.20.8.16:4000/api` |
| Web dev | `http://172.20.8.16:5173` |
| Native app name | **N-go** (Strata N-go in-app) |
| Installer test user | `c_chavez_m@hotmail.com` |
| Production JWT | `ExpiresMinutes: 1440` (24 h) |
| Offline session grace (native) | 24 h since last online login (`OFFLINE_GRACE_MS`) |
| Short JWT test | `ExpiresMinutes: 2` or `960` (16 h) — **document which round uses which** |

Device IP goes in **untracked** `.env.production.local` on Mac — never commit.

---

## Related docs

- [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md) — full native matrix
- [`BUG_TRIAGE.md`](./BUG_TRIAGE.md) — severity + support bundle
- [`NATIVE_SESSION_SYNC_RESOLUTION_PLAN.md`](./NATIVE_SESSION_SYNC_RESOLUTION_PLAN.md) — auth/session findings
