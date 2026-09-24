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

**Device free/total space now comes from a repo-owned Capacitor plugin** — see "Native device
capacity" below. The earlier blocker is resolved: `@capacitor/device@8.0.3` was installed, inspected
against its own shipped type definitions, found to have no disk-space fields at all (only `memUsed`,
app memory), and removed again (net dependency change: zero). Rather than adopt an unvetted
third-party plugin, the bridge was written in this repo against the platform APIs directly. On web/PWA
`WEB_QUOTA_ESTIMATE` via `navigator.storage.estimate()` remains a browser origin quota and is still
explicitly never presented as device free space. When the native plugin is missing or fails, health
degrades to "budget-only" mode exactly as before.

## Native device capacity (`DeviceStorage` plugin)

A small, repo-owned Capacitor plugin — no third-party dependency — reports the real capacity of the
filesystem N-Go's app data lives on. JS bridge: `src/services/nativePlugins/deviceStorage.ts`
(`DeviceStorage.getStorageInfo() -> { totalBytes, freeBytes }`, **bytes only**, never formatted
strings or percentages).

| | Android | iOS |
|---|---|---|
| Source | `android/app/.../DeviceStoragePlugin.java` | `ios/App/App/DeviceStoragePlugin.swift` |
| API | `android.os.StatFs` — `getTotalBytes()` / `getAvailableBytes()` | `URL.resourceValues` — `.volumeTotalCapacityKey` / `.volumeAvailableCapacityForImportantUsageKey` (fallback `.volumeAvailableCapacityKey`) |
| Filesystem measured | `Context.getFilesDir()` — the app's **internal** data volume | the volume containing the app's documents directory |
| Registration | `registerPlugin(DeviceStoragePlugin.class)` in `MainActivity.onCreate()` | `bridge?.registerPluginInstance(DeviceStoragePlugin())` in `ViewController.capacitorDidLoad()` |
| Permission required | **none** | **none** |

Notes:

- **Android** measures `getFilesDir()`, not external/removable storage: an SD card's free space says
  nothing about whether N-Go can write. `getTotalBytes()`/`getAvailableBytes()` (API 18+, well under
  minSdk 24) replace the deprecated `getBlockCount() * getBlockSize()` multiplication, which also
  overflows `int` on large volumes. No manifest entry, no runtime permission, no file enumeration.
- **iOS** deliberately prefers `volumeAvailableCapacityForImportantUsage` over raw free bytes. That
  figure **includes space the system can reclaim** by purging caches/offloadable content, so it can
  exceed a naive free-space reading — which is the point: it is Apple's documented answer to "can I
  store something the user asked for," and therefore a better operational estimate of what N-Go can
  still write than a raw number that would call a device full while iOS still holds purgeable data.
- **These figures are not byte-perfect or directly comparable across OSes.** They are two different
  vendors' answers to "how much room is there," measured on different filesystems with different
  reclamation semantics. They are good enough to drive a health level; they are not an audit.
- **Fallback:** plugin absent (e.g. an older native build), platform unsupported, a bridge exception,
  or a malformed response → `UNAVAILABLE` → budget-only health. Validation lives in
  `isValidNativeStorageInfo()` (`deviceStorageCapability.ts`), which rejects NaN/Infinity/negatives/
  non-numbers/non-positive totals. It deliberately does **not** clamp `freeBytes > totalBytes`: that
  would silently normalize a malformed reading into a healthy-looking one, and every device rule is a
  `<= threshold` comparison, so an over-large free figure can never manufacture a false CRITICAL.
- **Privacy:** the plugin returns two integers. No filenames, directory contents, photos, user
  documents, other apps, identifiers, or personal data; no iCloud query; no new permission prompt.

Once a real `deviceTotalBytes` arrives, `computeNGoBudgetBytes()` switches itself off the fixed 5 GB
fallback and onto the device-relative formula (5% of device total, clamped to [2 GB, 20 GB]) with no
other change — see `deviceStorageHealth.integration.test.ts`, which exercises that whole chain.

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

1. ~~**No native device free/total space API**~~ — **RESOLVED** by the repo-owned `DeviceStorage`
   plugin (option (a), the custom-plugin route, following the `LocalMediaServerPlugin.swift` /
   `SyncKeepAlivePlugin.java` precedents). See "Native device capacity" above.
2. **The percentage rule and the absolute rule can disagree sharply on large devices.** Now that
   real capacity is available, this is observable rather than theoretical: a 512 GB phone with
   40 GB free is **7.8% free → CRITICAL** on the percentage rule, even though 40 GB is objectively
   plenty of room for N-Go to keep working. A real measured example from the iOS Simulator during
   this work: 372.5 GB total / 21.7 GB available = 5.8% → CRITICAL. This behavior is **left exactly
   as approved and was not silently tuned**; it is asserted as-is in
   `deviceStorageHealth.integration.test.ts` so any future change is deliberate. Owner decision
   needed on whether the percentage rule should be skipped (or its threshold lowered) once absolute
   free space is comfortably above the absolute tier — e.g. requiring BOTH signals on large devices.
3. **"Last used" (per-device open tracking)** does not exist and was not invented — the screen
   shows "Last synced" instead, which is real data.
