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
| 5 | Characterisation tests for `AssetInstallationPage.tsx` | Pending | Before first S8 extraction |
| 6 | Characterisation tests for `Dashboard.tsx` | Pending | Before first S8 extraction |

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

## Verification command

```bash
npm test
dotnet test server/Commtrac.Api.Tests/Commtrac.Api.Tests.csproj
```

## Next S3 PRs

1. **God-file characterisation** — one PR per file, snapshot/key interaction tests only
   (`AssetInstallationPage.tsx`, then `Dashboard.tsx`)
