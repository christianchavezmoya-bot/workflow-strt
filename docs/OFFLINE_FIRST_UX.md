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
- **Documents list** — metadata cached; **preview for library/tips files prefetched during bootstrap** (100 MB / 50 files, tips prioritized) plus asset-linked files (50 MB / 30 files)
- **Tips & tricks** — document list from cache; preview uses same offline file cache; “My products” filter uses cached assets when offline
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

Pending writes appear in Sync Center. When a queued change cannot sync:

- **Concurrency conflict** (another edit arrived first, or HTTP 409/412): Sync Center shows a side-by-side comparison. **Keep my change** retries your version; **Accept server version** drops the queue item and refreshes local cache from the server.
- **Business-rule rejection** (HTTP 422/400 on workflow ops, e.g. blocking issues on complete): shows the server message. **Remove from queue** reverts local cache; **Retry anyway** clears the flag and tries again after you fix the issue.
- SSE `assets:updated` events proactively flag queued asset writes when the server `updatedAt` is newer than your snapshot.

Unresolved conflicts are not re-sent until you choose an action in Sync Center. The top-bar sync badge shows a conflict count when review is needed.

**Support:** Sync Center → **Copy support bundle** (sanitized JSON for tickets). See [`BUG_TRIAGE.md`](./BUG_TRIAGE.md).

## Related code

- `src/contexts/OfflineModeContext.tsx` — manual offline toggle API
- `src/services/connectivityMonitor.ts` — guards and health ping
- `src/services/offlineBootstrapService.ts` — field download orchestration
- `src/components/layout/OfflineReadinessPanel.tsx` — Sync Center panel
- `src/services/workflowOpenService.ts` — `OFFLINE_CONFIG_MISSING_MESSAGE`

## Installer quick reference

See [`OFFLINE_INSTALLER_QUICK_REF.md`](./OFFLINE_INSTALLER_QUICK_REF.md) for a one-page field handout.

## Related docs

- [`OFFLINE_FIRST_IMPLEMENTATION_PLAN.md`](./OFFLINE_FIRST_IMPLEMENTATION_PLAN.md) — phased delivery + release gates
- [`OFFLINE_OPS_PLAYBOOK.md`](./OFFLINE_OPS_PLAYBOOK.md) — quarterly staging QA + monitoring
- [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md) — native device sign-off template
- [`OFFLINE_DEVICE_MEASUREMENT.md`](./OFFLINE_DEVICE_MEASUREMENT.md) — p95 resume latency baseline
- [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) — full release train
