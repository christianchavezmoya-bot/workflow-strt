# S3 — Test foundation (in progress)

Stage **S3** of [`EXCELLENCE_PROGRAMME.md`](./EXCELLENCE_PROGRAMME.md): characterise critical behaviour
**before** any god-file extraction. Class 0 — tests pin current behaviour including quirks.

## Priority order (from remediation Phase 3)

| # | Area | Status | Tests |
|---|---|---|---|
| 1 | Workflow completion + blocking-issue **422** | **Done (PR 1)** | `server/Commtrac.Api.Tests/AssetWorkflowRunCompleteTests.cs` |
| 2 | Two-tier permission model | **Done (PR 1)** | `src/utils/rolePermissionsResolve.test.ts` |
| 3 | Offline queue temp-ID → server-ID remap | **Done (PR 1)** | `src/services/syncQueue.replaceReferences.test.ts` |
| 4 | Backend controller tests (workflow endpoints beyond complete) | Pending | — |
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

## Verification command

```bash
npm test
dotnet test server/Commtrac.Api.Tests/Commtrac.Api.Tests.csproj
```

## Next S3 PRs

1. **Workflow progress save** — step results persist, issue patch, asset status side effects
2. **`usePermissions` hook integration** — mock role-config API + `permissionsReady` gate
3. **God-file characterisation** — one PR per file, snapshot/key interaction tests only
