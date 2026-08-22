# Golden rule — native download/sync stays in the foreground

**Status:** Plan only. Do not implement until this document is signed off.

**Platforms:** iPhone (App Store) first; apply the same product rule on Android.

---

## The rule (plain English)

When the phone is downloading field data or uploading queued work, **the app stays on screen until that job is finished**.

Finished means all of:

| Check | Meaning |
|-------|---------|
| **Download done** | Bootstrap/prefetch completed (not stale) |
| **Uploads done** | Pending file / action queue is empty |
| **No conflicts** | Sync conflict count is 0 |
| **Sync-ready** | Same signal as Offline Readiness: field data downloaded and uploads caught up |

Until then: keep the screen awake, keep the sync overlay visible, and **do not depend on iOS background execution** to finish the job.

If the user leaves the app mid-job, treat that as an **interrupted task**, not a background-sync success. Resume when they return.

---

## Why this is the Apple-safe path

Apple background modes are **purpose-limited**. Allowed examples include audio playback, location, and finishing a **short** background task. They are **not** a license to keep a WebView sync engine running after the user switches away.

Today this repo already matches that constraint on iOS:

- `ios/App/App/Info.plist` declares only `UIBackgroundModes = remote-notification` (push).
- There is **no** `processing`, `fetch`, or audio session for sync.
- iOS **suspends WebView JavaScript** when the app is backgrounded. Upload/download JS **stops**.
- `KeepAwake` only prevents the **screen** from sleeping while the app is still in the foreground.

Android can keep a `dataSync` foreground service (`SyncForegroundService`). That is an Android capability, **not** an iOS one. The golden rule is: **product behaviour is the same on both phones** — finish in the foreground. Do not add iOS background-processing entitlements to “make it like Android.”

---

## What exists today (gaps)

| Piece | Today | Gap vs golden rule |
|-------|-------|--------------------|
| Keep-awake | Starts only while the **upload flush** is active (`useSyncKeepAlive` + `sync-engine:syncing`) | Stops when flush ends, even if **bootstrap download** is still running |
| Sync overlay | Same — upload flush only (`SyncBusyOverlay`) | User can use the rest of the app while a large download continues |
| Bootstrap | Designed as a **silent background prefetch** (`offlineBootstrapService`) | Conflicts with “stay on the overlay until ready” |
| Background defer | Runner-open / background gates pause some work | Correct for camera/picker; must not be used as “finish later in background” |
| Ready signal | `offlineBootstrapService.getStatus().readyForOffline` + pending + conflicts | Not used as the **overlay / keep-awake stop condition** |
| User leaves app | Flush/bootstrap JS suspends on iOS | No “come back to finish” copy; Android may keep uploading via FGS |

---

## Target behaviour

```
User starts Sync Now / login download / reconnect flush
        │
        ▼
Foreground session begins
  • overlay visible (existing logo + “Syncing…”)
  • KeepAwake on (screen stays on)
  • no new iOS background modes
        │
        ▼
Work order (unchanged engines, wider session)
  1. Flush upload queue (existing useSyncEngine)
  2. Bootstrap / download (existing offlineBootstrapService)
  3. Recheck pending + conflicts
        │
        ▼
Session ends only when ALL true:
  pendingCount === 0
  conflictCount === 0
  bootstrap readyForOffline === true
  not currently flushing or bootstrapping
        │
        ▼
Overlay hides, KeepAwake off, user may idle/lock/leave
```

**Do not** start a new sync protocol. Reuse `useSyncEngine`, `offlineBootstrapService`, `pendingCount`, conflict list, and `readyForOffline`.

---

## Implementation phases (small, revertible)

### Phase A — Single “session complete” predicate (no UI yet)

Add a small helper, e.g. `src/utils/nativeForegroundSyncSession.ts`:

```ts
export function isNativeSyncSessionComplete(input: {
  pendingCount: number;
  conflictCount: number;
  readyForOffline: boolean;
  flushing: boolean;
  bootstrapping: boolean;
}): boolean
```

True only when the table above is satisfied.

- Unit tests for each failing check.
- **No overlay/keep-awake change yet.**

### Phase B — Hold overlay + keep-awake for the whole session

Widen `isNativeSyncUiActive` (or a sibling) so chrome stays on for:

- upload flush **or**
- bootstrap running **or**
- session started and `!isNativeSyncSessionComplete(...)`

Keep-awake starts/stops with the same flag.

Copy on overlay can stay “Syncing…” (optional later: “Downloading field data…” / “Uploading…”). **Do not change the logo artwork or spin.**

Gate: native smoke — Sync Now with pending uploads + stale bootstrap: overlay stays until queue empty, download finished, no conflicts.

### Phase C — Interrupted-by-background (Apple-honest)

When `app-backgrounded` fires **during** an incomplete session:

- Do **not** claim success.
- Do **not** add `processing` / `fetch` / `audio` background modes.
- On iOS, accept that JS pauses; on return, resume flush + bootstrap (already partly done via `app-foregrounded` → `sync-request-flush-now`).
- Optional UX (Class 2): one toast or banner — “Sync paused when you left the app. Stay on this screen until it finishes.”

Do **not** show a blocking lock that prevents Home/App Switcher (App Store rejection risk). The rule is **product**: we keep the screen on and the overlay up; the user can still leave.

### Phase D — Conflict / pending-file hold

If conflicts or leftover pending media remain after flush+bootstrap:

- Session stays incomplete (overlay remains, or overlay hides and Sync Center is forced — **pick one at sign-off**).
- Recommended: **keep overlay** with “Resolve conflicts in Sync Center” + a single button into Sync Center, keep-awake **off** once network work is idle (conflicts need a person, not a spinning wait).

Sign-off required before coding Phase D.

---

## Absolute restrictions (this epic)

**Do not:**

- Add iOS `UIBackgroundModes` of `processing`, `fetch`, `audio`, or `location` for sync.
- Use `BGTaskScheduler` / silent push to finish bootstrap.
- Keep Android FGS running after the session is complete (battery / Play policy).
- Change offline write-queue, ID remapping, or conflict merge algorithm.
- Change the sync logo PNG, extrusion, or spin axis in this epic.
- Block the hardware Home/App Switcher.

---

## Suggested PR split

| PR | Phase | User-visible? |
|----|-------|----------------|
| 1 | A — predicate + tests | No |
| 2 | B — overlay + keep-awake duration | Yes — overlay lasts longer |
| 3 | C — interrupted banner | Yes — copy only |
| 4 | D — conflict hold | Yes — only if signed off |

---

## Sign-off before Phase B

- [ ] Overlay must stay up through **download** as well as upload (yes/no).
- [ ] If the user backgrounds mid-job: toast on return only, or also a banner while away is impossible (iOS) — confirm toast-on-return.
- [ ] Conflicts: stay on overlay vs send to Sync Center (recommendation above).

After sign-off, start **PR 1 (Phase A)** only.
