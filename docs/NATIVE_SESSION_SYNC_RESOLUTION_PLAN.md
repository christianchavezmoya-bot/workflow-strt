# Native N-go — Session, Timeout & Offline Sync Resolution Plan

**Status:** In progress (field retest blocked until Mac rebuild @ `main` ≥ `15ddf75` + fixes below)  
**API test config:** `Jwt:ExpiresMinutes: 1` (Development, Windows PC)  
**Production target:** `ExpiresMinutes: 720` (~12 h)

---

## 1. Findings report (field test 2026-07-27)

| # | Symptom | Severity | Root cause (confirmed in code) |
|---|---------|----------|------------------------------|
| F1 | Dummy avatar **"U"** / Welcome modal on open | High (UX + trust) | `useAuth` renders `defaultUser` (empty name) before Keychain loads; onboarding Welcome shows with blank `userName`. Not a second account. |
| F2 | First open shows **dashboard** instead of Login | Medium (expectation) | By design: returning user with Keychain session → **Face ID**, not Login. True first install (no token) → Login. User expectation may differ. |
| F3 | No credential prompt after **2+ min** idle (online/offline) | **Critical** | (a) Phone build may predate PR #30; (b) 1-min JWT was **auto-refreshed** on every API ping (fixed #30); (c) no periodic expiry timer while app idle in foreground. |
| F4 | Offline work → go online → **web never updates** | **Critical** | `token-expired` connectivity state **blocks flush permanently** until logout/login; reconnect calls `reconnectAndFlush()` but `flush()` returns early. Expired JWT after Face ID unlock leaves sync dead. |
| F5 | Logout → login → sync OK | — | Confirms queue + API work; failure is **session/sync state**, not server or workflow writes. |
| F6 | Sync overlay **0%** / offline-online badge conflict | High | Flush starts then stalls (token-expired / expired JWT 401); initial flush on offline open (partially fixed #30). |
| F7 | Web installer logged out ~7 min; phone did not | Medium | Web redirects on 401; native uses Face ID + stale session; 1-min refresh affected them differently pre-#30. |

**Merged fixes already on `main`:** PR #25 (expiry login online), #27 (401 drops queue), #28 (preserve token offline), #29 (reload loop), #30 (no refresh of 1-min JWT, launch detection).

**Blocker:** iPhone must be rebuilt from latest `main` after each merge. Testing against an old build invalidates results.

---

## 2. Session policy (target behaviour)

| Context | Timeout | User sees |
|---------|---------|-----------|
| **Online**, JWT expired (`ExpiresMinutes`) | Server config (720 prod / 1 test) | **Login** (email/password) |
| **Online**, app idle in foreground past JWT exp | Same | **Login** (within ~60s via periodic check) |
| **Offline**, within 30-day grace | JWT may expire locally | **Face ID** — cached data OK |
| **Offline**, grace expired (30 d) | — | **Login** (needs Wi‑Fi) |
| **Offline → online**, JWT expired | — | **Login first**, then sync flush |
| **Offline → online**, JWT valid | — | **Auto sync** (pending queue uploads) |

**Not a security breach:** Avatar "U" = empty placeholder. Dev **Test as user** (web only, hidden on native in #30).

---

## 3. Implementation plan

### Phase P0 — Unblock field retest (1–2 commits)

| ID | Task | Owner | Files |
|----|------|-------|-------|
| P0-1 | **Mac rebuild** install N-go @ `main` ≥ `15ddf75` | Mac agent | Xcode |
| P0-2 | Fix **token-expired deadlock**: on reconnect/foreground, if JWT expired → force Login via `api-auth-error`, do not call flush | Cloud | `useSyncEngine.ts` |
| P0-3 | **Auth ready gate**: hide Topbar avatar + onboarding until `useAuth` loaded from Keychain | Cloud | `useAuth.ts`, `AppShell.tsx` |
| P0-4 | **Periodic JWT check** (native, foreground, online): every 60s → Login if expired | Cloud | `App.tsx` |
| P0-5 | Windows: keep `ExpiresMinutes: 1` until matrix pass, then revert **720** | Windows agent | `appsettings.Development.json` |

### Phase P1 — Offline → online sync reliability

| ID | Task | Owner |
|----|------|-------|
| P1-1 | After successful flush, emit `repo:assets:updated` + dashboard refresh (partially done) | Cloud |
| P1-2 | Sync Center: show **"Sign in to sync"** when `token-expired` + pending > 0 | Cloud |
| P1-3 | On `auth-change`, reset `token-expired`, `pendingResetRetrySchedule()`, flush | Cloud (verify) |
| P1-4 | Add sync success toast / badge **pending → synced** visible to installer | Cloud |

### Phase P2 — Polish & production

| ID | Task | Owner |
|----|------|-------|
| P2-1 | Configurable session policy doc in admin/settings (display JWT mins) | Cloud |
| P2-2 | Remove/disable onboarding Welcome when `!user.id` | Cloud |
| P2-3 | E2E test: offline step → pause → online → web matches | Mac + Windows |
| P2-4 | Revert Windows JWT to 720; sign off matrix row 9 at 12 h | All |

---

## 4. Test matrix (phone user after P0 Mac rebuild)

| Step | Action | Pass criteria |
|------|--------|---------------|
| T1 | Fresh install OR logout, open app | **Login** screen (no "U" avatar on dashboard) |
| T2 | Login online, force-quit, wait **2+ min**, reopen **online** | **Login** (stable, no flash loop) |
| T3 | Login, airplane **ON**, force-quit, wait 2+ min, reopen **offline** | **Face ID** (not Login) |
| T4 | After T3, Wi‑Fi **ON** without manual logout | **Login** OR auto-sync after login; pending uploads |
| T5 | Login, offline: 1 step + pause; Sync Center **pending ≥ 1** | Queue visible |
| T6 | Wi‑Fi **ON**, stay in app (no logout) | Pending drains; **web dashboard updates** |
| T7 | If T6 fails, note Sync Center message | Should NOT stay `token-expired` silent |

---

## 5. Who tests what

| Role | Responsibility |
|------|----------------|
| **Mac agent** | Merge PRs, rebuild, install on iPhone, confirm build hash |
| **Phone user (installer)** | Run T1–T7, screenshots, Sync Center pending count |
| **Windows agent** | API health, `ExpiresMinutes`, revert after pass |
| **Web checker** | Same installer account, verify project asset after T6 |

---

## 6. Current workaround (until P0 deployed)

1. After offline field work, **turn Wi‑Fi on**
2. If sync stuck: **logout → login** (known good path)
3. Confirm web updates after login

---

## 7. Commit reference (`main`)

| PR | Summary |
|----|---------|
| #25 | Login when online + expired JWT |
| #27 | Don't drop queue on 401; unstuck overlay |
| #28 | Keep Keychain session for offline Face ID |
| #29 | Fix reload loop (flash Loading) |
| #30 | Stop 1-min JWT auto-refresh; launch Login fix |

**Next PR:** P0-2–P0-4 (token-expired deadlock, auth gate, periodic check)
