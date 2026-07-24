# Offline-first UX cheat sheet

This document summarizes how secondary screens behave when the native app is offline (radio off, manual offline mode, or server unreachable). Web/desktop builds pass requests through without IndexedDB caching unless noted.

## Connectivity guards

| Guard | When true | Used for |
|-------|-----------|----------|
| `shouldSkipBlockingFetch()` | Radio off **or** manual offline | Read fast-bail; serve cache |
| `shouldSkipRunMutation()` | Above **plus** server unreachable / circuit open | Write fast-bail → sync queue |
| `isOfflineMode` (context) | Manual offline **or** radio off **or** server unreachable | UI banners and disabled actions |

Manual offline is toggled in **Sync Center → Work offline**. It clears automatically when the device reconnects unless you turn it off first.

## What works offline (after field download)

- **Dashboard / projects / assets / workflows** — cached via bootstrap; see `OfflineReadinessPanel`
- **Inspection runs** — asset workflow runs filtered by inspection config (Phase 7)
- **Issues, signatures, photos** — queued writes with optimistic UI (Phases 3–6)
- **Documents list** — metadata cached; **preview only for files prefetched** during bootstrap (50 MB / 30 files cap)
- **Tips & tricks** — document list from cache; “My products” filter uses cached assets when offline
- **Notifications inbox** — last fetched list from IndexedDB; no new items until online
- **Profile** — read cached name/office; **save disabled** until online

## Honest limits (no silent failure)

| Screen | Offline behavior |
|--------|------------------|
| **Global search** | Disabled with explanation (server index required) |
| **Documents preview** | Error “Not available offline” if file blob not prefetched |
| **Notifications** | Cached list + banner; acknowledge disabled offline |
| **Profile save / 2FA / sessions** | Blocked or best-effort read-only |
| **Geocoding / map pickers** | Skipped; manual address entry still works |
| **Add/edit/delete documents** | Writes require connection (not queued) |

## Field download (bootstrap)

Open **Sync Center** (status badge) → **Offline readiness**:

- **Download now** — refresh assigned projects, workflow configs, linked document files
- **Work offline** — force offline mode without turning off Wi‑Fi/cellular
- Chip shows **Ready**, **Data may be stale**, or **Not downloaded yet**

## Sync queue

Pending writes appear in Sync Center. Conflicts (409/412) are surfaced there (Phase 9). Until then, failed items stay in the queue with retry/backoff.

## Related code

- `src/contexts/OfflineModeContext.tsx` — manual offline toggle API
- `src/services/connectivityMonitor.ts` — guards and health ping
- `src/services/offlineBootstrapService.ts` — field download orchestration
- `src/components/layout/OfflineReadinessPanel.tsx` — Sync Center panel
- `src/services/workflowOpenService.ts` — `OFFLINE_CONFIG_MISSING_MESSAGE`
