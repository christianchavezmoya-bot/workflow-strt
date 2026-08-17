# S3 — Test foundation (in progress)

Stage **S3** of [`EXCELLENCE_PROGRAMME.md`](./EXCELLENCE_PROGRAMME.md): characterise critical behaviour
**before** any god-file extraction. Class 0 — tests pin current behaviour including quirks.

## Priority order (from remediation Phase 3)

| # | Area | Status | Tests |
|---|---|---|---|
| 1 | Workflow completion + blocking-issue **422** | **Done (PR 1)** | `server/Commtrac.Api.Tests/AssetWorkflowRunCompleteTests.cs` |
| 2 | Two-tier permission model | **Done (PR 1 + PR 2)** | `src/utils/rolePermissionsResolve.test.ts`, `src/hooks/usePermissions.test.tsx` |
| 3 | Offline queue temp-ID → server-ID remap | **Done (PR 1)** | `src/services/syncQueue.replaceReferences.test.ts` |
| 4 | Backend controller tests (workflow endpoints beyond complete) | **Done (PR 2)** | `server/Commtrac.Api.Tests/AssetWorkflowRunProgressTests.cs` |
| 5 | Characterisation tests for `AssetInstallationPage.tsx` | **Done (PR 3)** | `src/features/installations/assetInstallationPageLogic.test.ts` |
| 6 | Characterisation tests for `Dashboard.tsx` | **Done (PR 4)** | `src/features/dashboard/dashboardPageLogic.test.ts` |

## What PR 1 pins

### Workflow complete (server)

- `POST /api/asset-workflow-runs/{id}/complete` returns **422** when `issuesJson` contains
  `isBlocking: true` and `resolved: false`
- Non-blocking open issues do **not** block completion
- Resolved blocking issues allow completion
- Response body includes `blockingCount` and a human-readable `message`

### Permissions (client)

Pure helpers extracted to `src/utils/rolePermissionsResolve.ts` (used by `usePermissions`):

- Saved domain configs merge with `defaultDomains()` for fields added after a role was saved
- Settings access OR-merges Tier 1 `createDeleteTables` (admin cannot be locked out by saved false)
- `viewOnly` hard-lock strips delete and workflow-authoring even if admin saved true
- Role fallbacks: Installer vs Admin vs Supervisor behaviour

### Sync queue (client)

- `replaceRunIdReferences` — rewrites `entityId`, `serverEntityId`, and `url`
- `replaceEntityReferences` — broader match (entityId, url substring, serverEntityId)
- `replaceEntityId` — exact entityId match only

## What PR 2 pins

### Workflow progress save (server)

- `PUT /api/asset-workflow-runs/{id}` persists `stepResultsJson`
- Open issues in the payload set linked asset status to **Issue**
- Resolving the last open issue on an active run clears asset status back to **InProgress**
- Locked runs reject progress save with **400**

### Issue patch (server)

- `PATCH /api/asset-workflow-runs/{id}/issues` sets asset **Issue** when open issues remain
- Closing the last open issue on an **active** run clears asset **Issue** (regression guard for Bug 1)
- On a **locked** run, resolving all issues reflects signature status (e.g. **Signed** → **Closed**)

Shared fixtures: `server/Commtrac.Api.Tests/WorkflowRunTestHelpers.cs`

### Permissions hook (client)

- `permissionsReady` stays false until role-config API settles and user id is non-empty
- Saved role config merges with admin fallback (settings OR-merge)
- User identity change clears role-config cache and re-fetches

## What PR 3 pins

### AssetInstallationPage pure logic (client)

Extracted to `src/features/installations/assetInstallationPageLogic.ts` (Class 0 — behaviour unchanged):

- `resolveConfigWorkflowTypeId` — FK first, then configType name match
- `workflowTypeMismatchMessage` — inspection vs installation pairing warnings
- `projectHasInspection` — INSPECTION_ONLY and MIXED modes
- `computeHealth` / `assetHasConfiguredWorkflow` — tab health counts
- `tabDotColor` — issue > complete > in-progress priority
- `nextDraftConfigNumber` — draft config auto-numbering
- `loadColumnConfig` — localStorage column order merge + force-visible columns
- `timeAgo` — sync timestamp labels
- `operationsStickyPrefixSx` — sticky column styles (native vs web)

## What PR 4 pins

### Dashboard pure logic (client)

Extracted to `src/features/dashboard/dashboardPageLogic.ts` (Class 0 — behaviour unchanged):

- `pickActiveRunForAttention` — offline-run ghost suppression + signature gate
- `dashboardStatusChip` — lightweight list status vocabulary (Issue → red In Progress)
- My Jobs card mapping — `myJobsCardActionFromDisplayState`, helper text, compact labels
- `assetLikelyHasWorkflow`, `myJobsAssetIdsKey`
- Signature stage labels, workflow mode labels, history chip colors
- Project visibility filter — `isDashboardVisibleProjectStatus`
- Status normalisation helpers (`isPausedAsset`, `isInProgressAsset`, etc.)

**Dedup:** Dashboard now imports `resolveConfigWorkflowTypeId` from `assetInstallationPageLogic.ts` (removed duplicate copy).

## S3 complete

All six priority items above are pinned. God-file extractions in **S8** can proceed with these characterisation tests as the safety net.

## Verification command

```bash
npm test
dotnet test server/Commtrac.Api.Tests/Commtrac.Api.Tests.csproj
```

## After S3

Proceed to **S4** (dependency upgrades) or begin **S8** god-file extractions — characterisation tests are in place for both god files.
