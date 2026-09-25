# Mobile Sync Observability Diagnostics

Makes "the phone says pending but nothing is syncing" answerable from a Sync Support Bundle,
without changing a single sync decision. Branch: `feat/sync-observability-diagnostics`.

## Core design principle

**This is OBSERVABILITY ONLY.** Everything documented here records what the sync engine and the
stale-asset guard already decided. None of it is ever read back by that logic, and none of it
influences behavior. Specifically, nothing here changes: queue ordering, dependency semantics,
queue eligibility decisions, retry timing/counts, `nextRetryAt`, which network requests are made,
timeout policy, circuit-breaker behavior, run bundling, signature ordering, conflict handling,
stale-asset reconciliation decisions, known-missing/tombstone decisions, asset deletion, dashboard
behavior, offline bootstrap, SSE, the API, or the database schema.

**A diagnostics failure must never become a sync failure.** Every write is best-effort, bounded,
and swallows its own errors, so it cannot throw into the flush loop or an asset fetch. This is
covered by explicit regression tests (a closed IndexedDB handle, a rejecting cache write).

All of it is **native-only** (`isMobileNativePlatform()`), matching the rest of the offline stack;
on web these functions are no-ops that return empty/null.

## What is recorded

### 1. Queue eligibility, per action (`pending_actions`)

`pendingRecordEligibility()` (`src/services/localDB.ts`) writes `lastEligibilityCheckAt`,
`lastEligible`, `lastSkipReason`, and — where relevant — `lastDependencyExists`,
`lastDependencyOpType`, `lastDependencyStatus`, `lastBundleCandidate` onto the queue row.

It is deliberately **narrower than the other `pending*` mutators**: unlike `pendingSetStatus` /
`pendingMarkRetry` / `pendingMarkConflict`, it never touches `status`, `retries`, or `nextRetryAt`,
and never dispatches `sync-pending-changed` — so it cannot add UI churn or nudge the retry
schedule. A regression test seeds a row mid-backoff (`status: "failed"`, `retries: 3`, a future
`nextRetryAt`) and asserts all three survive the diagnostic write untouched.

`QueueEligibilitySkipReason` was audited against the **current** flush loop, not inherited:

| Reason | Flush-loop condition |
| --- | --- |
| `DEPENDENCY_PENDING` | `dependsOnOpId` is still present in the queue |
| `DEPENDENCY_DROPPED` | the dependency permanently failed (`dropped_actions`) |
| `BUNDLED_WITH_RUN_COMPLETE` | `SIGNATURE_SUBMIT` deferred to flush atomically via `RUN_BUNDLE` |
| `EARLIER_OP_DROPPED_THIS_PASS` | an earlier op for the same run was rejected this pass |
| `CONFLICT_ALREADY_FLAGGED` | `conflictDetected`, and not auto-cleared by phone-wins field sync |
| `ASSET_CONCURRENCY_CONFLICT` | the pre-write snapshot check found a newer server version |
| `MEDIA_MISSING` | referenced local media file(s) were not found on disk |

`MEDIA_MISSING` is a real skip path in the current engine, and the reason strings
`DEPENDENCY_DROPPED` / `MEDIA_MISSING` intentionally match the literals the flush loop already
passes to `syncDiagnosticAppend`.

Immediately before the actual `api.request()` — after every skip check has passed — the action is
marked `lastEligible: true` with the previous skip reason cleared. That is the point that
distinguishes "never attempted" from "attempted and failed."

### 2. Last flush pass (`src/services/flushPassDiagnostics.ts`)

One **overwrite-only** record (not a growing history) under a single cache key. Captured at the
start of a pass that has real due work: `canAttemptSyncFlush`, `serverReachable`,
`hasNetworkSignal`, `circuitOpen`, `circuitOpenUntilMs`, `circuitFailureCount`, `dueCount`, and the
ordered due list (`id`, `opType`, `entityId`, `entityType`, `status`). Patched at the end with
`attemptedCount`, `syncedCount`, `stoppedEarly`, `stoppedAtActionId`, `stoppedReason`
(`NETWORK_ERROR_BROKE_LOOP:<opType>` or `AUTH_EXPIRED`).

Passes that find an **empty** due list are not recorded. `flush()` runs on every visibility change,
reconnect and hook mount, so recording empty probes would both overwrite the last meaningful pass
and add pointless IndexedDB writes. This matches the engine's own existing `due.length > 0` gate
for advertising "syncing".

### 3. Stale-asset reconciliation and fetch traces (`src/utils/staleAssetDiagnostics.ts`)

`buildReconcileTrace()` is **pure** and runs immediately *before* the real, unmodified
`reconcileKnownMissingAssetIds()` call in `dashboardWorkspace()`; `recordReconcilePass()` runs
immediately *after* it and reads the result through `isKnownMissingAssetId`. The reconcile call
itself is untouched and sits between them. Per traced id: `assetId`, `knownMissingBefore`,
`presentInWorkspace`, `workspaceSection`, `knownMissingAfter`, `markerCleared`. Only ids already
known-missing are traced — every other id is irrelevant to the guard — and no asset payloads are
stored. Capped at the **10** most recent passes.

`recordFetchAttempt()` records `timestamp`, `assetId`, `knownMissingAtCallTime`, `source`
(`getById` | `verifyAssetExistsOnline`) alongside the existing `GET /project-assets/{id}` calls.
It captures **no** request body, auth token, API response, asset content, or personal data — a test
asserts the record has exactly those four keys. Capped at the **100** most recent attempts.

`getKnownMissingAssetIdsSnapshot()` (`src/utils/staleAssetIds.ts`) returns a fresh array copy each
call, so a diagnostics consumer cannot mutate what the guard actually blocks.

## Storage cost

No migration, no new object store, no server persistence. Everything rides the existing
`offlineStore` cache (`saveCache`/`getCache`) plus fields on existing `pending_actions` rows. The
flush record overwrites; both traces are hard-capped. Total footprint is a few KB.

## Support bundle

`buildSyncSupportBundle()` gains `circuitBreaker`, `lastFlushPass`, `knownMissingAssetIds`,
`staleAssetReconcileTrace`, and `staleAssetFetchTrace`, fetched in the existing `Promise.all`. The
per-action eligibility fields reach the bundle through the **existing** `COPY_ALLOWLIST`
sanitization in `src/utils/syncDiagnostics.ts` — they are all scalars/enums, no payload content.
Existing privacy guarantees are unchanged and re-tested: URLs are still stripped of
`token`/`ticket`/`access_token`/`refresh_token`, and request bodies, optimistic patches, and photo
data never appear in the serialized bundle. `buildIdentity` remains present.
