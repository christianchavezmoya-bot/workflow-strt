# Native offline sync — field retest findings (2026-08-07)

Follow-up to `NATIVE_OFFLINE_SYNC_INVESTIGATION_PLAN.md` after Juan Perez installer retest.

## Retest summary

| Scenario | Result |
|----------|--------|
| 10 pending stuck 1+ hr (original bug) | **Could not reproduce** after reinstall — all 20 files uploaded OK |
| 6 assets offline → 20 files pending → wifi on | **PASS** — all uploaded, web matched |
| Airplane mode → start run | **FAIL initially** — "no workflow assigned" (workflow data not cached) |
| Reinstall + online → airplane mode | **PASS** — workflow assigned correctly |
| PM creates 2 assets, phone shows asset | Asset list updated via SSE, **no notification badge** |
| Pending uploads + manual refresh | **No blue download banner**, workflow data not fetched |

## Root cause confirmed: bootstrap blocked while uploads pending

Two layers prevented field-data download when `pendingCount > 0`:

1. **`PullToRefresh.tsx`** — hard block when `pendingCount > 0` ("Tap SYNC at the top…")
2. **`useSyncEngine.triggerSync()`** — one-shot check skipped bootstrap if queue non-empty after flush, without waiting for drain

Additionally:

3. **SSE `assets:updated`** refreshed asset **list** only — no workflow/assignment prefetch, no notification refresh
4. **PM-created assets** — notification poll (15–60s) lagged behind SSE; inbox not refreshed on push

## Fixes implemented (branch `cursor/native-bootstrap-pending-fix-cd21`)

| Fix | File | Change |
|-----|------|--------|
| Upload-then-download sync | `useSyncEngine.ts` | `triggerSync` always calls `scheduleBootstrapAfterUploadDrain("all")` |
| Pull-to-refresh | `PullToRefresh.tsx` | Allow refresh when pending > 0; toast explains upload-then-download |
| Flush-complete chain | `useOfflineBootstrap.ts` | Bootstrap after queue drains on `sync-engine:flush-complete` |
| SSE assignment prefetch | `useSseEvents.ts` | `notifications:refresh` + debounced per-project asset workflow prefetch |
| Notification prefetch | `NotificationInboxContext.tsx` | Prefetch workflow data when `asset-assigned` notification arrives |
| Honest teal banner | `NativeLifecycleBanner.tsx` | "field data download after upload" instead of "syncing now" |
| Shared scheduler | `bootstrapAfterDrain.ts` | Coalesced upload-drain-then-bootstrap scheduling |
| Targeted prefetch | `assetPrefetchService.ts` | Assignments, runs, configs, docs for one asset |

## Retest checklist (after fix build)

1. Create pending uploads (e.g. 4 paused assets offline) → go online
2. Swipe down refresh → should show toast "Syncing changes, then downloading field data…"
3. Blue **Downloading field data…** banner should appear after uploads drain
4. PM creates asset assigned to installer → bell badge updates within ~3s; workflow startable offline after prefetch
5. Airplane mode with pending uploads → amber banner, no false "syncing now"

## Notifications note

Backend sends `asset-assigned` to installer on PM create (`ProjectAssetsController.NotifyAssetAssignmentChangeAsync`). Phone was missing notifications because SSE updated assets but **did not trigger notification inbox refresh**. Fixed via `notifications:refresh` on SSE.
