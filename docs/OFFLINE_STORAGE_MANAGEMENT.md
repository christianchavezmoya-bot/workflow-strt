# Mobile Offline Storage Management — Phase 1

Prevents native devices from silently filling up with offline data, without ever risking unsynced
field work or the server's authoritative copy. Branch: `feat/mobile-offline-storage-management`.
This doc covers what actually shipped; the originating audit covered the full architecture trace.

## Core design principle

**"Discard from device" never means "delete from server."** `projectDiscardService.ts` makes zero
network requests — no code path in it imports the shared `api` client, and it is behaviorally
proven never to call `DELETE /projects/{id}/purge` or `projectService.purgeProject()` (a
pre-existing, unrelated, server-destructive admin action — see `src/services/projectService.ts`).
"Remove from device" only ever touches IndexedDB and the Capacitor Filesystem on the device it
runs on.

**Storage health and discard eligibility are separate concepts** (owner design correction).
`storageHealth.ts` has no knowledge of sync state; unsynced work never changes a HEALTHY/WARNING/
HIGH/CRITICAL level. `projectDiscardService.ts` has no knowledge of storage budgets; it only ever
answers "is this project's local copy safe to remove," and blocks removal — never health — when
the answer is no.

## Storage manifest (schema v5, additive)

`storage_manifest` (`src/services/localDB.ts`) is a new IndexedDB store, keyed by category
(`CAPTURED_MEDIA` | `CONFIG_MEDIA` | `DOCUMENT` | `REPORT` | `OTHER`) with indexes on
`projectId`/`assetId`/`workflowRunId`/`issueId`/`configId`/`documentId`, populated at write time by
`mediaStore.ts` (captured photos/videos/signatures/documents) and `configMediaCache.ts` (workflow
reference media). Every byte figure is the **actual binary size** (`Blob.size`, or an exact
base64→byte decode for string sources — see `src/utils/byteSize.ts`), never a base64 string length,
which overstates true bytes by ~33%.

**Legacy files** (written before this store existed) are not eagerly migrated. They are discovered
lazily, on the existing natural read path (`mediaStore.readMedia`, `configMediaCache`'s hydrate
functions), stat'd once, and backfilled — never as a blocking startup scan. A file with no manifest
entry is still fully functional; it is simply not yet counted until next read.

The v4→v5 upgrade is purely additive — verified against a **real IndexedDB implementation**
(`fake-indexeddb`, dev-only test dependency) in `localDB.schemaUpgrade.test.ts`, which seeds a
realistic pre-upgrade device, runs the actual production upgrade path, and asserts every existing
record in every existing store (including `dirty`/unsynced ones) survives unchanged.

## Storage health (`src/utils/storageHealth.ts`)

Two independent signals, worst-wins:

1. **N-Go's own usage vs. a budget.** The budget is device-relative, not one fixed number: 5% of
   device total capacity, clamped to [2GB, 20GB], falling back to a fixed 5GB only when device
   total capacity is unknown (see below — that is the current native reality).
2. **Real device free space**, both as a percentage of device total and as an absolute GB floor
   (a tiny percentage can still mean tens of GB on a large device; a tiny absolute margin is
   dangerous on any device).

| Level | Budget usage | OR device free % | OR device free absolute |
|---|---|---|---|
| WARNING | ≥ 50% | ≤ 20% | ≤ 5 GB |
| HIGH | ≥ 70% | ≤ 15% | ≤ 2 GB |
| CRITICAL | ≥ 85% | ≤ 10% | ≤ 1 GB |

**Device free/total space is not available today.** `@capacitor/device@8.0.3` was installed,
inspected against its own shipped type definitions, and found to have no disk-space fields at all
(only `memUsed`, app memory) — see `deviceStorageCapability.ts`'s doc comment. It was removed again
(net dependency change: zero). Health today runs in "budget-only" mode on native; `WEB_QUOTA_ESTIMATE`
via `navigator.storage.estimate()` is available on web/PWA but is a browser origin quota, explicitly
never presented as device free space. **A working native free-space API is a prerequisite for this
feature's full value** and needs an owner decision — see "Known gaps" below.

## Project discard (`src/services/projectDiscardService.ts`)

`checkProjectDiscardEligibility(projectId)` checks, via indexed queries only (never a full-table
scan): the project record's own `dirty` flag, every asset/workflow-run/issue `dirty` flag, every
`pending_actions` row, and every `dropped_actions` row (a **permanently-failed** sync — this is the
easiest thing to miss, since it leaves no `pending_actions` row once dropped, but still holds real
local data). Any match blocks removal with a structured count broken down by workflow changes,
photos/videos, issues, time tracking, failed syncs, and other — feeding the exact UI copy pattern
you specified ("3 workflow changes, 4 photos/videos, 1 issue, 2 failed sync operations").

`discardProjectFromDevice(projectId)` re-checks eligibility, then removes project-scoped data
unconditionally (project record, its assets, workflow runs, issues, and their exclusively-owned
captured media — both manifest-tracked and legacy files discovered by parsing run/issue JSON, using
the same shapes `mediaStore.resolveUploadValue()` already handles). **Shared resources** (config
media, documents) are only removed after reference-counting proves no other locally-cached project
still needs them — proven against the ACTUAL local reference graph (other projects' cached assets'
`productConfigId`, their cached `workflow_assignments`, and cached asset-document-link metadata via
`assetDocumentLinkService.ts`), **never** against `storage_manifest` sibling rows, which do not
prove sharing (a shared file can have exactly one manifest row while many assets reference it — see
`isConfigMediaStillReferencedLocally`/`isDocumentStillReferencedLocally`). On any uncertainty (a
lookup failure, an incomplete graph — e.g. an outside asset whose document links were never
cached), the shared item is kept — "prefer keeping an unnecessary shared cache item over deleting
something another offline project needs"; a false-positive KEEP is acceptable, a false-positive
DELETE is not.

## Screen (`src/features/settings/OfflineStorageScreen.tsx`, `/settings/offline-storage`)

Native-only (redirects to `/settings` on web — nothing device-specific to manage there). Fully
functional for measurement; "Remove from device" is wired directly to the tested safety check above
— there is no bypass. Terminology: "Remove from device" / "Available online" / "Download for
offline use," never "Delete Project" (that is a different, unrelated, server-destructive action).
Uses only real fields: project `status`, `closedAtUtc`, and the project record's own `syncedAt` as
"Last synced" — there is no "last opened on this device" tracking today, so that label is never
shown (a per-device open-tracking hook would be simple to add later, but does not exist yet).

## Sync storage warning (Phase 1H)

`OfflineReadinessPanel.tsx`'s "Sync & download" button is the one UI entry point explicitly framed
as a deliberate full field-data refresh, and its `triggerSync({ forceDownload: true })` call
removes the normal prefetch byte/file caps entirely (`getBootstrapPrefetchLimits(force=true)` in
`syncPolicy.ts`). At HIGH/CRITICAL storage health, tapping it now shows a warning (with the real
usage figure) before proceeding, with a "Continue Anyway" escape hatch — never a silent block, and
a failed health check itself fails open (never blocks the sync the user asked for).

**Uploading pending local work is never gated by this.** `reconnectAndFlushNow()` (the upload half
of `triggerSync()`) always runs regardless of this warning; the warning only ever delays/confirms
the download half.

**Scope note:** two other UI entry points (`SyncStatusBadge`'s topbar tap, `SyncCenterPage`'s "Sync
Now" button) call the same `triggerSync()` with the same `forceDownload` default, but were
deliberately left unwarned — they are the routine, frequently-tapped actions users rely on to flush
their own pending uploads instantly, and interrupting those on every tap at WARNING/HIGH would
itself become the kind of friction the audit's "do not block normal sync" instruction was guarding
against. Worth reconsidering in a later phase with real usage data.

## Known O(N) call sites (documented, not touched — future performance PR)

The audit found these call IndexedDB's unindexed `getAll()` (full-store scan). This feature does
call a few of these deliberately — `entityGetAllProjects()` (once, for the whole project list any
screen like this needs, and again inside `projectDiscardService.ts`'s shared-resource reference
check, to enumerate "every other locally-cached project"), `pendingGetAll()`, and
`droppedActionsGetAll()` (the sync queue and dropped-action log have no per-project index, so a
project's own blockers are filtered out of the full list in memory) — accepted for Phase 1 because
these lists are small (device-local project/queue counts, not server-wide data) and every other
per-project lookup this feature adds (`entityGetAssetRecordsByProject`, `storageManifestGetBy*`,
etc.) IS indexed. The sites below are the ones the audit found elsewhere in the app, untouched by
this feature:

- `entityGetAllWorkflowRuns()` / `entityGetAllAssets()` / `entityGetAllProjects()` — `assetWorkflowRunService.ts` (~L875, ~L1005), `projectAssetService.ts` (~L162, ~L968, ~L1024), `useSyncTelemetry.ts` (~L114-116), `syncConflictProbe.ts` (~L40)
- `entityGetAllIssues()` — `IssueRepository.ts` (~L43, ~L62, ~L68), `useSyncEngine.ts` (~L492)
- `entityGetAllAssets()` — `AssetRepository.ts` (~L43)

## Deferred to a later phase (not implemented here, per instruction)

- Discarding individually-synced photos/videos, downloaded reports, workflow history, thumbnails/cache (Phase 2)
- Other offices, automatic retention rules, admin-managed policy, Wi-Fi-only downloads, on-demand media (Phase 3)
- Admin/device storage dashboard, proactive telemetry, storage-pressure notifications, policy enforcement (Phase 4)
- Server telemetry payload (userId/deviceId/storageHealth/etc.) — no backend change in this PR

## Known gaps requiring an owner decision

1. **No native device free/total space API** — see "Storage health" above. Options: (a) a small
   custom Capacitor plugin (the codebase already has two precedents —
   `ios/App/App/LocalMediaServerPlugin.swift`, `SyncKeepAlivePlugin.java`), (b) a different
   community plugin (unverified — must be inspected the same way `@capacitor/device` was, never
   assumed), or (c) accept budget-only health indefinitely.
2. **"Last used" (per-device open tracking)** does not exist and was not invented — the screen
   shows "Last synced" instead, which is real data.
